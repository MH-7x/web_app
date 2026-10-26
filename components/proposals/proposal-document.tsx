import { Globe, Mail, Phone } from "lucide-react"

import { Markdown } from "@/components/content/markdown"
import type { BusinessSettings } from "@/lib/business-types"

/** Your photo, shown on the cover and the contact page. */
export const PROFILE_PHOTO = "/proposal/profile.jpg"

type Block = { title?: string; markdown: string }
type Section = { title: string; blocks: Block[] }
/** One printed page: a section, or a slice of a section whose table is too long for one sheet. */
type Page = { section: number; title: string; continued: boolean; blocks: Block[] }

/** Table rows that fit on a page that also carries the title and some text, and on a continuation page. */
const FIRST_PAGE_ROWS = 8
const NEXT_PAGE_ROWS = 11

const isRow = (line: string) => line.trim().startsWith("|") && line.indexOf("|", line.indexOf("|") + 1) > 0
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

/** Cut a long table into slices that each fit on a sheet. Anything before the table stays with the first, anything after with the last. */
function splitLongTable(markdown: string): string[] {
  const lines = markdown.split("\n")
  const at = lines.findIndex((l, i) => isRow(l) && isDivider(lines[i + 1] ?? ""))
  if (at < 0) return [markdown]
  let end = at + 2
  while (end < lines.length && isRow(lines[end])) end++
  const rows = lines.slice(at + 2, end)
  if (rows.length <= FIRST_PAGE_ROWS) return [markdown]

  const head = lines.slice(at, at + 2)
  const before = lines.slice(0, at)
  const after = lines.slice(end)
  const slices = [rows.slice(0, FIRST_PAGE_ROWS)]
  for (let i = FIRST_PAGE_ROWS; i < rows.length; i += NEXT_PAGE_ROWS) slices.push(rows.slice(i, i + NEXT_PAGE_ROWS))
  return slices.map((r, i) => [...(i === 0 ? before : []), ...head, ...r, ...(i === slices.length - 1 ? ["", ...after] : [])].join("\n"))
}

/**
 * The generated markdown is split on its "##" headings into sections. "Next Steps" shares the Timeline page, which keeps
 * short sections from leaving a nearly empty sheet. Text without headings becomes a single section.
 */
