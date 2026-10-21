"use client"

import { Plus, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import {
  ActionBar,
  Counter,
  ErrorNote,
  GenerateButton,
  LangCard,
  LanguageToggle,
  OutputPlaceholder,
  confirmDiscard,
  langsIn,
  textDir,
} from "@/components/content/parts"
import { useGenerator } from "@/components/content/use-generator"
import type { WorkspaceClient } from "@/components/content/workspace"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { GBP_HIGHLIGHTS, GBP_MAX_CHARS, type Language } from "@/lib/content-types"
import { cn } from "@/lib/utils"

export function GbpPanel({ client }: { client: WorkspaceClient }) {
  const g = useGenerator("gbp", client.id)
  const [language, setLanguage] = useState<Language>("both")
  const [highlights, setHighlights] = useState<string[]>([])
  const [custom, setCustom] = useState("")

  const run = () => {
    if (confirmDiscard(g.dirty)) void g.generate(language, { highlights, maxChars: GBP_MAX_CHARS })
  }
  const toggle = (h: string) => setHighlights((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]))
  const addCustom = () => {
    const value = custom.trim()
    if (value && !highlights.includes(value)) setHighlights((cur) => [...cur, value])
    setCustom("")
  }
  const options = [...GBP_HIGHLIGHTS, ...highlights.filter((h) => !(GBP_HIGHLIGHTS as readonly string[]).includes(h))]

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit space-y-5 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <SlidersHorizontal className="size-4 text-muted-foreground" /> Generator Setup
        </h2>

        <div className="space-y-2">
          <p className="text-sm font-medium">Target output language</p>
          <LanguageToggle value={language} onChange={setLanguage} disabled={g.loading} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Selling points to include</legend>
          <div className="flex flex-wrap gap-1.5">
            {options.map((h) => {
              const on = highlights.includes(h)
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(h)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                    on ? "bg-primary/10 text-primary ring-primary/40" : "bg-muted/60 text-muted-foreground ring-transparent hover:bg-muted"
                  )}
                >
                  {h}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addCustom()
                }
              }}
              placeholder="Add a custom point"
              aria-label="Custom selling point"
              maxLength={80}
            />
            <button type="button" onClick={addCustom} aria-label="Add selling point" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-muted/70">
              <Plus className="size-4" />
            </button>
          </div>
        </fieldset>

        <dl className="space-y-2 rounded-lg bg-muted/60 p-4 text-sm">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Target parameters</p>
          <Row label="Max character budget" value={`${GBP_MAX_CHARS} chars`} />
          <Row label="Primary category" value="Moving company" />
          <Row label="Area coverage" value={client.areas.slice(0, 3).join(", ") || client.emirate} />
        </dl>

        <GenerateButton loading={g.loading} onClick={run}>
          Generate GBP Description
        </GenerateButton>
      </Card>

      <div className="min-w-0 space-y-4">
        {g.error && <ErrorNote message={g.error} onRetry={run} />}

        {g.result ? (
          <>
            <div className={cn("grid gap-4", langsIn(g.result).length > 1 && "xl:grid-cols-2", g.loading && "opacity-60")}>
              {langsIn(g.result).map((lang) => {
                const text = g.result![lang] ?? ""
                return (
                  <LangCard
                    key={lang}
                    lang={lang}
                    title="Google Business Profile Description"
                    copyText={text}
                    footer={
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Characters</span>
                        <Counter value={text.length} max={GBP_MAX_CHARS} />
                      </div>
                    }
                  >
                    <textarea
                      aria-label={`${lang === "ar" ? "Arabic" : "English"} GBP description`}
                      dir={textDir(lang)}
                      lang={lang}
                      value={text}
                      onChange={(e) => g.edit((cur) => ({ ...cur, [lang]: e.target.value }))}
                      className="field-sizing-content min-h-48 w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
                    />
                  </LangCard>
                )
              })}
            </div>
            <ActionBar
              type="gbp"
              result={g.result}
              clientName={client.name}
              clientSlug={client.slug}
              dirty={g.dirty}
              saveState={g.saveState}
              loading={g.loading}
              onSave={g.save}
              onRegenerate={run}
              humanize={g.humanizer}
            />
          </>
        ) : (
          !g.error && <OutputPlaceholder loading={g.loading} onGenerate={run}>Pick a language and generate a Google Business Profile description for {client.name}.</OutputPlaceholder>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right text-muted-foreground">{value}</dd>
    </div>
  )
}
