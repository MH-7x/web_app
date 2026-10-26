"use client"

import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Save, Sparkles, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import {
  CORE_PAGES,
  EMPTY_PROJECT,
  FOCUSES,
  PAGE_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_STEP_FIELDS,
  SECONDARY_SERVICES,
  computeTotal,
  countPages,
  formatAed,
  validateProject,
  type ProjectErrors,
  type ProjectInput,
} from "@/lib/proposals-types"
import { cn } from "@/lib/utils"

const STEPS = [
  { title: "Client Info", hint: "Company and contact" },
  { title: "Website Structure", hint: "Pages to build" },
  { title: "Strategy", hint: "Focus and services" },
  { title: "Pricing", hint: "Costs and payment" },
  { title: "Review", hint: "Check and generate" },
] as const

type Props = { mode: "create" } | { mode: "edit"; projectId: string; initial: ProjectInput }

export function ProjectForm(props: Props) {
  const router = useRouter()
  const [values, setValues] = useState<ProjectInput>(props.mode === "edit" ? props.initial : EMPTY_PROJECT)
  const [errors, setErrors] = useState<ProjectErrors>({})
  const [step, setStep] = useState(0)
  /** set once the project has been saved, so saving again updates it instead of creating a second one */
  const [savedId, setSavedId] = useState<string | null>(props.mode === "edit" ? props.projectId : null)
  const [busy, setBusy] = useState<"save" | "generate" | null>(null)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  function next() {
    const found = validateProject(values, PROJECT_STEP_FIELDS[step])
    if (Object.keys(found).length) return setErrors(found)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo({ top: 0 })
  }

  /** Save the project; returns its id, or null when it could not be saved. */
  async function save(): Promise<string | null> {
    setError(null)
    const res = await fetch(savedId ? `/api/proposals/${savedId}` : "/api/proposals", {
      method: savedId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
    const body = (await res.json().catch(() => null)) as { id?: string; project?: { id: string }; error?: string } | null
    if (!res.ok) {
      setError(body?.error ?? `Request failed (${res.status}).`)
      return null
    }
    const id = savedId ?? body?.id ?? body?.project?.id ?? null
    setSavedId(id)
    return id
  }

  async function saveDraft() {
    const found = validateProject(values, ["clientName"])
    if (Object.keys(found).length) {
      setErrors(found)
      setStep(0)
      return
    }
    setBusy("save")
    try {
      const id = await save()
      if (id) {
        toast.success("Draft saved")
        router.push(`/proposals/${id}`)
      }
    } finally {
      setBusy(null)
    }
  }

  async function generate() {
    const found = validateProject(values)
    if (Object.keys(found).length) {
      setErrors(found)
      setStep(Math.max(0, PROJECT_STEP_FIELDS.findIndex((fields) => fields.some((f) => found[f]))))
      return
    }
    setBusy("generate")
    try {
      const id = await save()
      if (!id) return
      const res = await fetch(`/api/proposals/${id}/generate`, { method: "POST" })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        // the project is saved; the proposal can be generated again from its page
        setError(`${body?.error ?? `Request failed (${res.status}).`} Your project is saved, so you can try again.`)
        return
      }
      toast.success("Proposal generated")
      router.push(`/proposals/${id}`)
    } catch {
      setError("Could not reach the server. Your project may not be saved; try again.")
    } finally {
      setBusy(null)
    }
  }

  const last = step === STEPS.length - 1
  const working = busy !== null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!last) next()
      }}
      className="space-y-5"
    >
      <Stepper step={step} />
      {error && <ErrorNote message={error} />}

      {step === 0 && <ClientStep values={values} errors={errors} set={set} />}
      {step === 1 && <StructureStep values={values} errors={errors} set={set} />}
      {step === 2 && <StrategyStep values={values} errors={errors} set={set} />}
      {step === 3 && <PricingStep values={values} errors={errors} set={set} />}
      {step === 4 && <ReviewStep values={values} />}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground max-sm:hidden">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={working}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Link href={savedId ? `/proposals/${savedId}` : "/proposals"} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Cancel
            </Link>
          )}
          <Button type="button" variant="outline" size="lg" onClick={saveDraft} disabled={working}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
          {last ? (
            <Button type="button" size="lg" onClick={generate} disabled={working}>
              {busy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy === "generate" ? "Writing the proposal…" : "Generate Proposal"}
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={working}>
              Next: {STEPS[step + 1].title} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

/* ---------------------------------------------------------------- pieces */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="grid gap-3 sm:grid-cols-5">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo"
          return (
            <li key={s.title} aria-current={state === "active" ? "step" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", state === "active" && "bg-muted")}>
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold", state === "todo" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>{state === "done" ? <Check className="size-4" /> : i + 1}</span>
              <span className="min-w-0">
                <span className={cn("block truncate text-sm font-medium", state === "todo" && "text-muted-foreground")}>{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </li>
          )
        })}
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
    </ol>
  )
}

