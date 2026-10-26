"use client"

import { Building2, Check, Loader2, Moon, Sun } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import { toast } from "sonner"
import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input, Label, Textarea } from "@/components/ui/input"
import type { BusinessSettings } from "@/lib/business-types"
import { cn } from "@/lib/utils"

/** The theme lives on <html class="dark">. Watching that class keeps this switch in step with the top bar toggle. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}
const isDark = () => document.documentElement.classList.contains("dark")

export function GeneralTab({ business }: { business: BusinessSettings }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)

  function set(next: boolean) {
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      // storage unavailable (private mode): the theme just will not persist
    }
  }

  return (
    <div className="space-y-5">
      <Card className="max-w-xl space-y-5 p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-0.5">
            <p id="dark-label" className="flex items-center gap-2 text-sm font-medium">
              {dark ? <Moon className="size-4" /> : <Sun className="size-4" />} Dark mode
            </p>
            <p className="text-sm text-muted-foreground">Switch between the light and dark themes. Your choice is remembered in this browser.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-labelledby="dark-label"
            onClick={() => set(!dark)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", dark ? "bg-primary" : "bg-muted-foreground/30")}
          >
            <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", dark && "translate-x-5")} />
          </button>
        </div>
      </Card>

      <BusinessCard initial={business} />
    </div>
  )
}

/** The name, tagline and terms printed on every proposal. */
function BusinessCard({ initial }: { initial: BusinessSettings }) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof BusinessSettings, v: string) => setValues((s) => ({ ...s, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/business", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
      const body = (await res.json().catch(() => null)) as { settings?: BusinessSettings; error?: string } | null
      if (!res.ok || !body?.settings) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setValues(body.settings)
      toast.success("Business details saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-2xl p-5">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="size-4 text-muted-foreground" /> Business details
          </h2>
          <p className="text-sm text-muted-foreground">Used on the cover, header, contact page and terms of every proposal.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" value={values.businessName} onChange={(e) => set("businessName", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-tagline">Tagline</Label>
            <Input id="biz-tagline" value={values.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={150} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="biz-phone">Phone / WhatsApp</Label>
            <Input id="biz-phone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} placeholder="+971 50 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-email">Email</Label>
            <Input id="biz-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} maxLength={120} placeholder="hello@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-website">Website</Label>
            <Input id="biz-website" value={values.website} onChange={(e) => set("website", e.target.value)} maxLength={200} placeholder="www.example.com" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Shown in the “Let’s work together” contact block on the last page of a proposal. Leave any empty to hide it.</p>
        <div className="space-y-1.5">
          <Label htmlFor="biz-terms">Terms and conditions</Label>
          <Textarea id="biz-terms" value={values.terms} onChange={(e) => set("terms", e.target.value)} rows={6} maxLength={6000} placeholder="e.g. Prices exclude VAT. Work starts after the first payment. Changes outside the agreed pages are quoted separately." />
          <p className="text-xs text-muted-foreground">Printed as the footer of every proposal. Leave empty for none.</p>
        </div>
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Header preview:{" "}
          <span className="font-medium text-foreground">
            {values.businessName || "Your business"}
            {values.tagline && ` · ${values.tagline}`}
          </span>
        </p>
        {error && <ErrorNote message={error} />}
        <Button type="submit" disabled={saving || !values.businessName.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />} Save details
        </Button>
      </form>
    </Card>
  )
}
