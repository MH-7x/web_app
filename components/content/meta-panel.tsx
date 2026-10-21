"use client"

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
import { Input, Textarea } from "@/components/ui/input"
import {
  META_DESCRIPTION_MAX,
  metaPageChoices,
  META_TITLE_MAX,
  pageLabel,
  type Language,
  type MetaEntry,
} from "@/lib/content-types"
import { cn } from "@/lib/utils"

export function MetaPanel({ client }: { client: WorkspaceClient }) {
  const g = useGenerator("meta", client.id)
  const [language, setLanguage] = useState<Language>("en")
  const [pages, setPages] = useState<string[]>(["home", "services"])

  const choices = metaPageChoices(client)

  const run = () => {
    if (pages.length && confirmDiscard(g.dirty)) void g.generate(language, { pages })
  }

  function update(lang: "en" | "ar", index: number, patch: Partial<MetaEntry>) {
    g.edit((cur) => ({ ...cur, [lang]: (cur[lang] ?? []).map((m, i) => (i === index ? { ...m, ...patch } : m)) }))
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Pages</legend>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((c) => {
              const on = pages.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPages((cur) => (on ? cur.filter((p) => p !== c.id) : [...cur, c.id]))}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm ring-1 transition-colors",
                    on ? "bg-primary/10 font-medium text-primary ring-primary/40" : "bg-muted/60 text-muted-foreground ring-transparent hover:bg-muted"
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
          {client.areas.length === 0 && <p className="text-xs text-muted-foreground">Add areas to the client profile to generate area pages.</p>}
          <p className="text-xs text-muted-foreground">Home, services hub and each service, About, Contact, then area pages.</p>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Language</p>
            <LanguageToggle value={language} onChange={setLanguage} disabled={g.loading} />
          </div>
          <GenerateButton loading={g.loading} onClick={run} disabled={pages.length === 0}>
            Generate
          </GenerateButton>
          {pages.length === 0 && <p className="text-sm text-muted-foreground">Select at least one page.</p>}
        </div>
      </div>

      {g.error && <ErrorNote message={g.error} onRetry={run} />}

      {g.result ? (
        <>
          <div className={cn("grid gap-4", langsIn(g.result).length > 1 && "xl:grid-cols-2", g.loading && "opacity-60")}>
            {langsIn(g.result).map((lang) => {
              const entries = g.result![lang] ?? []
              return (
                <LangCard key={lang} lang={lang} title={`${entries.length} ${entries.length === 1 ? "page" : "pages"}`}>
                  <ul className="space-y-5" dir={textDir(lang)} lang={lang}>
                    {entries.map((entry, i) => (
                      <li key={entry.page} className="space-y-2">
                        <p dir="ltr" className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                          {pageLabel(entry.page)}
                        </p>
                        <div className="space-y-1">
                          <Input
                            aria-label={`${pageLabel(entry.page)} title tag`}
                            value={entry.title}
                            onChange={(e) => update(lang, i, { title: e.target.value })}
                            aria-invalid={entry.title.length > META_TITLE_MAX}
                          />
                          <div dir="ltr" className="flex justify-between text-xs text-muted-foreground">
                            <span>Title tag</span>
                            <Counter value={entry.title.length} max={META_TITLE_MAX} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Textarea
                            aria-label={`${pageLabel(entry.page)} meta description`}
                            value={entry.description}
                            onChange={(e) => update(lang, i, { description: e.target.value })}
                            aria-invalid={entry.description.length > META_DESCRIPTION_MAX}
                            className="field-sizing-content min-h-16"
                          />
                          <div dir="ltr" className="flex justify-between text-xs text-muted-foreground">
                            <span>Meta description</span>
                            <Counter value={entry.description.length} max={META_DESCRIPTION_MAX} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </LangCard>
              )
            })}
          </div>
          <ActionBar
            type="meta"
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
        !g.error && <OutputPlaceholder loading={g.loading} onGenerate={run}>Select the pages you need and generate title tags and meta descriptions for {client.name}.</OutputPlaceholder>
      )}
    </div>
  )
}
