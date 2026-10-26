"use client"

import { Check, Download, Loader2, Pencil, RefreshCw, Save, Search, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { CompetitorInsights, type CompetitorAnalysis } from "@/components/content/competitor-insights"
import { LandingPreview, SeoChecklist } from "@/components/content/landing-page-preview"
import { ErrorNote, GenerateButton, LanguageToggle, OutputPlaceholder, confirmDiscard, langsIn } from "@/components/content/parts"
import type { WorkspaceClient } from "@/components/content/workspace"
import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { MAX_COMPETITOR_URLS, parseCompetitorUrls, type SerpBrief } from "@/lib/competitor-types"
import type { Language } from "@/lib/content-types"
import { buildLandingHtml } from "@/lib/landing-page-html"
import { MAX_KEYWORD_LENGTH, MAX_SECONDARY_KEYWORDS, PAGE_TYPES, countPlaceholders, landingMarkdown, type LandingOptions, type LandingPage, type LandingPageType, type LandingResult } from "@/lib/landing-page-types"
import { cn } from "@/lib/utils"

type Generated = { language: Language; options: LandingOptions; result: LandingResult }

export function LandingPagePanel({ client }: { client: WorkspaceClient }) {
  const [language, setLanguage] = useState<Language>("en")
  const [primaryKeyword, setPrimaryKeyword] = useState("")
  const [secondary, setSecondary] = useState("")
  const [emirate, setEmirate] = useState(client.emirates[0] ?? "")
  const [service, setService] = useState(client.services[0] ?? "")
  const [pageType, setPageType] = useState<LandingPageType>("service")
  const [keywordError, setKeywordError] = useState<string | null>(null)
  const [competitorText, setCompetitorText] = useState("")
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Generated | null>(null)
  const [view, setView] = useState<"en" | "ar">("en")
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Edit mode is on: the preview shows inputs */
  const [editing, setEditing] = useState(false)
  /** edited since it was generated or last saved */
  const [dirty, setDirty] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const competitorUrls = parseCompetitorUrls(competitorText)
  const tooManyUrls = competitorText.split(/[\s,]+/).filter(Boolean).length > MAX_COMPETITOR_URLS
  /** The analysis only applies to the keywords, service and pages it was run for. */
  const signature = JSON.stringify([primaryKeyword.trim().toLowerCase(), secondary.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean), emirate, service.trim(), pageType, competitorUrls])
  const analysisCurrent = analysis !== null && analysis.signature === signature
  const brief: SerpBrief | null = analysisCurrent ? analysis.brief : null

  async function analyze(refresh: boolean) {
    const primary = primaryKeyword.trim()
    if (!primary) return setKeywordError("Enter the primary keyword before analyzing competitors.")
    if (!service.trim()) return setKeywordError("Choose the service this page is for.")
    if (!competitorUrls.length) return setAnalysisError("Paste at least one competitor page address.")
    setKeywordError(null)
    setAnalysisError(null)
    setAnalyzing(true)
    try {
      const res = await fetch("/api/content/landing-page/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          urls: competitorUrls,
          refresh,
          options: { primaryKeyword: primary, secondaryKeywords: secondary.split(",").map((k) => k.trim()).filter(Boolean), emirate, service: service.trim(), pageType },
        }),
      })
      const body = (await res.json().catch(() => null)) as { pages?: CompetitorAnalysis["pages"]; errors?: CompetitorAnalysis["errors"]; brief?: SerpBrief | null; error?: string } | null
      if (!res.ok || !body || body.error) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setAnalysis({ signature, pages: body.pages ?? [], errors: body.errors ?? [], brief: body.brief ?? null })
      if (body.brief) toast.success("Competitors analyzed", { description: `${body.pages?.length ?? 0} pages read. The brief will shape the next page.` })
      else toast.error("No competitor page could be read", { description: "See the reasons below." })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setAnalysisError(message)
      toast.error("Couldn't analyze competitors", { description: message })
    } finally {
      setAnalyzing(false)
    }
  }

  async function run() {
    const primary = primaryKeyword.trim()
    if (!primary) return setKeywordError("Enter the primary keyword.")
    const secondaryKeywords = secondary.split(",").map((k) => k.trim()).filter(Boolean)
    if (secondaryKeywords.length > MAX_SECONDARY_KEYWORDS) return setKeywordError(`Use up to ${MAX_SECONDARY_KEYWORDS} secondary keywords.`)
    if (!service.trim()) return setKeywordError("Choose the service this page is for.")
    setKeywordError(null)
    if (!confirmDiscard(dirty)) return

    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/content/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, language, options: { primaryKeyword: primary, secondaryKeywords, emirate, service: service.trim(), pageType, competitorUrls: brief ? competitorUrls : [], serpBrief: brief } }),
        signal: controller.signal,
      })
      const body = (await res.json().catch(() => null)) as (Generated & { error?: undefined }) | { error: string } | null
      if (!res.ok || !body || "error" in body) throw new Error(body && "error" in body && body.error ? body.error : `Request failed (${res.status}).`)
      setGenerated(body)
      setView(langsIn(body.result).includes("en") ? "en" : "ar")
      setSavedId(null)
      setDirty(false)
      setEditing(false)
      toast.success("Landing page generated", { description: "Review it, then save it to the client's history." })
    } catch (e) {
      if (controller.signal.aborted) return
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't generate", { description: message })
    } finally {
      if (abort.current === controller) setLoading(false)
    }
  }

  function editPage(lang: "en" | "ar", next: LandingPage) {
    setGenerated((g) => (g ? { ...g, result: { ...g.result, [lang]: next } } : g))
    setDirty(true)
  }

  async function save() {
    if (!generated || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/content/landing-page/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, language: generated.language, options: generated.options, result: generated.result, id: savedId }),
      })
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null
      if (!res.ok || !body?.id) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setSavedId(body.id)
      setDirty(false)
      toast.success("Saved to history")
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  function downloadHtml(lang: "en" | "ar") {
    const page = generated?.result[lang]
    if (!page) return
    const html = buildLandingHtml(page, { lang, phone: client.phone, whatsapp: client.whatsapp, brandColor: client.primaryColor, clientName: client.name })
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${page.meta.slug || "landing-page"}${generated.language === "both" ? `-${lang}` : ""}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const langs = generated ? langsIn(generated.result) : []
  const page = generated?.result[view] ?? (generated ? generated.result[langs[0]] : undefined)
  const shownLang = generated?.result[view] ? view : langs[0]
  const placeholders = page ? countPlaceholders(page) : 0

  return (
    <div className="space-y-5">
      <div
        role="note"
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-sm ring-1",
          client.hasCompanyProfile ? "bg-card text-muted-foreground ring-foreground/10" : "bg-amber-500/10 text-amber-900 ring-amber-500/30 dark:text-amber-200"
        )}
      >
        {!client.hasCompanyProfile && <TriangleAlert className="size-4 shrink-0" />}
        <span>
          {client.hasCompanyProfile
            ? "Uses the company profile from the client's settings."
            : "This client has no company profile yet, so every company fact will come out as a [PLACEHOLDER] marker."}
        </span>
        <Link href={`/clients/${client.id}/edit`} className="font-medium text-primary hover:underline">
          Edit Profile
        </Link>
      </div>

      <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lp-primary">
              Primary keyword <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lp-primary"
              value={primaryKeyword}
              maxLength={MAX_KEYWORD_LENGTH}
              onChange={(e) => {
                setPrimaryKeyword(e.target.value)
                setKeywordError(null)
              }}
              aria-invalid={Boolean(keywordError)}
              placeholder="e.g. villa movers in Dubai"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-secondary">Secondary keywords</Label>
            <Input id="lp-secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="Comma-separated, up to 5" />
          </div>
        </div>
        {keywordError && (
          <p role="alert" className="text-xs text-destructive">
            {keywordError}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lp-competitors">Competitor pages that rank for these keywords</Label>
          <Textarea
            id="lp-competitors"
            value={competitorText}
            onChange={(e) => {
              setCompetitorText(e.target.value)
              setAnalysisError(null)
            }}
            rows={3}
            aria-invalid={tooManyUrls}
            placeholder={"One address per line, up to " + MAX_COMPETITOR_URLS + "\nhttps://example.com/villa-movers-dubai"}
            dir="ltr"
            className="font-mono text-[13px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void analyze(false)} disabled={analyzing || loading || competitorUrls.length === 0}>
              {analyzing ? <Loader2 className="animate-spin" /> : <Search />}
              {analyzing ? "Reading pages…" : analysis ? "Analyze again" : "Analyze competitors"}
            </Button>
            {analysis && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void analyze(true)} disabled={analyzing || loading || competitorUrls.length === 0} title="Read the pages again instead of using the saved copy">
                <RefreshCw /> Refresh pages
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {tooManyUrls ? `Only the first ${MAX_COMPETITOR_URLS} addresses are used. ` : ""}
              Optional. Only the pages you paste are read, and saved for 30 days. The new page learns their structure and gaps; their wording is never reused.
            </span>
          </div>
          {analysisError && (
            <p role="alert" className="text-xs text-destructive">
              {analysisError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <div className="w-44 space-y-1.5">
            <Label htmlFor="lp-emirate">Emirate</Label>
            <Select id="lp-emirate" value={emirate} onChange={(e) => setEmirate(e.target.value)}>
              {client.emirates.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="lp-service">Service</Label>
            {client.services.length ? (
              <Select id="lp-service" value={service} onChange={(e) => setService(e.target.value)}>
                {client.services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id="lp-service" value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Villa moving" />
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Page type</p>
            <div role="radiogroup" aria-label="Page type" className="inline-flex rounded-lg bg-muted p-1">
              {PAGE_TYPES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={pageType === p.value}
                  disabled={loading}
                  onClick={() => setPageType(p.value)}
                  className={cn(
                    "h-7 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50",
                    pageType === p.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Language</p>
            <LanguageToggle value={language} onChange={setLanguage} disabled={loading} />
          </div>
          <GenerateButton loading={loading} onClick={() => void run()}>
            Generate
          </GenerateButton>
        </div>
      </div>

      {analyzing && !analysis && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
          <Loader2 className="size-4 animate-spin text-primary" /> Reading the competitor pages. This can take up to a minute.
        </div>
      )}
      {analysis && <CompetitorInsights analysis={analysis} stale={!analysisCurrent} />}

      {error && <ErrorNote message={error} onRetry={() => void run()} />}

      {generated && page && shownLang ? (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            {langs.length > 1 && (
              <div role="tablist" aria-label="Page language" className="mr-2 inline-flex rounded-lg bg-muted p-1">
                {(["en", "ar"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={shownLang === l}
                    lang={l === "ar" ? "ar" : undefined}
                    onClick={() => setView(l)}
                    className={cn("h-7 rounded-md px-3 text-sm font-medium", shownLang === l ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {l === "ar" ? "العربية" : "English"}
                  </button>
                ))}
              </div>
            )}
            <Button type="button" variant={editing ? "default" : "outline"} size="sm" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
              {editing ? <Check /> : <Pencil />}
              {editing ? "Done editing" : "Edit"}
            </Button>
            <CopyButton text={landingMarkdown(page)} label="Copy as Markdown" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadHtml(shownLang)}>
              <Download /> Download HTML
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void save()} disabled={saving || (savedId !== null && !dirty)}>
              {saving ? <Loader2 className="animate-spin" /> : savedId && !dirty ? <Check /> : <Save />}
              {saving ? "Saving…" : savedId ? (dirty ? "Save changes" : "Saved to history") : "Save to History"}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">Unsaved edits</span>}
            {placeholders > 0 && (
              <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
                {placeholders} placeholder{placeholders === 1 ? "" : "s"} to fill before publishing
              </span>
            )}
          </div>

          <SeoChecklist page={page} options={generated.options} lang={shownLang} />
          <LandingPreview page={page} lang={shownLang} editing={editing} onChange={(next) => editPage(shownLang, next)} />
        </div>
      ) : (
        !error && (
          <OutputPlaceholder loading={loading} onGenerate={() => void run()}>
            Enter the keyword the ad targets and choose the service. The page is written from {client.name}&apos;s company profile, with a marker wherever a fact is missing.
          </OutputPlaceholder>
        )
      )}
    </div>
  )
}
