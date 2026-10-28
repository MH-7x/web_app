"use client"

import { ArrowLeft, ArrowRight, Check, MapPin, Plus, Sofa, Truck, X, Zap } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useRef, useState, useTransition } from "react"

import { toast } from "sonner"
import { PlaceField } from "@/components/clients/place-field"
import { SetupProgress } from "@/components/clients/setup-progress"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { createClientAction, updateClientAction } from "@/lib/actions"
import {
  EMPTY_CLIENT,
  MAX_COMPANY_PROFILE,
  STEP_FIELDS,
  validateClient,
  type ClientInput,
  type FieldErrors,
  type OtherLink,
} from "@/lib/client-schema"
import { CATEGORIES, CATEGORY_INFO, EMIRATES, INITIAL_SETUP_OPTIONS, SERVICES_BY_CATEGORY, TONES, type ClientCategory } from "@/lib/constants"
import type { SetupClient, SetupStepId } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

const STEPS = [
  { title: "Company Info", hint: "Emirate, coverage & contacts" },
  { title: "Brand & Style", hint: "Tone, profile & links" },
  { title: "Initial Setup", hint: "What to generate first" },
] as const

type Props =
  | { mode: "create"; clientId?: undefined; initial?: undefined }
  | { mode: "edit"; clientId: string; initial: ClientInput }