type StepProps = { values: ProjectInput; errors: ProjectErrors; set: <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => void }

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

function Field({ label, required, error, hint, className, children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: (p: { id: string; "aria-invalid": boolean }) => React.ReactNode }) {
  const id = useId()
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children({ id, "aria-invalid": Boolean(error) })}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A money / count input that shows nothing for zero, so a fresh form is not full of 0s. */
function NumberInput({ value, onChange, ...props }: { value: number; onChange: (n: number) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return <Input {...props} type="number" min={0} step="any" inputMode="decimal" value={value === 0 ? "" : value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/* ------------------------------------------------------------------ step 1 */

function ClientStep({ values, errors, set }: StepProps) {
  return (
    <Section title="Client & company" description="Who the proposal is for.">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Business category</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-4">
          {PROJECT_CATEGORIES.map((c) => (
            <label key={c.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm ring-1 ring-transparent has-focus-visible:ring-ring", values.category === c.value && "bg-primary/5 ring-2 ring-primary")}>
              <input type="radio" name="category" value={c.value} checked={values.category === c.value} onChange={() => set("category", c.value)} className="accent-primary" />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Client / company name" required error={errors.clientName}>
          {(p) => <Input {...p} value={values.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="e.g. Zain Movers and Packers" autoFocus />}
        </Field>
        <Field label="Project name" hint="Optional. Defaults to “[client] website project”.">
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. New website and SEO" />}
        </Field>
        <Field label="Contact person">
          {(p) => <Input {...p} value={values.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="e.g. Ahmed" />}
        </Field>
        <Field label="Contact WhatsApp" error={errors.contactWhatsapp} hint="Include the country code, e.g. +971 50 123 4567.">
          {(p) => <Input {...p} type="tel" inputMode="tel" value={values.contactWhatsapp} onChange={(e) => set("contactWhatsapp", e.target.value)} placeholder="+971 50 123 4567" />}
        </Field>
        <Field label="Existing website (optional)" hint="Leave empty if they do not have one. It is then left out of the proposal.">
          {(p) => <Input {...p} type="url" inputMode="url" value={values.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://example.ae" />}
        </Field>
      </div>

      <Field label="What the company does" hint="Their services and who they serve. This is all the proposal will say about the business.">
        {(p) => <Textarea {...p} value={values.companyDescription} onChange={(e) => set("companyDescription", e.target.value)} rows={4} placeholder="e.g. Family-run movers in Sharjah doing villa and apartment moves, packing and storage across the northern emirates." />}
      </Field>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 2 */

function StructureStep({ values, errors, set }: StepProps) {
  const counts = countPages(values.pages)
  const update = (i: number, patch: Partial<ProjectInput["pages"][number]>) => set("pages", values.pages.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <Section title="Website structure" description="The pages the new site will have.">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Core pages</legend>
        <div className="flex flex-wrap gap-2">
          {CORE_PAGES.map((c) => {
            const on = values.corePages.includes(c.value)
            return (
              <label key={c.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm ring-1 ring-transparent has-focus-visible:ring-ring", on && "ring-primary/40")}>
                <input type="checkbox" checked={on} onChange={() => set("corePages", toggle(values.corePages, c.value))} className="size-4 accent-primary" />
                {c.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">Other pages</legend>
          <p className="text-sm text-muted-foreground tabular-nums">
            {counts.service} service {counts.service === 1 ? "page" : "pages"} · {counts.location} location {counts.location === 1 ? "page" : "pages"}
          </p>
        </div>
        {values.pages.length > 0 && (
          <div className="space-y-2">
            {values.pages.map((pg, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_8rem_1.6fr_auto]">
                <Input aria-label={`Page ${i + 1} name`} value={pg.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. Villa Moving in Dubai" />
                <Select aria-label={`Page ${i + 1} type`} value={pg.type} onChange={(e) => update(i, { type: e.target.value as (typeof PAGE_TYPES)[number] })} className="max-sm:order-3">
                  {PAGE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Input aria-label={`Page ${i + 1} notes`} value={pg.notes} onChange={(e) => update(i, { notes: e.target.value })} placeholder="Notes (optional)" className="max-sm:order-4 max-sm:col-span-2" />
                <Button type="button" variant="outline" size="icon-lg" aria-label={`Remove page ${i + 1}`} onClick={() => set("pages", values.pages.filter((_, j) => j !== i))} className="max-sm:order-2">
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
        {errors.pages && (
          <p role="alert" className="text-xs text-destructive">
            {errors.pages}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => set("pages", [...values.pages, { name: "", type: "Service", notes: "" }])}>
          <Plus /> Add page
        </Button>
      </fieldset>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 3 */

function StrategyStep({ values, set }: StepProps) {
  const adsOn = values.adsIncluded
  return (
    <Section title="Strategy & services" description="What the project focuses on and what comes with it.">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Primary focus</legend>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
          {FOCUSES.map((f) => {
            const on = values.projectFocus === f.value
            return (
              <label key={f.value} className={cn("flex cursor-pointer flex-col gap-1 rounded-xl bg-muted/60 p-4 ring-1 ring-transparent transition-colors hover:bg-muted has-focus-visible:ring-ring", on && "bg-primary/5 ring-2 ring-primary")}>
                <input type="radio" name="focus" value={f.value} checked={on} onChange={() => set("projectFocus", f.value)} className="sr-only" />
                <span className="flex items-center justify-between text-sm font-semibold">
                  {f.label}
                  {on && <Check className="size-4 text-primary" />}
                </span>
                <span className="text-xs text-muted-foreground">{f.hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Also included</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECONDARY_SERVICES.map((s) => {
            const on = values.secondaryServices.includes(s.value)
            return (
              <label key={s.value} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/60 p-3 text-sm ring-1 ring-transparent has-focus-visible:ring-ring", on && "ring-primary/40")}>
                <input type="checkbox" checked={on} onChange={() => set("secondaryServices", toggle(values.secondaryServices, s.value))} className="size-4 accent-primary" />
                {s.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <Field label={`SEO months included: ${values.seoMonths === 0 ? "none" : values.seoMonths}`}>
        {(p) => <input {...p} type="range" min={0} max={12} step={1} value={values.seoMonths} onChange={(e) => set("seoMonths", Number(e.target.value))} className="w-full accent-primary" />}
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-6">
          <p id="ads-label" className="text-sm font-medium">
            Google Ads management included
          </p>
          <button type="button" role="switch" aria-checked={adsOn} aria-labelledby="ads-label" onClick={() => set("adsIncluded", !adsOn)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", adsOn ? "bg-primary" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", adsOn && "translate-x-5")} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Listed in the proposal as included in the website development price, with no separate cost.</p>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 4 */

function PricingStep({ values, errors, set }: StepProps) {
  const total = computeTotal(values)
  const updateCost = (i: number, patch: Partial<ProjectInput["otherCosts"][number]>) => set("otherCosts", values.otherCosts.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <Section title="Pricing" description="All amounts are in AED.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Website development" error={errors.websiteCost}>
          {(p) => <NumberInput {...p} value={values.websiteCost} onChange={(n) => set("websiteCost", n)} placeholder="0" />}
        </Field>
        <Field label={`SEO service${values.seoMonths ? ` (${values.seoMonths} ${values.seoMonths === 1 ? "month" : "months"})` : ""}`}>
          {(p) => <NumberInput {...p} value={values.seoCost} onChange={(n) => set("seoCost", n)} placeholder="0" />}
        </Field>
        {values.adsIncluded && (
          <div className="flex items-center rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Google Ads management</span>: included in website development
            </span>
          </div>
        )}
        <Field label="Social media setup">
          {(p) => <NumberInput {...p} value={values.socialCost} onChange={(n) => set("socialCost", n)} placeholder="0" />}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Other costs</legend>
        {values.otherCosts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
            <Input aria-label={`Other cost ${i + 1} name`} value={c.name} onChange={(e) => updateCost(i, { name: e.target.value })} placeholder="e.g. Logo design" />
            <NumberInput aria-label={`Other cost ${i + 1} amount`} value={c.amount} onChange={(n) => updateCost(i, { amount: n })} placeholder="0" />
            <Button type="button" variant="outline" size="icon-lg" aria-label={`Remove other cost ${i + 1}`} onClick={() => set("otherCosts", values.otherCosts.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => set("otherCosts", [...values.otherCosts, { name: "", amount: 0 }])}>
          <Plus /> Add cost
        </Button>
      </fieldset>

      <div className="flex items-center justify-between rounded-xl bg-primary/5 px-5 py-4 ring-1 ring-primary/20" aria-live="polite">
        <span className="font-medium">Total project cost</span>
        <span className="text-2xl font-semibold tabular-nums">{formatAed(total)}</span>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field label="Payment terms">
          {(p) => <Textarea {...p} value={values.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} rows={3} placeholder="e.g. 50% upfront, 50% on delivery" />}
        </Field>
        <Field label="Delivery time (weeks)" error={errors.deliveryWeeks}>
          {(p) => <Input {...p} type="number" min={1} max={52} value={values.deliveryWeeks} onChange={(e) => set("deliveryWeeks", Math.min(52, Math.max(1, Number(e.target.value) || 1)))} />}
        </Field>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 5 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">Not set</span>}</dd>
    </div>
  )
}

function ReviewStep({ values }: { values: ProjectInput }) {
  const counts = countPages(values.pages)
  const label = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v
  const lines = [
    ["Website development", values.websiteCost],
    ["SEO", values.seoCost],
    ["Social media setup", values.socialCost],
    ...values.otherCosts.map((c): [string, number] => [c.name, c.amount]),
  ].filter(([, n]) => (n as number) > 0) as [string, number][]

  return (
    <Section title="Review" description="Check everything, then generate the proposal. You can edit the text afterwards.">
      <dl className="space-y-3">
        <Row label="Client">{values.clientName}</Row>
        <Row label="Contact">{[values.contactName, values.contactWhatsapp].filter(Boolean).join(" · ")}</Row>
        <Row label="Category">{label(PROJECT_CATEGORIES, values.category)}</Row>
        <Row label="Existing website">{values.websiteUrl}</Row>
        <Row label="About">{values.companyDescription}</Row>
      </dl>
      <dl className="space-y-3 border-t border-border pt-5">
        <Row label="Core pages">{CORE_PAGES.filter((c) => values.corePages.includes(c.value)).map((c) => c.label).join(", ")}</Row>
        <Row label="Other pages">
          {values.pages.length ? (
            <span className="block space-y-0.5 font-normal">
              {values.pages.map((p, i) => (
                <span key={i} className="block">
                  {p.name} <span className="text-muted-foreground">· {p.type}{p.notes ? ` · ${p.notes}` : ""}</span>
                </span>
              ))}
            </span>
          ) : null}
        </Row>
        <Row label="Page counts">
          {counts.service} service · {counts.location} location
        </Row>
      </dl>
      <dl className="space-y-3 border-t border-border pt-5">
        <Row label="Primary focus">{label(FOCUSES, values.projectFocus)}</Row>
        <Row label="Also included">{values.secondaryServices.map((s) => label(SECONDARY_SERVICES, s)).join(", ")}</Row>
        <Row label="SEO months">{values.seoMonths ? String(values.seoMonths) : ""}</Row>
        <Row label="Google Ads management">{values.adsIncluded ? "Included in website development" : ""}</Row>
      </dl>
      <div className="space-y-3 border-t border-border pt-5">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {lines.map(([name, amount]) => (
              <tr key={name}>
                <td className="py-1.5">{name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatAed(amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">{formatAed(computeTotal(values))}</td>
            </tr>
          </tbody>
        </table>
        <dl className="space-y-3">
          <Row label="Payment terms">{values.paymentTerms}</Row>
          <Row label="Delivery">{`${values.deliveryWeeks} ${values.deliveryWeeks === 1 ? "week" : "weeks"}`}</Row>
        </dl>
      </div>
    </Section>
  )
}
