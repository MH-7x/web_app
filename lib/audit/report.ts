import { GROUPS } from "@/lib/audit/groups"
import type { AuditPayloadV2, AuditScoresV2, CheckResult, CheckStatus, KeywordCheck, RecommendationV2 } from "@/lib/audit/types"

/** Readable exports of a v2 audit: Markdown and a self-contained HTML page. JSON is the stored audit as-is. */

export type ReportInput = {
  clientName: string
  url: string
  createdAt: Date
  scores: AuditScoresV2
  payload: AuditPayloadV2
  recommendations: RecommendationV2[]
  keywordChecks?: KeywordCheck[]
}

const STATUS_LABEL: Record<CheckStatus, string> = { pass: "Pass", warning: "Warning", fail: "Fail", not_checked: "Not checked" }
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const
const when = (d: Date) => `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d)} UTC`
const groupLabel = (id: string) => GROUPS.find((g) => g.id === id)?.label ?? id
const ms = (v: number | null) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

const KW_COLS = [
  ["Title", "inTitle"],
  ["H1", "inH1"],
  ["First 100 Words", "inFirst100"],
  ["URL", "inUrl"],
  ["Meta Desc", "inMeta"],
] as const
const decoded = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
const kwPage = (k: KeywordCheck) => (k.url === "/" ? "/ (homepage)" : decoded(k.url))

const checksOf = (r: ReportInput, group: string) => r.payload.checks.filter((c) => c.group === group)

function urlsOf(c: CheckResult) {
  return c.groups?.length ? c.groups.flatMap((g) => [`${g.label}:`, ...g.urls.map((u) => `  ${u}`)]) : c.urls
}

/* ---------------------------------------------------------------- Markdown */