export function ClientForm({ mode, clientId, initial }: Props) {
  const [values, setValues] = useState<ClientInput>(initial ?? EMPTY_CLIENT)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [sameAsPhone, setSameAsPhone] = useState(mode === "edit" && initial.phone === initial.whatsapp)
  const [pending, startTransition] = useTransition()
  /** set once the client is saved and starter content is being generated */
  const [onboarding, setOnboarding] = useState<{ client: SetupClient; steps: SetupStepId[] } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  const wizard = mode === "create"

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setValues((v) => ({ ...v, [key]: value, ...(key === "phone" && sameAsPhone ? { whatsapp: value as string } : {}) }))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  function focusFirstInvalid() {
    // wait for the error state to render aria-invalid
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus())
  }

  function goNext() {
    const found = validateClient(values, STEP_FIELDS[step])
    if (Object.keys(found).length) {
      setErrors(found)
      focusFirstInvalid()
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo({ top: 0 })
  }

  function submit() {
    const found = validateClient(values)
    if (Object.keys(found).length) {
      setErrors(found)
      if (wizard) setStep(STEP_FIELDS.findIndex((fields) => fields.some((f) => found[f])))
      focusFirstInvalid()
      return
    }
    setFormError(null)
    // with starter content ticked, save the client first, then generate here with a progress panel
    const generate = wizard && values.initialSetup.length > 0
    startTransition(async () => {
      const result = wizard ? await createClientAction(values, { navigate: false }) : await updateClientAction(clientId, values, { navigate: false })
      if (result && result.ok) {
        toast.success(wizard ? "Client created" : "Changes saved", { description: values.name.trim() })
        if (!generate) {
          router.push(`/clients/${result.id}`)
          return
        }
        setOnboarding({
          client: { id: result.id, name: values.name.trim(), emirate: values.emirate, services: values.services, areas: values.areas },
          // in the order they are listed in the form
          steps: INITIAL_SETUP_OPTIONS.map((o) => o.value).filter((v) => values.initialSetup.includes(v)) as SetupStepId[],
        })
        window.scrollTo({ top: 0 })
        return
      }
      // otherwise the action redirected; we only get here with errors
      if (result && !result.ok) {
        setErrors(result.errors)
        setFormError(result.message ?? null)
        toast.error("Check the highlighted fields", { description: result.message })
        if (wizard) setStep(Math.max(0, STEP_FIELDS.findIndex((fields) => fields.some((f) => result.errors[f]))))
        focusFirstInvalid()
      }
    })
  }

  const show = (n: number) => !wizard || step === n
  const last = step === STEPS.length - 1

  if (onboarding) return <SetupProgress client={onboarding.client} steps={onboarding.steps} />

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (wizard && !last) goNext()
        else submit()
      }}
      className="space-y-5"
    >
      {wizard && <Stepper step={step} />}

      {formError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      {show(0) && <CompanyStep values={values} errors={errors} set={set} sameAsPhone={sameAsPhone} setSameAsPhone={(v) => {
        setSameAsPhone(v)
        if (v) set("whatsapp", values.phone)
      }} />}
      {show(1) && <BrandStep values={values} errors={errors} set={set} />}
      {show(2) && <SetupStep values={values} set={set} edit={!wizard} />}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground max-sm:hidden">
          {wizard ? `Step ${step + 1} of ${STEPS.length}` : "Changes apply to every module that uses this client."}
        </p>
        <div className="ml-auto flex gap-2">
          {wizard && step > 0 ? (
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={pending}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Link
              href={wizard ? "/clients" : `/clients/${clientId}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Cancel
            </Link>
          )}
          {wizard && !last ? (
            <Button type="submit" size="lg">
              Save &amp; Continue to {STEPS[step + 1].title} <ArrowRight />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={pending}>
              {wizard ? <Zap /> : <Check />}
              {pending ? "Saving…" : wizard ? (values.initialSetup.length ? "Create Client & Generate" : "Create Client") : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

/* ---------------------------------------------------------------- stepper */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo"
          return (
            <li
              key={s.title}
              aria-current={state === "active" ? "step" : undefined}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", state === "active" && "bg-muted")}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                  state === "todo" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                )}
              >
                {state === "done" ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", state === "todo" && "text-muted-foreground")}>{s.title}</span>
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

/* ------------------------------------------------------------------ pieces */

type StepProps = {
  values: ClientInput
  errors: FieldErrors
  set: <K extends keyof ClientInput>(key: K, value: ClientInput[K]) => void
}

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

function Field({
  label,
  required,
  error,
  hint,
  className,
  action,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  action?: React.ReactNode
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => React.ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        {action}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function PhoneInput({ value, onChange, ...aria }: { value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <div className="flex">
      <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">
        +971
      </span>
      <Input
        {...aria}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="50 123 4567"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-l-none"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ step 1 */

function CompanyStep({
  values,
  errors,
  set,
  sameAsPhone,
  setSameAsPhone,
}: StepProps & { sameAsPhone: boolean; setSameAsPhone: (v: boolean) => void }) {
  const [areaDraft, setAreaDraft] = useState("")
  const [serviceDraft, setServiceDraft] = useState("")

  function addArea() {
    const parts = areaDraft.split(",").map((a) => a.trim()).filter(Boolean)
    if (!parts.length) return
    set("areas", [...new Set([...values.areas, ...parts])])
    setAreaDraft("")
  }

  // values.services is the merged list: predefined checkboxes + custom tags. Anything not in the current category's
  // list is custom, which also splits a saved client's services correctly when the edit form loads.
  const serviceOptions = SERVICES_BY_CATEGORY[values.category]
  const predefined: string[] = serviceOptions.map((s) => s.value)
  const customServices = values.services.filter((s) => !predefined.includes(s))
  const allSelected = predefined.every((v) => values.services.includes(v))

  function changeCategory(next: ClientCategory) {
    if (next === values.category) return
    // the old category's predefined services no longer apply; custom ones stay
    const old = SERVICES_BY_CATEGORY[values.category].map((s) => s.value as string)
    set("category", next)
    set("services", values.services.filter((s) => !old.includes(s)))
  }

  function addCustomService() {
    const parts = serviceDraft.split(",").map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const lower = new Set(values.services.map((s) => s.toLowerCase()))
    const fresh = parts.filter((p) => {
      const key = p.toLowerCase()
      if (lower.has(key)) return false
      lower.add(key)
      return true
    })
    if (fresh.length) set("services", [...values.services, ...fresh])
    setServiceDraft("")
  }

  return (
    <Section title="Company Identity & Coverage" description="Core registration details and operational footprint across the Emirates.">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Business Category</legend>
        <div role="radiogroup" aria-label="Business Category" className="grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const on = values.category === c
            const Icon = c === "used_furniture" ? Sofa : Truck
            return (
              <label
                key={c}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-xl bg-muted/60 p-4 ring-1 ring-transparent transition-colors hover:bg-muted has-focus-visible:ring-ring",
                  on && "bg-primary/5 ring-2 ring-primary"
                )}
              >
                <input type="radio" name="category" value={c} checked={on} onChange={() => changeCategory(c)} className="sr-only" />
                <span className="flex items-center justify-between">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                    <Icon className="size-5" />
                  </span>
                  {on && <Check className="size-4 text-primary" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{CATEGORY_INFO[c].label}</span>
                  <span className="block text-xs text-muted-foreground">{CATEGORY_INFO[c].hint}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company Name (English)" required error={errors.name} hint="Official trade license name in Latin script.">
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Al Afnan Furniture Transfer" autoComplete="organization" />}
        </Field>
        <Field
          label="Company Name (Arabic)"
          required
          error={errors.nameAr}
          hint="مطلوب للإعلانات والحملات الموجهة للجمهور العربي"
          action={<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">RTL</span>}
        >
          {(p) => <Input {...p} dir="rtl" lang="ar" value={values.nameAr} onChange={(e) => set("nameAr", e.target.value)} placeholder="مثال: نقل أثاث الأفنان" />}
        </Field>

        <Field label="Primary Emirate" required error={errors.emirate} hint="The default geo-anchor for localized campaign bids.">
          {(p) => (
            <Select {...p} value={values.emirate} onChange={(e) => {
                set("emirate", e.target.value)
                // the base emirate is implied, so it cannot also be an "other" emirate
                if (values.emiratesServed.includes(e.target.value)) set("emiratesServed", values.emiratesServed.filter((x) => x !== e.target.value))
              }}>
              <option value="" disabled>
                Select primary HQ location
              </option>
              {EMIRATES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Website URL" error={errors.website} hint="Destination for ad landing pages and conversion tags.">
          {(p) => <Input {...p} type="url" inputMode="url" value={values.website} onChange={(e) => set("website", e.target.value)} placeholder="https://alafnanmovers.ae" />}
        </Field>

        <Field label="Contact Phone" required error={errors.phone} hint="Default call extension number for Google Search Ads.">
          {(p) => <PhoneInput {...p} value={values.phone} onChange={(v) => set("phone", v)} />}
        </Field>
        <Field
          label="WhatsApp Booking Line"
          required
          error={errors.whatsapp}
          hint="Direct click-to-chat link used in Meta lead ads."
          action={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sameAsPhone}
                onChange={(e) => setSameAsPhone(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Same as phone
            </label>
          }
        >
          {(p) => <PhoneInput {...p} value={sameAsPhone ? values.phone : values.whatsapp} disabled={sameAsPhone} onChange={(v) => set("whatsapp", v)} />}
        </Field>
        <PlaceField value={values.placeId} error={errors.placeId} companyName={values.name} emirate={values.emirate} onChange={(v) => set("placeId", v)} />
      </div>

      <fieldset className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-sm font-medium">Emirates We Serve</legend>
          {values.emiratesServed.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {values.emiratesServed.length} {values.emiratesServed.length === 1 ? "emirate" : "emirates"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {values.emirate ? `Other emirates you serve besides ${values.emirate}.` : "Pick the primary emirate first, then add the other emirates you serve."} Not used in GBP descriptions.
        </p>
        <div className="flex flex-wrap gap-2 rounded-lg bg-muted/60 p-3">
          {EMIRATES.filter((e) => e !== values.emirate).map((e) => {
            const on = values.emiratesServed.includes(e)
            return (
              <button
                key={e}
                type="button"
                aria-pressed={on}
                onClick={() => set("emiratesServed", on ? values.emiratesServed.filter((x) => x !== e) : [...values.emiratesServed, e])}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors",
                  on ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/10 hover:bg-muted"
                )}
              >
                {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {e}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Field label="Areas Served (key focus neighborhoods)" hint="Press Enter or comma to add. Used for location-anchored pages and GBP geotargets.">
        {(p) => (
          <div className="space-y-2 rounded-lg bg-muted/60 p-3">
            {values.areas.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {values.areas.map((area) => (
                  <li key={area} className="flex items-center gap-1.5 rounded-md bg-background py-1 pr-1 pl-2 text-sm ring-1 ring-foreground/10">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {area}
                    <button
                      type="button"
                      aria-label={`Remove ${area}`}
                      onClick={() => set("areas", values.areas.filter((a) => a !== area))}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                {...p}
                value={areaDraft}
                onChange={(e) => setAreaDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addArea()
                  }
                }}
                placeholder="Type a neighborhood (e.g. Arabian Ranches, Al Majaz)"
              />
              <Button type="button" onClick={addArea} size="lg">
                <Plus /> Add
              </Button>
            </div>
          </div>
        )}
      </Field>

      <fieldset aria-describedby="services-error" className="space-y-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">
            Services Offered <span className="text-destructive">*</span>
          </legend>
          <button
            type="button"
            onClick={() => set("services", allSelected ? customServices : [...predefined, ...customServices])}
            className="text-sm text-primary hover:underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {serviceOptions.map((s) => {
            const checked = values.services.includes(s.value)
            return (
              <label
                key={s.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/60 p-3 ring-1 ring-transparent transition-colors hover:bg-muted has-focus-visible:ring-ring",
                  checked && "ring-primary/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => set("services", checked ? values.services.filter((v) => v !== s.value) : [...values.services, s.value])}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.value}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </label>
            )
          })}
        </div>
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <div className="flex gap-2">
            <Input
              aria-label="Add a custom service"
              value={serviceDraft}
              onChange={(e) => setServiceDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addCustomService()
                }
              }}
              placeholder="e.g. Curtain installation, TV mounting..."
            />
            <Button type="button" onClick={addCustomService} size="lg">
              <Plus /> Add
            </Button>
          </div>
          {customServices.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {customServices.map((service) => (
                <li key={service} className="flex items-center gap-1.5 rounded-full bg-background py-1 pr-1 pl-3 text-sm ring-1 ring-foreground/10">
                  {service}
                  <button
                    type="button"
                    aria-label={`Remove ${service}`}
                    onClick={() => set("services", values.services.filter((s) => s !== service))}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {errors.services && (
          <p id="services-error" role="alert" className="text-xs text-destructive">
            {errors.services}
          </p>
        )}
      </fieldset>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 2 */

function ColorField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} error={error}>
      {(p) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
          />
          <Input {...p} value={value} onChange={(e) => onChange(e.target.value)} placeholder="#0f766e" spellCheck={false} className="font-mono" />
        </div>
      )}
    </Field>
  )
}

function BrandStep({ values, errors, set }: StepProps) {
  return (
    <>
    <Section title="Brand & Style" description="Used to keep generated copy on-brand.">
      <div className="grid gap-5 sm:grid-cols-2">
        <ColorField label="Primary Color" value={values.primaryColor} error={errors.primaryColor} onChange={(v) => set("primaryColor", v)} />
        <ColorField label="Secondary Color" value={values.secondaryColor} error={errors.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
        <Field label="Fleet / Truck Type" hint="e.g. “3-ton closed box truck, white with teal lettering”.">
          {(p) => <Input {...p} value={values.truckType} onChange={(e) => set("truckType", e.target.value)} placeholder="e.g. Mercedes Actros" />}
        </Field>
        <Field label="Staff Uniform" hint="e.g. “Teal polo shirt with embroidered badge, khaki trousers”.">
          {(p) => <Input {...p} value={values.uniform} onChange={(e) => set("uniform", e.target.value)} placeholder="e.g. Teal polo shirt" />}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tone of Voice</legend>
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => {
            const on = values.tones.includes(tone)
            return (
              <button
                key={tone}
                type="button"
                aria-pressed={on}
                onClick={() => set("tones", on ? values.tones.filter((t) => t !== tone) : [...values.tones, tone])}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 transition-colors",
                  on ? "bg-primary text-primary-foreground ring-primary" : "bg-muted/60 ring-transparent hover:bg-muted"
                )}
              >
                {on && <Check className="size-3.5" />}
                {tone}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Field label="Internal Operating Notes" hint="Anything the writers should know (client requests, operating constraints).">
        {(p) => <Textarea {...p} value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Client wants the WhatsApp button prominent on all ad copy." rows={4} />}
      </Field>
    </Section>
    <Section title="Company Profile" description="Everything the client has told you about the business. The landing page generator and other content tools use it so the copy carries real details.">
      <Field
        label="Company Profile"
        error={errors.companyProfile}
        hint={`${values.companyProfile.length.toLocaleString("en-US")} / ${MAX_COMPANY_PROFILE.toLocaleString("en-US")} characters. Paste it from WhatsApp, a brochure or the client's own notes.`}
      >
        {(p) => (
          <Textarea
            {...p}
            value={values.companyProfile}
            onChange={(e) => set("companyProfile", e.target.value)}
            placeholder="Paste the company's full profile: services, selling points, years of experience, fleet details, certifications, pricing advantages, customer testimonials..."
            rows={12}
          />
        )}
      </Field>
    </Section>
    <LinksSection values={values} errors={errors} set={set} />
    </>
  )
}

function LinksSection({ values, errors, set }: StepProps) {
  function updateLink(i: number, patch: Partial<OtherLink>) {
    set("otherLinks", values.otherLinks.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  return (
    <Section title="Links" description="Social pages and the Drive folder. Used by the WhatsApp message on the client page.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Facebook Page URL" error={errors.facebookUrl}>
          {(p) => <Input {...p} type="url" inputMode="url" value={values.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} placeholder="https://facebook.com/alafnanmovers" />}
        </Field>
        <Field label="Instagram Page URL" error={errors.instagramUrl}>
          {(p) => <Input {...p} type="url" inputMode="url" value={values.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} placeholder="https://instagram.com/alafnanmovers" />}
        </Field>
        <Field label="Google Drive Link" error={errors.driveLink} hint="Folder where the client's assets are stored." className="sm:col-span-2">
          {(p) => <Input {...p} type="url" inputMode="url" value={values.driveLink} onChange={(e) => set("driveLink", e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Other Links</legend>
        {values.otherLinks.map((link, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Other link ${i + 1} label`} value={link.label} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder="Label (e.g. TikTok)" className="w-40 shrink-0" />
            <Input aria-label={`Other link ${i + 1} URL`} type="url" inputMode="url" value={link.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://tiktok.com/@alafnan" />
            <Button type="button" variant="outline" size="icon-lg" aria-label={`Remove other link ${i + 1}`} onClick={() => set("otherLinks", values.otherLinks.filter((_, j) => j !== i))} className="size-9 shrink-0">
              <X />
            </Button>
          </div>
        ))}
        {errors.otherLinks && (
          <p role="alert" className="text-xs text-destructive">
            {errors.otherLinks}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => set("otherLinks", [...values.otherLinks, { label: "", url: "" }])}>
          <Plus /> Add link
        </Button>
      </fieldset>
    </Section>
  )
}

/* ------------------------------------------------------------------ step 3 */

function SetupStep({ values, set, edit }: Pick<StepProps, "values" | "set"> & { edit: boolean }) {
  return (
    <Section
      title="Initial Setup"
      description={
        edit
          ? "Content queued to generate for this client."
          : "Select what to generate right after the client is created."
      }
    >
      <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        {edit
          ? "These choices are saved with the client. Saving changes does not generate anything; use the Content, Ads and GBP Posts pages for that."
          : "Click Create Client & Generate and the client is saved first, then each ticked item is generated in order, with progress shown here. Leave an item unticked to do it later from its own page."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {INITIAL_SETUP_OPTIONS.map((o) => {
          const checked = values.initialSetup.includes(o.value)
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/60 p-3 ring-1 ring-transparent transition-colors hover:bg-muted has-focus-visible:ring-ring",
                checked && "ring-primary/40"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => set("initialSetup", checked ? values.initialSetup.filter((v) => v !== o.value) : [...values.initialSetup, o.value])}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </Section>
  )
}
