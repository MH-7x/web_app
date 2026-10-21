"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** The theme lives on <html class="dark">. Watching that class keeps this switch in step with the top bar toggle. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}
const isDark = () => document.documentElement.classList.contains("dark")

export function GeneralTab() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)

  function set(next: boolean) {
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      // storage unavailable (private mode): the theme just will not persist
    }
  }

  return (
    <Card className="max-w-xl space-y-5 p-5">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-0.5">
          <p id="dark-label" className="flex items-center gap-2 text-sm font-medium">
            {dark ? <Moon className="size-4" /> : <Sun className="size-4" />} Dark mode
          </p>
          <p className="text-sm text-muted-foreground">Switch between the light and dark themes. Your choice is remembered in this browser.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dark}
          aria-labelledby="dark-label"
          onClick={() => set(!dark)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", dark ? "bg-primary" : "bg-muted-foreground/30")}
        >
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", dark && "translate-x-5")} />
        </button>
      </div>
    </Card>
  )
}
