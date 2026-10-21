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
import { Markdown } from "@/components/content/markdown"
import { useGenerator } from "@/components/content/use-generator"
import type { WorkspaceClient } from "@/components/content/workspace"
import { Input, Label, Select, Textarea } from "@/components/ui/input"
import { BLOG_WORD_COUNTS, type BlogPost, type Language } from "@/lib/content-types"
import { cn } from "@/lib/utils"

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export function BlogPanel({ client }: { client: WorkspaceClient }) {
  const g = useGenerator("blog", client.id)
  const [language, setLanguage] = useState<Language>("en")
  const [topic, setTopic] = useState("")
  const [keyword, setKeyword] = useState("")
  const [wordCount, setWordCount] = useState<number>(900)
  const [topicError, setTopicError] = useState(false)
  const [editing, setEditing] = useState<{ en: boolean; ar: boolean }>({ en: false, ar: false })

  const run = () => {
    if (!topic.trim()) {
      setTopicError(true)
      return
    }
    setTopicError(false)
    if (confirmDiscard(g.dirty)) void g.generate(language, { topic: topic.trim(), keyword: keyword.trim(), wordCount })
  }

  function update(lang: "en" | "ar", patch: Partial<BlogPost>) {
    g.edit((cur) => ({ ...cur, [lang]: { ...cur[lang]!, ...patch } }))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label htmlFor="blog-topic">
            Topic <span className="text-destructive">*</span>
          </Label>
          <Input
            id="blog-topic"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value)
              setTopicError(false)
            }}
            aria-invalid={topicError}
            placeholder="e.g. How to prepare large appliances for a summer move"
            maxLength={200}
          />
          {topicError && <p className="text-xs text-destructive">Enter a blog topic.</p>}
        </div>
        <div className="w-52 space-y-1.5">
          <Label htmlFor="blog-keyword">Target keyword</Label>
          <Input id="blog-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="movers in Sharjah" maxLength={100} />
        </div>
        <div className="w-36 space-y-1.5">
          <Label htmlFor="blog-words">Word count</Label>
          <Select id="blog-words" value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))}>
            {BLOG_WORD_COUNTS.map((n) => (
              <option key={n} value={n}>
                ~{n} words
              </option>
            ))}
          </Select>
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
              const post = g.result![lang]!
              const isEditing = editing[lang]
              return (
                <LangCard
                  key={lang}
                  lang={lang}
                  title={`${wordsIn(post.body)} words`}
                  footer={
                    <div className="flex items-center justify-between gap-3">
                      <div role="tablist" aria-label="View mode" className="flex gap-1 text-xs">
                        {(["Preview", "Edit Markdown"] as const).map((label) => {
                          const on = (label === "Edit Markdown") === isEditing
                          return (
                            <button
                              key={label}
                              role="tab"
                              aria-selected={on}
                              type="button"
                              onClick={() => setEditing((cur) => ({ ...cur, [lang]: label === "Edit Markdown" }))}
                              className={cn("rounded px-2 py-1 font-medium", on ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      <span className="text-xs text-muted-foreground">Meta description</span>
                      <Counter value={post.metaDescription.length} max={160} />
                    </div>
                  }
                >
                  <div className="space-y-3" dir={textDir(lang)} lang={lang}>
                    <Input
                      aria-label="Post title"
                      value={post.title}
                      onChange={(e) => update(lang, { title: e.target.value })}
                      className="h-10 text-base font-semibold"
                    />
                    <Input
                      aria-label="Meta description"
                      value={post.metaDescription}
                      onChange={(e) => update(lang, { metaDescription: e.target.value })}
                      placeholder="Meta description"
                      className="text-muted-foreground"
                    />
                    {isEditing ? (
                      <Textarea
                        aria-label="Post body (markdown)"
                        value={post.body}
                        onChange={(e) => update(lang, { body: e.target.value })}
                        className="field-sizing-content min-h-96 font-mono text-[13px] leading-relaxed"
                      />
                    ) : (
                      <div className="rounded-lg bg-muted/40 p-4">
                        <Markdown source={post.body} />
                      </div>
                    )}
                  </div>
                </LangCard>
              )
            })}
          </div>
          <ActionBar
            type="blog"
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
        !g.error && <OutputPlaceholder loading={g.loading} onGenerate={run}>Enter a topic and an optional target keyword to draft a blog post for {client.name}.</OutputPlaceholder>
      )}
    </div>
  )
}
