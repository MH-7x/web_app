"use client"

import { Check, Minus, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { readingTarget, wordTarget, type CompetitorSummary, type SerpBrief } from "@/lib/competitor-types"
import { cn } from "@/lib/utils"

export type CompetitorAnalysis = {
  /** what the analysis was run for; compared with the form to tell when it is out of date */
  signature: string
  pages: CompetitorSummary[]
  errors: { url: string; message: string }[]
  brief: SerpBrief | null
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const age = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
}

function Yes({ on, label }: { on: boolean; label: string }) {
  return on ? <Check aria-label={`${label}: yes`} className="mx-auto size-4 text-primary" /> : <Minus aria-label={`${label}: no`} className="mx-auto size-4 text-muted-foreground/50" />
}

function Group({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul className="list-disc space-y-0.5 ps-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/** What the competitor pages look like, and the brief the writer will follow. */
export function CompetitorInsights({ analysis, stale, children }: { analysis: CompetitorAnalysis; stale: boolean; children?: ReactNode }) {
  const { pages, errors, brief } = analysis
  const b = brief?.benchmark
  const target = wordTarget(brief)

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">Competitor analysis</h3>
        <div className="flex items-center gap-2">
          {stale ? (
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
              Out of date: analyze again to use it
            </Badge>
          ) : brief ? (
            <Badge variant="success">Used for the next page</Badge>
          ) : null}
          {children}
        </div>
      </div>

      <div className={cn("space-y-5 p-4 text-sm", stale && "opacity-70")}>
        {pages.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="py-1.5 pe-3 font-medium">Page</th>
                  <th className="px-2 text-end font-medium">Words</th>
                  <th className="px-2 text-end font-medium">H2s</th>
                  <th className="px-2 text-end font-medium">Images</th>
                  <th className="px-2 text-center font-medium">FAQ</th>
                  <th className="px-2 text-center font-medium">Process</th>
                  <th className="px-2 text-center font-medium">Call</th>
                  <th className="px-2 text-center font-medium">WhatsApp</th>
                  <th className="px-2 text-center font-medium">Keyword in title</th>
                  <th className="px-2 text-center font-medium">Keyword in H1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pages.map((p) => (
                  <tr key={p.url}>
                    <td className="py-2 pe-3">
                      <a href={p.finalUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                        {host(p.finalUrl)}
                      </a>
                      <span className="block text-xs text-muted-foreground">
                        {p.language === "ar" ? "Arabic" : "English"} · read {p.cached ? `${age(p.fetchedAt)} (cached)` : "just now"}
                      </span>
                    </td>
                    <td className="px-2 text-end tabular-nums">{p.wordCount}</td>
                    <td className="px-2 text-end tabular-nums">{p.outline.filter((o) => o.level === 2).length}</td>
                    <td className="px-2 text-end tabular-nums">{p.images.count}</td>
                    <td className="px-2"><Yes on={p.hasFaq} label="FAQ" /></td>
                    <td className="px-2"><Yes on={p.hasProcess} label="Process" /></td>
                    <td className="px-2"><Yes on={p.ctas.tel} label="Call button" /></td>
                    <td className="px-2"><Yes on={p.ctas.whatsapp} label="WhatsApp button" /></td>
                    <td className="px-2"><Yes on={p.keyword.inTitle} label="Keyword in title" /></td>
                    <td className="px-2"><Yes on={p.keyword.inH1} label="Keyword in H1" /></td>
                  </tr>
                ))}
                {b && (
                  <tr className="font-medium">
                    <td className="py-2 pe-3">Median / share</td>
                    <td className="px-2 text-end tabular-nums">{b.wordCountMedian}</td>
                    <td className="px-2 text-end tabular-nums">{b.h2Median}</td>
                    <td className="px-2 text-end tabular-nums">{b.imageMedian}</td>
                    <td className="px-2 text-center tabular-nums">{b.faqPercent}%</td>
                    <td className="px-2 text-center tabular-nums">{b.processPercent}%</td>
                    <td className="px-2 text-center tabular-nums">{b.telPercent}%</td>
                    <td className="px-2 text-center tabular-nums">{b.whatsappPercent}%</td>
                    <td className="px-2 text-center tabular-nums">{b.keywordInTitlePercent}%</td>
                    <td className="px-2 text-center tabular-nums">{b.keywordInH1Percent}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
            {errors.map((e) => (
              <li key={e.url} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium break-all">{host(e.url)}</span>: {e.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        {brief && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Search intent</p>
              <p>{brief.intent}</p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">How the ranking pages are built</p>
              <p>{brief.winningPattern}</p>
            </div>
            {brief.commonSections.length > 0 && (
              <div className="space-y-1 md:col-span-2">
                <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Sections most of them share (the new page includes every one)</p>
                <ul className="flex flex-wrap gap-1.5">
                  {brief.commonSections.map((s, i) => (
                    <li key={i}>
                      <Badge variant="muted">{s}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Group title="Gaps we can fill" items={brief.contentGaps} />
            <Group title="Question themes that recur" items={brief.faqThemes} />
            <Group title="Angles to stand out" items={brief.differentiation} />
            <div className="space-y-1">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Targets for the new page</p>
              <p>
                {target.max > 0 && (
                  <>
                    <span className="font-semibold tabular-nums">
                      {target.min}-{target.max}
                    </span>{" "}
                    words (the pages that rank have a median of {brief.benchmark.wordCountMedian}),{" "}
                  </>
                )}
                <span className="font-semibold tabular-nums">{brief.recommendedImageCount}</span> images, reading ease{" "}
                <span className="font-semibold tabular-nums">{readingTarget(brief)}+</span>
                {brief.benchmark.readingEaseMedian !== null && <> (ranking pages: {brief.benchmark.readingEaseMedian})</>}
              </p>
              {brief.notes && <p className="text-muted-foreground">{brief.notes}</p>}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
