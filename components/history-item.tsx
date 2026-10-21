import { ChevronDown } from "lucide-react"

import { Markdown } from "@/components/content/markdown"
import { CopyButton } from "@/components/copy-button"
import { Badge } from "@/components/ui/badge"
import { CONTENT_TYPES } from "@/lib/constants"
import { timeAgo } from "@/lib/format"

export type HistoryRow = {
  id: string
  type: string
  subtype: string | null
  language: string
  content: string
  contentAr: string | null
  humanized: boolean
  createdAt: Date
  edited: boolean
}

/** Content for a row: English (or the only language) first, then Arabic when generated alongside. */
function versions(row: HistoryRow) {
  const primaryIsArabic = row.language === "ar"
  return [
    { lang: primaryIsArabic ? "ar" : "en", label: primaryIsArabic ? "العربية" : "English", text: row.content },
    ...(row.contentAr ? [{ lang: "ar", label: "العربية", text: row.contentAr }] : []),
  ] as { lang: "en" | "ar"; label: string; text: string }[]
}

export function HistoryItem({ row, now }: { row: HistoryRow; now: Date }) {
  const all = versions(row)

  return (
    <li>
      <details className="group py-3">
        <summary className="flex cursor-pointer list-none items-start gap-4 rounded-lg px-1 py-1 marker:hidden hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">{CONTENT_TYPES[row.type]?.label ?? row.type}</Badge>
              {row.subtype && <span className="text-sm font-medium">{row.subtype}</span>}
              <Badge variant="outline">{row.language === "both" ? "AR + EN" : row.language.toUpperCase()}</Badge>
              {row.humanized && <Badge variant="success">Humanized</Badge>}
              {row.edited && <Badge variant="outline">Edited</Badge>}
              <span className="text-xs text-muted-foreground">{timeAgo(row.createdAt, now)}</span>
            </div>
            <p dir="auto" className="line-clamp-2 text-sm text-muted-foreground group-open:hidden">
              {row.content.replace(/[#*]/g, "")}
            </p>
          </div>
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className={`mt-3 grid gap-3 ${all.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {all.map((v) => (
            <div key={v.lang} className="min-w-0 space-y-2 rounded-lg bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <Badge variant={v.lang === "ar" ? "default" : "muted"} lang={v.lang === "ar" ? "ar" : undefined}>
                  {v.label}
                </Badge>
                <CopyButton text={v.text} />
              </div>
              <div dir={v.lang === "ar" ? "rtl" : "ltr"} lang={v.lang}>
                <Markdown source={v.text} />
              </div>
            </div>
          ))}
        </div>
      </details>
    </li>
  )
}