export function reportMarkdown(r: ReportInput): string {
  const { scores, payload } = r
  const out: string[] = []
  out.push(`# SEO audit: ${r.clientName}`, "", `**${scores.verdict}**`, "", `- Site: ${r.url}`, `- Report generated: ${when(r.createdAt)}`, `- Overall: **${scores.overall}/100 (${scores.grade})**`, `- Pages audited: ${scores.pages}${scores.truncated ? ` (crawl limit of ${scores.config.maxPages} reached)` : ""}`, `- Confidence: ${scores.confidence}`)
  if (scores.config.targetKeyword) out.push(`- Target keyword: ${scores.config.targetKeyword}${scores.config.targetUrl ? ` on ${scores.config.targetUrl}` : ""}`)
  out.push(`- Business type: ${payload.crawl.isServiceAreaBusiness ? "service-area business (no street address found on the site)" : `address found on the site: ${payload.crawl.addressFound}`}`)

  if (payload.crawl.confidenceNotes.length) out.push("", "## Confidence notes", "", ...payload.crawl.confidenceNotes.map((n) => `- ${n}`))

  out.push("", "## Grades", "", "| Group | Score | Grade | Pass | Warning | Fail | Not checked |", "|---|---|---|---|---|---|---|")
  for (const g of GROUPS) {
    const s = scores.groups[g.id]
    out.push(`| ${g.label} | ${s.score ?? "n/a"} | ${s.grade ?? "-"} | ${s.passed} | ${s.warnings} | ${s.failed} | ${s.notChecked} |`)
  }

  if (r.keywordChecks?.length) {
    out.push("", "## Keyword optimization by page", "", `| Page | Keyword | ${KW_COLS.map(([l]) => l).join(" | ")} | Score |`, `|---|---|${KW_COLS.map(() => "---|").join("")}---|`)
    for (const k of r.keywordChecks) out.push(k.found ? `| ${kwPage(k)} | ${k.keyword} | ${KW_COLS.map(([, key]) => (k[key] ? "✓" : "✗")).join(" | ")} | ${k.score}/5 |` : `| ${kwPage(k)} | ${k.keyword} | Page not found during crawl |||||| 0/5 |`)
  }

  out.push("", "## Prioritised recommendations", "")
  if (!r.recommendations.length) out.push("Nothing to fix.")
  for (const p of ["high", "medium", "low"] as const) {
    const recs = r.recommendations.filter((x) => x.priority === p)
    if (!recs.length) continue
    out.push(`### ${PRIORITY_LABEL[p]} priority`, "")
    recs.forEach((x, i) => {
      out.push(`${i + 1}. **${x.action}** (${groupLabel(x.group)})`, `   - Fix: ${x.fix}`)
      if (x.urls.length) out.push(`   - Affected: ${x.urls.slice(0, 8).join("; ")}${x.urls.length > 8 ? `; +${x.urls.length - 8} more` : ""}`)
    })
    out.push("")
  }

  out.push("## Results by group", "")
  for (const g of GROUPS) {
    const rows = checksOf(r, g.id)
    if (!rows.length) continue
    const s = scores.groups[g.id]
    out.push(`### ${g.label}: ${s.score ?? "not graded"}${s.grade ? ` (${s.grade})` : ""}`, "", `_${g.why}_`, "", "| Status | Check | Detected | Explanation |", "|---|---|---|---|")
    for (const c of rows) out.push(`| ${STATUS_LABEL[c.status]} | ${c.name} | ${c.value.replace(/\|/g, "\\|")} | ${c.message.replace(/\|/g, "\\|")} |`)
    out.push("")
    for (const c of rows.filter((x) => x.status === "warning" || x.status === "fail")) {
      const u = urlsOf(c)
      if (!u.length) continue
      out.push(`**${c.name}**`, "", ...u.slice(0, 15).map((x) => (x.startsWith("  ") ? `  - ${x.trim()}` : `- ${x}`)), ...(u.length > 15 ? [`- … and ${u.length - 15} more`] : []), "")
    }
  }

  out.push("## Speed (Lighthouse lab data)", "")
  if (!scores.lighthouse.length) out.push("Lighthouse did not run.")
  else {
    out.push("| Page | Device | Score | FCP | Speed Index | LCP | TBT | CLS |", "|---|---|---|---|---|---|---|---|")
    for (const l of scores.lighthouse) out.push(`| ${new URL(l.url).pathname || "/"} | ${l.device} | ${l.score} | ${ms(l.fcpMs)} | ${ms(l.speedIndexMs)} | ${ms(l.lcpMs)} | ${ms(l.tbtMs)} | ${l.cls?.toFixed(2) ?? "n/a"} |`)
    const opps = scores.lighthouse[0]?.opportunities ?? []
    if (opps.length) out.push("", "Biggest opportunities on the homepage:", ...opps.slice(0, 6).map((o) => `- ${o.title}${o.savingsMs ? ` (about ${ms(o.savingsMs)})` : ""}`))
  }

  out.push("", "## Real-user Core Web Vitals (Chrome UX Report)", "")
  if (scores.crux?.unavailable && !scores.crux.records.length) out.push(`Not checked: ${scores.crux.unavailable}`)
  else if (scores.crux) for (const rec of scores.crux.records) out.push(`- ${rec.device} (${rec.scope === "origin" ? "whole site" : "page"}): LCP ${rec.lcp?.p75 != null ? ms(rec.lcp.p75) : "n/a"}, INP ${rec.inp?.p75 != null ? ms(rec.inp.p75) : "n/a"}, CLS ${rec.cls?.p75 ?? "n/a"}`)

  out.push("", "## Pages", "", "| URL | Status | Clicks from home | Issues | Warnings |", "|---|---|---|---|---|")
  for (const p of payload.pages) out.push(`| ${p.path} | ${p.status} | ${p.depth ?? "n/a"} | ${p.failures} | ${p.warnings} |`)

  if (payload.crawl.errors.length) out.push("", "## Fetch errors during the crawl", "", ...payload.crawl.errors.slice(0, 50).map((e) => `- ${e.url}: ${e.message} (${e.kind})`))
  return out.join("\n") + "\n"
}

/* -------------------------------------------------------------------- HTML */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const COLOR: Record<CheckStatus, string> = { pass: "#059669", warning: "#d97706", fail: "#dc2626", not_checked: "#6b7280" }

