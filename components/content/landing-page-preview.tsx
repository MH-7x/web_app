"use client"

import { Check, Info, Plus, X } from "lucide-react"
import type { ReactNode } from "react"

import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Select, Textarea } from "@/components/ui/input"
import { CALL_LINK, WHATSAPP_LINK, contentWords, parseBlocks, parseInline } from "@/lib/landing-content"
import { compareWithCompetitors } from "@/lib/landing-requirements"
import {
  LANDING_SECTIONS,
  MAX_ALT_LENGTH,
  PLACEHOLDER,
  checkLandingPage,
  landingWordCount,
  sectionMarkdown,
  type LandingOptions,
  type LandingPage,
  type LandingSection,
} from "@/lib/landing-page-types"
import { cn } from "@/lib/utils"

/** Text with each [PLACEHOLDER: ...] marker highlighted, so a missing fact can't be missed. */
function Marked({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${PLACEHOLDER.source})`, "g"))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-200 px-1 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

function Block({ section, page, children, hint }: { section: LandingSection; page: LandingPage; children: ReactNode; hint?: ReactNode }) {
  const label = LANDING_SECTIONS.find((s) => s.id === section)!.label
  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex items-center gap-3">
          {hint}
          <CopyButton text={sectionMarkdown(page, section)} label="Copy section" />
        </div>
      </div>
      <div className="space-y-3 p-4 text-sm">{children}</div>
    </Card>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-center justify-between gap-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
        {hint}
      </p>
      <div>{children}</div>
    </div>
  )
}

function Limit({ value, max }: { value: number; max: number }) {
  return <span className={cn("font-mono normal-case tabular-nums", value > max && "font-semibold text-destructive")}>{value}/{max}</span>
}

/* ------------------------------------------------------------ editing helpers */

const replaceAt = <T,>(list: T[], i: number, item: T) => list.map((x, j) => (j === i ? item : x))
const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className="shrink-0 text-muted-foreground hover:text-destructive">
      <X />
    </Button>
  )
}

function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus /> {children}
    </Button>
  )
}

export function SeoChecklist({ page, options, lang }: { page: LandingPage; options: LandingOptions; lang: "en" | "ar" }) {
  const checks = checkLandingPage(page, options, lang)
  const failed = checks.filter((c) => c.ok === false).length
  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">SEO rules check</h3>
        <Badge variant={failed ? "destructive" : "success"}>{failed ? `${failed} to fix` : "All rules met"}</Badge>
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                c.ok === true && "bg-primary/15 text-primary",
                c.ok === false && "bg-destructive/15 text-destructive",
                c.ok === null && "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              )}
            >
              {c.ok === true ? <Check className="size-3" /> : c.ok === false ? <X className="size-3" /> : <Info className="size-3" />}
            </span>
            <span className="min-w-0">
              {c.label}
              {c.detail && <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** The page set against the figures measured on the ranking pages. Nothing is shown until competitors have been analyzed. */
export function ComparisonCard({ page, options, lang }: { page: LandingPage; options: LandingOptions; lang: "en" | "ar" }) {
  const rows = compareWithCompetitors(page, options, lang)
  if (!rows) return null
  const short = rows.filter((r) => r.status === "short").length
  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">Compared with the pages that rank</h3>
        <Badge variant={short ? "outline" : "success"}>{short ? `${short} below them` : "Matches or beats them"}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-start text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2 text-start font-medium">What</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">This page</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">Ranking pages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{r.label}</td>
                <td className={cn("px-3 py-2 font-medium tabular-nums", r.status === "short" && "text-destructive")}>{r.ours}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------- content */

/** Bold, italic and links in a line. The call and WhatsApp links show as buttons, as they will on the page. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.kind === "bold") return <strong key={i}><Marked text={t.text} /></strong>
        if (t.kind === "italic") return <em key={i}><Marked text={t.text} /></em>
        if (t.kind === "link") {
          if (t.href === CALL_LINK) return <span key={i} className="mx-0.5 inline-block rounded-md bg-primary px-2.5 py-0.5 text-[13px] font-semibold text-primary-foreground">{t.text}</span>
          if (t.href === WHATSAPP_LINK) return <span key={i} className="mx-0.5 inline-block rounded-md px-2.5 py-0.5 text-[13px] font-semibold text-primary ring-1 ring-primary">{t.text}</span>
          return /^https?:\/\//i.test(t.href ?? "") ? (
            <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {t.text}
            </a>
          ) : (
            <span key={i}>{t.text}</span>
          )
        }
        return <Marked key={i} text={t.text} />
      })}
    </>
  )
}

/** The page body as it will read: headings, paragraphs, the process, quotes. */
function Body({ md }: { md: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      {parseBlocks(md).map((b, i) => {
        if (b.type === "heading") {
          return b.level === 2 ? (
            <h2 key={i} className="pt-3 text-lg font-semibold">
              <Inline text={b.text} />
            </h2>
          ) : (
            <h3 key={i} className="pt-1 font-semibold">
              <Inline text={b.text} />
            </h3>
          )
        }
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul"
          return (
            <Tag key={i} className={cn("space-y-1.5 ps-6", b.ordered ? "list-decimal" : "list-disc")}>
              {b.items.map((item, n) => (
                <li key={n}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          )
        }
        if (b.type === "quote") {
          return (
            <blockquote key={i} className="space-y-0.5 border-s-2 border-primary/40 ps-3 text-muted-foreground">
              {b.lines.map((l, n) => (
                <p key={n}>
                  <Inline text={l} />
                </p>
              ))}
            </blockquote>
          )
        }
        return (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        )
      })}
    </div>
  )
}

/**
 * The generated page: the meta tags, the page content as one document, the technical SEO and the image plan. With `editing` every
 * field becomes an input and each change goes to `onChange` as a whole new page, so the checklist, copy buttons and exports follow the edits.
 */
export function LandingPreview({ page, lang, editing = false, onChange }: { page: LandingPage; lang: "en" | "ar"; editing?: boolean; onChange?: (next: LandingPage) => void }) {
  const update = (patch: Partial<LandingPage>) => onChange?.({ ...page, ...patch })

  /** A text value: read-only with placeholders highlighted, or an input while editing. */
  const T = (value: string, set: (v: string) => void, label: string, multiline = false) =>
    !editing ? (
      <Marked text={value} />
    ) : multiline ? (
      <Textarea aria-label={label} value={value} onChange={(e) => set(e.target.value)} className="field-sizing-content min-h-9 resize-none py-1.5" />
    ) : (
      <Input aria-label={label} value={value} onChange={(e) => set(e.target.value)} />
    )

  return (
    <div className="space-y-4" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <Block section="meta" page={page}>
        <Field label="Title tag" hint={<Limit value={page.meta.title.length} max={60} />}>
          <span className="font-medium text-blue-700 dark:text-blue-300">{T(page.meta.title, (v) => update({ meta: { ...page.meta, title: v } }), "Title tag")}</span>
        </Field>
        <Field label="Meta description" hint={<Limit value={page.meta.description.length} max={160} />}>
          {T(page.meta.description, (v) => update({ meta: { ...page.meta, description: v } }), "Meta description", true)}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="URL slug">
            {editing ? (
              <Input aria-label="URL slug" dir="ltr" value={page.meta.slug} onChange={(e) => update({ meta: { ...page.meta, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") } })} className="font-mono" />
            ) : (
              <code dir="ltr" className="font-mono text-[13px]">/{page.meta.slug}</code>
            )}
          </Field>
          <Field label="H1">{T(page.meta.h1, (v) => update({ meta: { ...page.meta, h1: v } }), "H1")}</Field>
        </div>
      </Block>

      <Block section="content" page={page} hint={<span className="text-xs text-muted-foreground tabular-nums">{landingWordCount(page)} words</span>}>
        {editing ? (
          <Field
            label="Page content (markdown)"
            hint={<span className="font-normal tracking-normal normal-case">## for sections, ### for sub-headings, a numbered list for the process, [Call Now](#call) and [WhatsApp Us](#whatsapp) for buttons</span>}
          >
            <Textarea
              aria-label="Page content"
              value={page.content}
              onChange={(e) => update({ content: e.target.value })}
              dir={lang === "ar" ? "rtl" : "ltr"}
              className="field-sizing-content min-h-96 font-mono text-[13px] leading-relaxed"
            />
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{contentWords(page.content)} words in the body</p>
          </Field>
        ) : (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">
              <Marked text={page.meta.h1} />
            </h1>
            <Body md={page.content} />
          </div>
        )}
        {page.sectionCoverage.length > 0 && (
          <Field label="Sections the ranking pages share, and where this page covers them">
            <ul className="space-y-0.5">
              {page.sectionCoverage.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span>{c.section}</span>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="muted">{c.location}</Badge>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </Block>

      <Block section="technical" page={page}>
        <Field label="Schema markup (JSON-LD)">
          {editing ? (
            <Textarea
              aria-label="Schema markup (JSON-LD)"
              dir="ltr"
              value={page.technicalSeo.schema}
              onChange={(e) => update({ technicalSeo: { ...page.technicalSeo, schema: e.target.value } })}
              className="field-sizing-content max-h-64 min-h-24 font-mono text-xs"
            />
          ) : (
            <pre dir="ltr" className="max-h-64 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs">
              <Marked text={prettyJson(page.technicalSeo.schema)} />
            </pre>
          )}
        </Field>
        <Field label="Internal links">
          <ul className="space-y-1">
            {page.technicalSeo.internalLinks.map((l, i) => {
              const set = (patch: Partial<typeof l>) => update({ technicalSeo: { ...page.technicalSeo, internalLinks: replaceAt(page.technicalSeo.internalLinks, i, { ...l, ...patch }) } })
              return editing ? (
                <li key={i} className="flex items-center gap-1">
                  {T(l.anchor, (v) => set({ anchor: v }), `Link ${i + 1} anchor text`)}
                  <Input aria-label={`Link ${i + 1} page`} dir="ltr" value={l.page} onChange={(e) => set({ page: e.target.value })} className="font-mono" />
                  <RemoveButton label={`Remove link ${i + 1}`} onClick={() => update({ technicalSeo: { ...page.technicalSeo, internalLinks: removeAt(page.technicalSeo.internalLinks, i) } })} />
                </li>
              ) : (
                <li key={i}>
                  <Marked text={l.anchor} /> <span className="text-muted-foreground">→ {l.page}</span>
                </li>
              )
            })}
          </ul>
          {editing && <div className="mt-1.5"><AddButton onClick={() => update({ technicalSeo: { ...page.technicalSeo, internalLinks: [...page.technicalSeo.internalLinks, { anchor: "", page: "" }] } })}>Add link</AddButton></div>}
        </Field>
      </Block>

      <Block section="images" page={page}>
        {editing ? (
          <Field label="Why this many images">
            <Textarea
              aria-label="Image plan rationale"
              value={page.imagePlan.rationale}
              onChange={(e) => update({ imagePlan: { ...page.imagePlan, rationale: e.target.value } })}
              className="field-sizing-content min-h-9 resize-none py-1.5"
            />
          </Field>
        ) : (
          <p>
            <span className="font-semibold">{page.imagePlan.images.length} images.</span> <span className="text-muted-foreground">{page.imagePlan.rationale}</span>
          </p>
        )}
        <div className="space-y-3">
          {page.imagePlan.images.map((img, i) => {
            const set = (patch: Partial<typeof img>) => update({ imagePlan: { ...page.imagePlan, images: replaceAt(page.imagePlan.images, i, { ...img, ...patch }) } })
            const tooLong = img.alt.length > MAX_ALT_LENGTH
            return editing ? (
              <div key={i} className="space-y-1.5 rounded-lg border border-border p-3">
                <div className="flex items-center gap-1">
                  <Input aria-label={`Image ${i + 1} placement`} value={img.placement} onChange={(e) => set({ placement: e.target.value })} placeholder="Placement" className="w-40 shrink-0" />
                  <Input aria-label={`Image ${i + 1} file name`} dir="ltr" value={img.filename} onChange={(e) => set({ filename: e.target.value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-") })} placeholder="file-name.webp" className="font-mono" />
                  <RemoveButton label={`Remove image ${i + 1}`} onClick={() => update({ imagePlan: { ...page.imagePlan, images: removeAt(page.imagePlan.images, i) } })} />
                </div>
                {T(img.alt, (v) => set({ alt: v }), `Image ${i + 1} alt text`, true)}
                {T(img.subject, (v) => set({ subject: v }), `Image ${i + 1} subject`, true)}
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Image ${i + 1} size`} dir="ltr" value={img.size} onChange={(e) => set({ size: e.target.value })} placeholder="1200x800" className="w-32 font-mono" />
                  <Select aria-label={`Image ${i + 1} loading`} value={img.loading} onChange={(e) => set({ loading: e.target.value === "eager" ? "eager" : "lazy" })} className="w-28">
                    <option value="eager">eager</option>
                    <option value="lazy">lazy</option>
                  </Select>
                  <span className={cn("ms-auto font-mono text-xs", tooLong ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    alt {img.alt.length}/{MAX_ALT_LENGTH}
                  </span>
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-1 rounded-lg bg-muted/40 p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{i + 1}</Badge>
                  <Badge variant="outline">{img.placement || "image"}</Badge>
                  <code dir="ltr" className="font-mono text-[13px] font-medium">{img.filename}</code>
                  <CopyButton text={img.filename} label="Copy name" />
                </p>
                <p>
                  <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Alt </span>
                  <Marked text={img.alt} />
                  <span className={cn("ms-2 font-mono text-xs", tooLong ? "font-semibold text-destructive" : "text-muted-foreground")}>{img.alt.length}/{MAX_ALT_LENGTH}</span>
                </p>
                <p className="text-muted-foreground">
                  <span className="text-[11px] font-medium tracking-wider uppercase">Photograph </span>
                  <Marked text={img.subject} />
                </p>
                <p dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {img.size} · {img.loading === "eager" ? "load first (hero)" : "lazy-load"}
                </p>
              </div>
            )
          })}
        </div>
        {editing && (
          <AddButton onClick={() => update({ imagePlan: { ...page.imagePlan, images: [...page.imagePlan.images, { placement: "", subject: "", filename: "", alt: "", size: "1200x800", loading: "lazy" }] } })}>Add image</AddButton>
        )}
      </Block>
    </div>
  )
}

function prettyJson(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
