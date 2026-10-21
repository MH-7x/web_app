"use client"

import { useState } from "react"

import {
  ActionBar,
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
import { Input, Label, Textarea } from "@/components/ui/input"
import { FAQ_COUNT, type FaqItem, type Language } from "@/lib/content-types"
import { cn } from "@/lib/utils"

export function FaqPanel({ client }: { client: WorkspaceClient }) {
  const g = useGenerator("faq", client.id)
  const [language, setLanguage] = useState<Language>("en")
  const [count, setCount] = useState(FAQ_COUNT.default)
  const [topic, setTopic] = useState("")

  const run = () => {
    if (confirmDiscard(g.dirty)) void g.generate(language, { count, topic: topic.trim() })
  }

  function update(lang: "en" | "ar", index: number, patch: Partial<FaqItem>) {
    g.edit((cur) => ({ ...cur, [lang]: (cur[lang] ?? []).map((item, i) => (i === index ? { ...item, ...patch } : item)) }))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="space-y-1.5">
          <Label htmlFor="faq-count">
            Count: <span className="font-semibold tabular-nums">{count}</span>
          </Label>
          <input
            id="faq-count"
            type="range"
            min={FAQ_COUNT.min}
            max={FAQ_COUNT.max}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="block h-9 w-44 accent-primary"
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="faq-topic">Topic (optional)</Label>
          <Input id="faq-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Villa moving in Sharjah" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Language</p>
          <LanguageToggle value={language} onChange={setLanguage} disabled={g.loading} />
        </div>
        <GenerateButton loading={g.loading} onClick={run}>
          Generate
        </GenerateButton>
      </div>

      {g.error && <ErrorNote message={g.error} onRetry={run} />}

      {g.result ? (
        <>
          <div className={cn("grid gap-4", langsIn(g.result).length > 1 && "xl:grid-cols-2", g.loading && "opacity-60")}>
            {langsIn(g.result).map((lang) => {
              const items = g.result![lang] ?? []
              return (
                <LangCard key={lang} lang={lang} title={`${items.length} FAQ items`}>
                  <ol className="space-y-2">
                    {items.map((item, i) => (
                      <li key={i}>
                        <details open={i === 0} className="group rounded-lg bg-muted/50 open:bg-muted/70">
                          <summary dir={textDir(lang)} className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                            <span className="flex-1">{item.question}</span>
                            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
                              ⌄
                            </span>
                          </summary>
                          <div className="space-y-2 px-3 pb-3">
                            <Input
                              aria-label={`Question ${i + 1}`}
                              dir={textDir(lang)}
                              lang={lang}
                              value={item.question}
                              onChange={(e) => update(lang, i, { question: e.target.value })}
                            />
                            <Textarea
                              aria-label={`Answer ${i + 1}`}
                              dir={textDir(lang)}
                              lang={lang}
                              value={item.answer}
                              onChange={(e) => update(lang, i, { answer: e.target.value })}
                              className="field-sizing-content min-h-20"
                            />
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                </LangCard>
              )
            })}
          </div>
          <ActionBar
            type="faq"
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
        !g.error && <OutputPlaceholder loading={g.loading} onGenerate={run}>Choose how many questions you need and generate FAQ items for {client.name}.</OutputPlaceholder>
      )}
    </div>
  )
}
