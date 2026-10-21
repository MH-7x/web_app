"use client"

import { ExternalLink, Globe, Megaphone, Truck } from "lucide-react"
import { useId, useState } from "react"

import { AdsActionBar, BatchToggle, LimitCounter, langName } from "@/components/ads/parts"
import { useAdsGenerator } from "@/components/ads/use-ads-generator"
import type { AdsClient } from "@/components/ads/workspace"
import { ClientAvatar } from "@/components/client-avatar"
import { ErrorNote, GenerateButton, LanguageToggle, OutputPlaceholder } from "@/components/content/parts"
import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { AD_LIMITS, FB_COUNT, FB_CTAS, FB_CTA_LABELS, FB_OBJECTIVES, metaCsv, type FacebookResult, type FbAd, type FbObjective } from "@/lib/ads-types"
import type { Language } from "@/lib/content-types"
import { downloadFile } from "@/lib/download"
import { cn } from "@/lib/utils"

export function FacebookPanel({ client }: { client: AdsClient }) {
  const g = useAdsGenerator(client.id)
  const [emirate, setEmirate] = useState(client.emirate)
  const [batch, setBatch] = useState(false)
  const [language, setLanguage] = useState<Language>("en")
  const [objective, setObjective] = useState<FbObjective>("messages")
  const [offer, setOffer] = useState("")
  const [audience, setAudience] = useState("")
  const [count, setCount] = useState(FB_COUNT.default)
  const [usedObjective, setUsedObjective] = useState<FbObjective>("messages")

  function run() {
    if (g.dirty && !window.confirm("You have unsaved edits that will be replaced. Generate anyway?")) return
    setUsedObjective(objective)
    void g.generate(language, { emirate, batch, objective, offer: offer.trim(), audience: audience.trim(), count })
  }

  const editGroup = (lang: "en" | "ar", gi: number, ai: number, patch: Partial<FbAd>) =>
    g.edit((cur) => ({
      ...cur,
      [lang]: { groups: cur[lang]!.groups.map((grp, i) => (i === gi ? { ...grp, ads: grp.ads.map((a, j) => (j === ai ? { ...a, ...patch } : a)) } : grp)) } satisfies FacebookResult,
    }))

  const langs = g.result ? (["en", "ar"] as const).filter((l) => g.result![l]) : []
  const total = (batch ? client.emirates.length : 1) * count

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit space-y-5 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Megaphone className="size-4 text-muted-foreground" /> Ad Setup
        </h2>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Campaign objective</legend>
          <div role="radiogroup" aria-label="Campaign objective" className="flex flex-wrap gap-2">
            {FB_OBJECTIVES.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={objective === o.id}
                disabled={g.loading}
                onClick={() => setObjective(o.id)}
                className={cn(
                  "h-8 rounded-full px-4 text-sm font-medium ring-1 transition-colors disabled:opacity-50",
                  objective === o.id ? "bg-primary text-primary-foreground ring-primary" : "bg-muted/60 text-muted-foreground ring-transparent hover:bg-muted"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="fb-emirate">Emirate</Label>
          <Select id="fb-emirate" value={emirate} onChange={(e) => setEmirate(e.target.value)} disabled={batch || g.loading}>
            {client.emirates.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </div>
        <BatchToggle checked={batch} onChange={setBatch} disabled={g.loading || client.emirates.length < 2} />

        <div className="space-y-1.5">
          <Label htmlFor="fb-offer">Offer (optional)</Label>
          <Input id="fb-offer" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. Free packing boxes on villa moves" maxLength={300} />
          <p className="text-xs text-muted-foreground">Only an offer you enter here is ever mentioned.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-audience">Target audience</Label>
          <Textarea id="fb-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Families moving into villas, expats on new tenancy contracts" maxLength={300} className="field-sizing-content min-h-16" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-count">
            Variations{batch ? " per emirate" : ""}: <span className="font-semibold tabular-nums">{count}</span>
          </Label>
          <input id="fb-count" type="range" min={FB_COUNT.min} max={FB_COUNT.max} value={count} onChange={(e) => setCount(Number(e.target.value))} className="block h-6 w-full accent-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Language</p>
          <LanguageToggle value={language} onChange={setLanguage} disabled={g.loading} />
        </div>

        <GenerateButton loading={g.loading} onClick={run}>
          Generate Ads
        </GenerateButton>
        {total > 10 && <p className="-mt-2 text-xs text-muted-foreground">{total} ads in total: this can take a few minutes.</p>}
      </Card>

      <div className="min-w-0 space-y-6">
        {g.error && <ErrorNote message={g.error} onRetry={run} />}

        {g.result ? (
          <>
            <div className={cn("space-y-8", g.loading && "opacity-60")}>
              {langs.map((lang) =>
                g.result![lang]!.groups.map((group, gi) => (
                  <section key={`${lang}-${group.emirate}`} aria-label={`${group.emirate} ads, ${langName(lang)}`} className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <span className="size-1.5 rounded-full bg-primary" /> {group.emirate}
                      {langs.length > 1 && <Badge variant={lang === "ar" ? "default" : "muted"}>{langName(lang)}</Badge>}
                      <span className="text-xs font-normal text-muted-foreground">{group.ads.length} variations</span>
                    </h3>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {group.ads.map((ad, ai) => (
                        <AdCard
                          key={ai}
                          client={client}
                          ad={ad}
                          lang={lang}
                          index={ai + 1}
                          objective={usedObjective}
                          update={(patch) => editGroup(lang, gi, ai, patch)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
            <AdsActionBar
              dirty={g.dirty}
              saveState={g.saveState}
              loading={g.loading}
              exportLabel="Export Meta CSV"
              onExport={() => downloadFile(`${client.slug}-meta-ads.csv`, metaCsv(client.name, client.website, usedObjective, g.result!), "text/csv")}
              onSave={g.save}
              onRegenerate={run}
            />
          </>
        ) : (
          !g.error && <OutputPlaceholder loading={g.loading} onGenerate={run}>Pick an objective and generate Facebook and Instagram ad variations for {client.name}.</OutputPlaceholder>
        )}
      </div>
    </div>
  )
}

/** Feed mockup of one ad, with every text field editable in place. */
function AdCard({
  client,
  ad,
  lang,
  index,
  objective,
  update,
}: {
  client: AdsClient
  ad: FbAd
  lang: "en" | "ar"
  index: number
  objective: FbObjective
  update: (patch: Partial<FbAd>) => void
}) {
  const ctaId = useId()
  const dir = lang === "ar" ? "rtl" : "ltr"
  const domain = (client.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "").toUpperCase()
  const ctas = FB_CTAS[objective].includes(ad.ctaType) ? FB_CTAS[objective] : [ad.ctaType, ...FB_CTAS[objective]]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Variation {index}</span>
        <CopyButton text={`${ad.primaryText}\n\n${ad.headline}\n${ad.description}`} label="Copy" />
      </div>

      <div className="bg-background">
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <ClientAvatar id={client.id} name={client.name} color="var(--primary)" className="size-9 rounded-full" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{client.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Sponsored · <Globe className="size-3" />
            </p>
          </div>
        </div>

        <Textarea
          aria-label={`Variation ${index} primary text`}
          dir={dir}
          lang={lang}
          value={ad.primaryText}
          onChange={(e) => update({ primaryText: e.target.value })}
          className="field-sizing-content min-h-32 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div aria-hidden className="flex aspect-[1.91/1] items-center justify-center bg-gradient-to-br from-primary/25 via-chart-2/20 to-chart-1/30 text-primary/50">
          <div className="flex flex-col items-center gap-1.5">
            <Truck className="size-10" />
            <span className="text-xs font-medium">Image or video goes here</span>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-muted/60 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            {domain && <p className="truncate text-[11px] tracking-wide text-muted-foreground" dir="ltr">{domain}</p>}
            <div className="relative">
              <Input
                aria-label={`Variation ${index} headline`}
                aria-invalid={ad.headline.length > AD_LIMITS.fbHeadline}
                dir={dir}
                lang={lang}
                value={ad.headline}
                onChange={(e) => update({ headline: e.target.value })}
                className="h-8 pe-14 font-semibold"
              />
              <LimitCounter value={ad.headline.length} max={AD_LIMITS.fbHeadline} className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2" />
            </div>
            <div className="relative">
              <Input
                aria-label={`Variation ${index} description`}
                aria-invalid={ad.description.length > AD_LIMITS.fbDescription}
                dir={dir}
                lang={lang}
                value={ad.description}
                onChange={(e) => update({ description: e.target.value })}
                className="h-8 pe-14 text-xs text-muted-foreground"
              />
              <LimitCounter value={ad.description.length} max={AD_LIMITS.fbDescription} className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <span className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs font-semibold ring-1 ring-foreground/10">{FB_CTA_LABELS[ad.ctaType] ?? ad.ctaType}</span>
        </div>
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={ctaId} className="text-xs text-muted-foreground">
            Call to action
          </Label>
          <Select
            id={ctaId}
            value={ad.ctaType}
            onChange={(e) => update({ ctaType: e.target.value })}
            className="h-8 w-auto flex-1 text-xs"
          >
            {ctas.map((c) => (
              <option key={c} value={c}>
                {FB_CTA_LABELS[c] ?? c}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label={`Variation ${index} WhatsApp link`} dir="ltr" readOnly value={ad.whatsappLink} className="h-8 flex-1 font-mono text-xs text-muted-foreground" />
          <a href={ad.whatsappLink} target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp link" className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/10 hover:bg-muted">
            <ExternalLink className="size-4" />
          </a>
          <CopyButton text={ad.whatsappLink} label="Link" />
        </div>
      </div>
    </Card>
  )
}
