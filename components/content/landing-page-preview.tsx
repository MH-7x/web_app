"use client"

import { Check, Info, Plus, X } from "lucide-react"
import type { ReactNode } from "react"

import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Select, Textarea } from "@/components/ui/input"
import {
  LANDING_SECTIONS,
  MAX_ALT_LENGTH,
  PLACEHOLDER,
  checkLandingPage,
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

function Block({ section, page, children }: { section: LandingSection; page: LandingPage; children: ReactNode }) {
  const label = LANDING_SECTIONS.find((s) => s.id === section)!.label
  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{label}</h3>
        <CopyButton text={sectionMarkdown(page, section)} label="Copy section" />
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

/**
 * The generated page, one visually separate block per section. With `editing` every field becomes an input and
 * each change goes to `onChange` as a whole new page, so the checklist, copy buttons and exports follow the edits.
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

      <Block section="hero" page={page}>
        {editing ? (
          <div className="space-y-3">
            <Field label="Headline">{T(page.hero.headline, (v) => update({ hero: { ...page.hero, headline: v } }), "Headline", true)}</Field>
            <Field label="Subheadline">{T(page.hero.subheadline, (v) => update({ hero: { ...page.hero, subheadline: v } }), "Subheadline", true)}</Field>
            <Field label="Button text">{T(page.hero.cta, (v) => update({ hero: { ...page.hero, cta: v } }), "Hero button text")}</Field>
            <Field label="Trust badges">
              <div className="space-y-1.5">
                {page.hero.trustBadges.map((b, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {T(b, (v) => update({ hero: { ...page.hero, trustBadges: replaceAt(page.hero.trustBadges, i, v) } }), `Trust badge ${i + 1}`)}
                    <RemoveButton label={`Remove trust badge ${i + 1}`} onClick={() => update({ hero: { ...page.hero, trustBadges: removeAt(page.hero.trustBadges, i) } })} />
                  </div>
                ))}
                <AddButton onClick={() => update({ hero: { ...page.hero, trustBadges: [...page.hero.trustBadges, ""] } })}>Add badge</AddButton>
              </div>
            </Field>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-muted/40 p-5 text-center">
            <p className="text-xl font-bold">
              <Marked text={page.meta.h1} />
            </p>
            <p className="font-semibold text-primary">
              <Marked text={page.hero.headline} />
            </p>
            <p className="text-muted-foreground">
              <Marked text={page.hero.subheadline} />
            </p>
            <p className="pt-1">
              <span className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
                <Marked text={page.hero.cta} />
              </span>
            </p>
            <ul className="flex flex-wrap justify-center gap-1.5 pt-1">
              {page.hero.trustBadges.map((b, i) => (
                <li key={i}>
                  <Badge variant="muted">
                    <Marked text={b} />
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block section="benefits" page={page}>
        <p className="text-base font-semibold">{T(page.headings.benefits, (v) => update({ headings: { ...page.headings, benefits: v } }), "Benefits heading")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {page.benefits.map((b, i) => {
            const set = (patch: Partial<typeof b>) => update({ benefits: replaceAt(page.benefits, i, { ...b, ...patch }) })
            return (
              <div key={i} className="space-y-1 rounded-lg bg-muted/40 p-3">
                {editing ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      {T(b.heading, (v) => set({ heading: v }), `Benefit ${i + 1} heading`)}
                      <RemoveButton label={`Remove benefit ${i + 1}`} onClick={() => update({ benefits: removeAt(page.benefits, i) })} />
                    </div>
                    <Input aria-label={`Benefit ${i + 1} icon`} dir="ltr" value={b.icon} onChange={(e) => set({ icon: e.target.value })} placeholder="Icon name, e.g. truck" className="font-mono" />
                    {T(b.description, (v) => set({ description: v }), `Benefit ${i + 1} description`, true)}
                  </div>
                ) : (
                  <>
                    <p className="flex items-center justify-between gap-2 font-semibold">
                      <Marked text={b.heading} />
                      {b.icon && (
                        <Badge variant="outline" dir="ltr" className="font-mono">
                          {b.icon}
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      <Marked text={b.description} />
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {editing && <AddButton onClick={() => update({ benefits: [...page.benefits, { icon: "", heading: "", description: "" }] })}>Add benefit</AddButton>}
      </Block>

      <Block section="service" page={page}>
        <p className="text-base font-semibold">{T(page.headings.service, (v) => update({ headings: { ...page.headings, service: v } }), "Service heading")}</p>
        {page.serviceDetails.map((p, i) => (
          <div key={i} className="flex items-start gap-1">
            <p className="flex-1 leading-relaxed">{T(p, (v) => update({ serviceDetails: replaceAt(page.serviceDetails, i, v) }), `Service paragraph ${i + 1}`, true)}</p>
            {editing && <RemoveButton label={`Remove paragraph ${i + 1}`} onClick={() => update({ serviceDetails: removeAt(page.serviceDetails, i) })} />}
          </div>
        ))}
        {editing && <AddButton onClick={() => update({ serviceDetails: [...page.serviceDetails, ""] })}>Add paragraph</AddButton>}
      </Block>

      <Block section="process" page={page}>
        <p className="text-base font-semibold">{T(page.headings.process, (v) => update({ headings: { ...page.headings, process: v } }), "Process heading")}</p>
        <ol className="space-y-3">
          {page.process.map((s, i) => {
            const set = (patch: Partial<typeof s>) => update({ process: replaceAt(page.process, i, { ...s, ...patch }) })
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                {editing ? (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1">
                      {T(s.title, (v) => set({ title: v }), `Step ${i + 1} title`)}
                      <RemoveButton label={`Remove step ${i + 1}`} onClick={() => update({ process: removeAt(page.process, i) })} />
                    </div>
                    {T(s.description, (v) => set({ description: v }), `Step ${i + 1} description`, true)}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={s.confirm} onChange={(e) => set({ confirm: e.target.checked })} className="size-3.5 accent-primary" />
                      Needs confirming with the client
                    </label>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <Marked text={s.title} />
                      {s.confirm && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">Confirm with client</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      <Marked text={s.description} />
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {editing && <AddButton onClick={() => update({ process: [...page.process, { title: "", description: "", confirm: false }] })}>Add step</AddButton>}
      </Block>

      <Block section="extra" page={page}>
        {page.additionalSections.length === 0 && !editing && <p className="text-muted-foreground">No additional sections: the fixed sections already cover everything the ranking pages share.</p>}
        {page.additionalSections.map((e, i) => {
          const set = (patch: Partial<typeof e>) => update({ additionalSections: replaceAt(page.additionalSections, i, { ...e, ...patch }) })
          return editing ? (
            <div key={i} className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center gap-1">
                {T(e.heading, (v) => set({ heading: v }), `Section ${i + 1} heading`)}
                <Select aria-label={`Section ${i + 1} position`} value={e.placement} onChange={(ev) => set({ placement: ev.target.value === "service" || ev.target.value === "proof" ? ev.target.value : "process" })} className="w-48 shrink-0">
                  <option value="service">After service details</option>
                  <option value="process">After process</option>
                  <option value="proof">After social proof</option>
                </Select>
                <RemoveButton label={`Remove section ${i + 1}`} onClick={() => update({ additionalSections: removeAt(page.additionalSections, i) })} />
              </div>
              {e.paragraphs.map((p, j) => (
                <div key={j} className="flex items-start gap-1">
                  {T(p, (v) => set({ paragraphs: replaceAt(e.paragraphs, j, v) }), `Section ${i + 1} paragraph ${j + 1}`, true)}
                  <RemoveButton label={`Remove paragraph ${j + 1} of section ${i + 1}`} onClick={() => set({ paragraphs: removeAt(e.paragraphs, j) })} />
                </div>
              ))}
              <AddButton onClick={() => set({ paragraphs: [...e.paragraphs, ""] })}>Add paragraph</AddButton>
            </div>
          ) : (
            <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <p className="flex items-center justify-between gap-2 text-base font-semibold">
                <Marked text={e.heading} />
                <Badge variant="outline" className="font-normal">
                  {e.placement === "service" ? "after service details" : e.placement === "proof" ? "after social proof" : "after process"}
                </Badge>
              </p>
              {e.paragraphs.map((p, j) => (
                <p key={j} className="leading-relaxed">
                  <Marked text={p} />
                </p>
              ))}
            </div>
          )
        })}
        {editing && <AddButton onClick={() => update({ additionalSections: [...page.additionalSections, { heading: "", paragraphs: [""], placement: "process" }] })}>Add section</AddButton>}
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

      <Block section="proof" page={page}>
        <p className="text-base font-semibold">{T(page.headings.socialProof, (v) => update({ headings: { ...page.headings, socialProof: v } }), "Social proof heading")}</p>
        {(page.socialProof.stats.length > 0 || editing) && (
          <ul className={cn("grid gap-2", editing ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
            {page.socialProof.stats.map((s, i) => {
              const set = (patch: Partial<typeof s>) => update({ socialProof: { ...page.socialProof, stats: replaceAt(page.socialProof.stats, i, { ...s, ...patch }) } })
              return (
                <li key={i} className={cn("rounded-lg bg-muted/40 p-3", !editing && "text-center")}>
                  {editing ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        {T(s.value, (v) => set({ value: v }), `Stat ${i + 1} value`)}
                        <RemoveButton label={`Remove stat ${i + 1}`} onClick={() => update({ socialProof: { ...page.socialProof, stats: removeAt(page.socialProof.stats, i) } })} />
                      </div>
                      {T(s.label, (v) => set({ label: v }), `Stat ${i + 1} label`)}
                    </div>
                  ) : (
                    <>
                      <p className="text-lg font-bold">
                        <Marked text={s.value} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Marked text={s.label} />
                      </p>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {editing && <AddButton onClick={() => update({ socialProof: { ...page.socialProof, stats: [...page.socialProof.stats, { value: "", label: "" }] } })}>Add stat</AddButton>}
        {page.socialProof.testimonials.map((t, i) => {
          const set = (patch: Partial<typeof t>) => update({ socialProof: { ...page.socialProof, testimonials: replaceAt(page.socialProof.testimonials, i, { ...t, ...patch }) } })
          return editing ? (
            <div key={i} className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex items-start gap-1">
                {T(t.quote, (v) => set({ quote: v }), `Testimonial ${i + 1} quote`, true)}
                <RemoveButton label={`Remove testimonial ${i + 1}`} onClick={() => update({ socialProof: { ...page.socialProof, testimonials: removeAt(page.socialProof.testimonials, i) } })} />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {T(t.name, (v) => set({ name: v }), `Testimonial ${i + 1} name`)}
                {T(t.detail, (v) => set({ detail: v }), `Testimonial ${i + 1} detail`)}
              </div>
            </div>
          ) : (
            <figure key={i} className="rounded-lg border border-border p-3">
              <blockquote>
                <Marked text={t.quote} />
              </blockquote>
              <figcaption className="mt-1 text-xs text-muted-foreground">
                <Marked text={[t.name, t.detail].filter(Boolean).join(", ")} />
              </figcaption>
            </figure>
          )
        })}
        {editing && <AddButton onClick={() => update({ socialProof: { ...page.socialProof, testimonials: [...page.socialProof.testimonials, { quote: "", name: "", detail: "" }] } })}>Add testimonial</AddButton>}
      </Block>

      <Block section="faq" page={page}>
        <p className="text-base font-semibold">{T(page.headings.faq, (v) => update({ headings: { ...page.headings, faq: v } }), "FAQ heading")}</p>
        <dl className="space-y-3">
          {page.faq.map((f, i) => {
            const set = (patch: Partial<typeof f>) => update({ faq: replaceAt(page.faq, i, { ...f, ...patch }) })
            return editing ? (
              <div key={i} className="space-y-1.5">
                <div className="flex items-start gap-1">
                  {T(f.question, (v) => set({ question: v }), `Question ${i + 1}`, true)}
                  <RemoveButton label={`Remove question ${i + 1}`} onClick={() => update({ faq: removeAt(page.faq, i) })} />
                </div>
                {T(f.answer, (v) => set({ answer: v }), `Answer ${i + 1}`, true)}
              </div>
            ) : (
              <div key={i}>
                <dt className="font-medium">
                  <Marked text={f.question} />
                </dt>
                <dd className="text-muted-foreground">
                  <Marked text={f.answer} />
                </dd>
              </div>
            )
          })}
        </dl>
        {editing && <AddButton onClick={() => update({ faq: [...page.faq, { question: "", answer: "" }] })}>Add question</AddButton>}
      </Block>

      <Block section="cta" page={page}>
        {editing ? (
          <div className="space-y-3">
            <Field label="Headline">{T(page.cta.headline, (v) => update({ cta: { ...page.cta, headline: v } }), "CTA headline")}</Field>
            <Field label="Description">{T(page.cta.description, (v) => update({ cta: { ...page.cta, description: v } }), "CTA description", true)}</Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone button">{T(page.cta.phoneButton, (v) => update({ cta: { ...page.cta, phoneButton: v } }), "Phone button text")}</Field>
              <Field label="WhatsApp button">{T(page.cta.whatsappButton, (v) => update({ cta: { ...page.cta, whatsappButton: v } }), "WhatsApp button text")}</Field>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-primary/5 p-5 text-center">
            <p className="text-base font-bold">
              <Marked text={page.cta.headline} />
            </p>
            <p className="text-muted-foreground">
              <Marked text={page.cta.description} />
            </p>
            <p className="flex flex-wrap justify-center gap-2 pt-1">
              <span className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
                <Marked text={page.cta.phoneButton} />
              </span>
              <span className="rounded-lg border border-primary px-4 py-2 font-semibold text-primary">
                <Marked text={page.cta.whatsappButton} />
              </span>
            </p>
          </div>
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
                  <Input aria-label={`Image ${i + 1} placement`} value={img.placement} onChange={(e) => set({ placement: e.target.value })} placeholder="Placement" className="w-32 shrink-0" />
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