function sectionsOf(markdown: string): Section[] {
  const parts: { title: string; lines: string[] }[] = []
  const intro: string[] = []
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^##\s+(.*?)\s*$/.exec(line)
    if (h) parts.push({ title: h[1].replace(/[*_`]/g, ""), lines: [] })
    else if (parts.length) parts[parts.length - 1].lines.push(line)
    else intro.push(line)
  }
  if (!parts.length) return markdown.trim() ? [{ title: "Proposal", blocks: [{ markdown: intro.join("\n") }] }] : []

  const out: Section[] = []
  for (const p of parts) {
    const body = p.lines.join("\n").trim()
    const last = out[out.length - 1]
    if (/^next steps$/i.test(p.title) && last) last.blocks.push({ title: p.title, markdown: body })
    else out.push({ title: p.title, blocks: [{ markdown: body }] })
  }
  if (intro.join("").trim()) out[0].blocks.unshift({ markdown: intro.join("\n").trim() })
  return out
}

function pagesOf(sections: Section[]): Page[] {
  return sections.flatMap((s, i): Page[] => {
    const [main, ...rest] = s.blocks
    const slices = splitLongTable(main.markdown)
    return slices.map((md, k) => ({
      section: i,
      title: s.title,
      continued: k > 0,
      // the other blocks of the section (Next Steps) follow the last slice
      blocks: [{ ...main, markdown: md }, ...(k === slices.length - 1 ? rest : [])],
    }))
  })
}

const num = (i: number) => String(i + 1).padStart(2, "0")

function Header({ business, dateLabel }: { business: BusinessSettings; dateLabel: string }) {
  return (
    <div className="pp-top">
      <span>
        {business.businessName}
        {business.tagline && <small>{business.tagline}</small>}
      </span>
      <span className="pp-date">{dateLabel}</span>
    </div>
  )
}

/**
 * The proposal as the client sees it: a cover, a contents page, one designed page per section and a contact page.
 * It is always drawn as white A4 paper, whatever the app theme, so what is on screen is what prints.
 */
export function ProposalDocument({ clientName, projectName, markdown, business, dateLabel }: { clientName: string; projectName: string; markdown: string; business: BusinessSettings; dateLabel: string }) {
  const sections = sectionsOf(markdown)
  const pages = pagesOf(sections)
  const hasToc = sections.length > 1
  const firstContentPage = hasToc ? 3 : 2
  const contact = [
    { icon: Phone, text: business.phone },
    { icon: Mail, text: business.email },
    { icon: Globe, text: business.website },
  ].filter((c) => c.text)

  return (
    <article className="pp-doc">
      {/* cover */}
      <section className="pp-page pp-hero" aria-label="Cover">
        <div className="pp-sheet pp-display">
          <Header business={business} dateLabel={dateLabel} />
          <div className="mt-auto" style={{ paddingBottom: "7cqw" }}>
            <span className="pp-rule" aria-hidden />
            <h1 className="pp-title" style={{ fontSize: "11.5cqw" }}>
              Project
              <br />
              Proposal<span className="pp-arrow">↗</span>
            </h1>
            <p className="pp-subtitle" style={{ marginTop: "3cqw" }}>
              {projectName}
            </p>
          </div>
          <div className="pp-foot" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "4cqw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PROFILE_PHOTO} alt={business.businessName} className="pp-photo pp-avatar" style={{ width: "11cqw", height: "11cqw", borderRadius: "999px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3cqw", flex: 1 }}>
              <div>
                <p className="pp-label">Prepared by :</p>
                <p className="pp-value">{business.businessName}</p>
              </div>
              <div>
                <p className="pp-label">Prepared for :</p>
                <p className="pp-value">{clientName}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* contents */}
      {hasToc && (
        <section className="pp-page pp-dark" aria-label="Table of contents">
          <div className="pp-sheet pp-display">
            <h2 className="pp-toc-title">Table of Contents</h2>
            <ol className="pp-toc">
              {sections.map((s, i) => (
                <li key={i}>
                  <span>{num(i)}</span>
                  <span>{[s.title, ...s.blocks.flatMap((b) => (b.title ? [b.title] : []))].join(" & ")}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* one page per section (more when a table is long) */}
      {pages.map((pg, i) => (
        <section key={i} className={`pp-page${/summary/i.test(pg.title) ? " pp-summary" : ""}`} aria-label={pg.continued ? `${pg.title} (continued)` : pg.title}>
          <div className="pp-sheet">
            <Header business={business} dateLabel={dateLabel} />
            <div className="pp-section">
              <p className="pp-kicker pp-display">
                <span>
                  {num(pg.section)} — {pg.continued ? "Continued" : "Section"}
                </span>
              </p>
              <h2 className="pp-title pp-display">{pg.title}</h2>
              {pg.blocks.map((b, j) => (
                <div key={j}>
                  {b.title && (
                    <h3 className="pp-h2 pp-display">
                      <span className="pp-ring" aria-hidden>
                        →
                      </span>
                      {b.title}
                    </h3>
                  )}
                  <div className="pp-body">
                    <Markdown source={b.markdown} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pp-pagefoot" aria-hidden>
              <span>
                {business.businessName} · Proposal for {clientName}
              </span>
              <span>{String(firstContentPage + i).padStart(2, "0")}</span>
            </div>
          </div>
        </section>
      ))}

      {/* closing */}
      <section className="pp-page pp-hero" aria-label="Contact">
        <div className="pp-sheet pp-display">
          <Header business={business} dateLabel={dateLabel} />
          <div className="mt-auto" style={{ paddingBottom: "6cqw" }}>
            <span className="pp-rule" aria-hidden />
            <h2 className="pp-title" style={{ fontSize: "9.5cqw" }}>
              Let&apos;s Work
              <br />
              Together<span className="pp-arrow">↗</span>
            </h2>
            {business.terms && (
              <div className="pp-terms" style={{ fontFamily: "var(--font-sans), sans-serif" }}>
                <strong>Terms and conditions</strong>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{business.terms}</p>
              </div>
            )}
          </div>
          <div className="pp-foot" style={{ marginTop: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "4cqw" }}>
            <div>
              <p className="pp-value">Contact Us</p>
              {contact.length > 0 ? (
                <ul className="pp-contact">
                  {contact.map(({ icon: Icon, text }) => (
                    <li key={text}>
                      <Icon aria-hidden />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pp-label" style={{ marginTop: "2cqw" }}>
                  {business.businessName}
                </p>
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PROFILE_PHOTO} alt={business.businessName} className="pp-photo pp-avatar" style={{ width: "19cqw", height: "19cqw", borderRadius: "2cqw" }} />
          </div>
        </div>
      </section>
    </article>
  )
}