export function reportHtml(r: ReportInput): string {
  const { scores, payload } = r
  const badge = (s: CheckStatus) => `<span class="b" style="background:${COLOR[s]}">${STATUS_LABEL[s]}</span>`
  const groupHtml = GROUPS.map((g) => {
    const rows = checksOf(r, g.id)
    if (!rows.length) return ""
    const s = scores.groups[g.id]
    return `<section><h3>${esc(g.label)} <small>${s.score ?? "not graded"}${s.grade ? ` · ${s.grade}` : ""}</small></h3><p class="why">${esc(g.why)}</p><table><thead><tr><th>Status</th><th>Check</th><th>Detected</th><th>Explanation</th></tr></thead><tbody>${rows
      .map((c) => {
        const u = urlsOf(c)
        const detail = (c.status === "warning" || c.status === "fail") && u.length ? `<details><summary>${u.length} affected</summary><ul>${u.slice(0, 40).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""
        return `<tr><td>${badge(c.status)}</td><td>${esc(c.name)}</td><td>${esc(c.value)}</td><td>${esc(c.message)}${detail}</td></tr>`
      })
      .join("")}</tbody></table></section>`
  }).join("")

  const recs = (["high", "medium", "low"] as const)
    .map((p) => {
      const list = r.recommendations.filter((x) => x.priority === p)
      return list.length ? `<h3>${PRIORITY_LABEL[p]} priority</h3><ol>${list.map((x) => `<li><strong>${esc(x.action)}</strong> <em>(${esc(groupLabel(x.group))})</em><br>${esc(x.fix)}${x.urls.length ? `<br><small>${esc(x.urls.slice(0, 6).join("; "))}${x.urls.length > 6 ? ` +${x.urls.length - 6} more` : ""}</small>` : ""}</li>`).join("")}</ol>` : ""
    })
    .join("")

  const kwHtml = r.keywordChecks?.length
    ? `<h2>Keyword optimization by page</h2><table><thead><tr><th>Page</th><th>Keyword</th>${KW_COLS.map(([l]) => `<th>${l}</th>`).join("")}<th>Score</th></tr></thead><tbody>${r.keywordChecks
        .map((k) =>
          k.found
            ? `<tr><td>${esc(kwPage(k))}</td><td>${esc(k.keyword)}</td>${KW_COLS.map(([, key]) => `<td style="text-align:center;font-weight:700;color:${k[key] ? "#059669" : "#dc2626"}">${k[key] ? "✓" : "✗"}</td>`).join("")}<td style="text-align:center"><span class="b" style="background:${k.score === 5 ? "#059669" : k.score <= 2 ? "#dc2626" : "#d97706"}">${k.score}/5</span></td></tr>`
            : `<tr><td>${esc(kwPage(k))}</td><td>${esc(k.keyword)}</td><td colspan="${KW_COLS.length + 1}" style="color:#dc2626">Page not found during crawl</td></tr>`
        )
        .join("")}</tbody></table>`
    : ""

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEO audit: ${esc(r.clientName)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:2rem auto;padding:0 1rem;color:#1c1917}h1{margin:0 0 .25rem}h2{margin-top:2.5rem;border-bottom:1px solid #e7e5e4;padding-bottom:.3rem}small,.why{color:#78716c}table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem;font-size:14px}th,td{border:1px solid #e7e5e4;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f5f4}.b{color:#fff;border-radius:4px;padding:1px 7px;font-size:12px;white-space:nowrap}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.card{border:1px solid #e7e5e4;border-radius:8px;padding:10px}.card b{font-size:24px}.note{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin:1rem 0}details{margin-top:4px}@media print{body{max-width:none}}
</style></head><body>
<h1>SEO audit: ${esc(r.clientName)}</h1><p><strong>${esc(scores.verdict)}</strong></p>
<p><small>${esc(r.url)} · generated ${esc(when(r.createdAt))} · ${scores.pages} pages audited${scores.truncated ? ` (limit ${scores.config.maxPages})` : ""} · confidence ${scores.confidence}${scores.config.targetKeyword ? ` · target keyword “${esc(scores.config.targetKeyword)}”` : ""}</small></p>
<p>Overall <strong style="font-size:28px">${scores.overall}/100 · ${scores.grade}</strong></p>
${payload.crawl.confidenceNotes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}
<div class="cards">${GROUPS.map((g) => {
    const s = scores.groups[g.id]
    return `<div class="card"><small>${esc(g.label)}</small><br><b>${s.score ?? "–"}</b> ${s.grade ?? ""}<br><small>${s.passed} pass · ${s.warnings} warn · ${s.failed} fail · ${s.notChecked} not checked</small></div>`
  }).join("")}</div>
${kwHtml}
<h2>Prioritised recommendations</h2>${recs || "<p>Nothing to fix.</p>"}
<h2>Results by group</h2>${groupHtml}
<h2>Pages</h2><table><thead><tr><th>URL</th><th>Status</th><th>Clicks from home</th><th>Issues</th><th>Warnings</th></tr></thead><tbody>${payload.pages.map((p) => `<tr><td>${esc(p.path)}</td><td>${p.status}</td><td>${p.depth ?? "n/a"}</td><td>${p.failures}</td><td>${p.warnings}</td></tr>`).join("")}</tbody></table>
</body></html>`
}
