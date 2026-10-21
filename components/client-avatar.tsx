import { cn } from "@/lib/utils"

// Tints come from the chart tokens so they follow the theme in light and dark.
const TINTS = [
  "bg-chart-1/30 text-chart-5 dark:text-chart-1",
  "bg-chart-2/30 text-chart-5 dark:text-chart-1",
  "bg-chart-3/25 text-chart-5 dark:text-chart-1",
  "bg-muted text-muted-foreground",
  "bg-primary/15 text-primary dark:text-primary-foreground",
]

function hash(value: string) {
  let h = 0
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?"
}

export function ClientAvatar({
  id,
  name,
  className,
  color,
}: {
  id: string
  name: string
  className?: string
  color?: string | null
}) {
  return (
    <span
      aria-hidden
      style={color ? { backgroundColor: color, color: "white" } : undefined}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
        !color && TINTS[hash(id) % TINTS.length],
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
