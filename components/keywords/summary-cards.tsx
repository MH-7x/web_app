import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card"
import { COMPETITIONS, type KeywordRow } from "@/lib/keywords-types"
import { cn } from "@/lib/utils"

export const COMPETITION_STYLE: Record<string, string> = {
  Low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  High: "bg-destructive/15 text-destructive",
}

const BRACKETS = [
  { label: "0–100", test: (n: number) => n < 100 },
  { label: "100–1K", test: (n: number) => n >= 100 && n < 1_000 },
  { label: "1K–10K", test: (n: number) => n >= 1_000 && n < 10_000 },
  { label: "10K+", test: (n: number) => n >= 10_000 },
]

/** The two cards above the table; they count whatever rows they are given, so they follow the filters. */
export function SummaryCards({ rows }: { rows: KeywordRow[] }) {
  const volumes = BRACKETS.map((b) => ({ label: b.label, count: rows.filter((r) => b.test(r.avgMonthlySearches)).length }))
  const peak = Math.max(1, ...volumes.map((v) => v.count))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle>Search Volume Distribution</CardTitle>
          <Eyebrow>Monthly searches</Eyebrow>
        </CardHeader>
        <CardContent className="pt-4">
          <ul className="flex h-28 items-end gap-3" aria-label="Keywords per search volume bracket">
            {volumes.map((v) => (
              <li key={v.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-medium tabular-nums">{v.count}</span>
                <span className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(v.count ? 4 : 1, (v.count / peak) * 100)}%`, opacity: v.count ? 1 : 0.25 }} />
                <span className="text-[11px] text-muted-foreground">{v.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle>Competition Breakdown</CardTitle>
          <Eyebrow>{rows.length.toLocaleString()} keywords</Eyebrow>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 pt-4">
          {COMPETITIONS.map((c) => (
            <div key={c} className="rounded-lg bg-muted/60 p-3">
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", COMPETITION_STYLE[c])}>{c}</span>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{rows.filter((r) => r.competition === c).length.toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
