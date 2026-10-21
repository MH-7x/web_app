"use client"

import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Script run in <head> before paint so the saved theme never flashes. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark")
    try {
      localStorage.setItem("theme", dark ? "dark" : "light")
    } catch {
      // storage unavailable (private mode) - theme just won't persist
    }
  }

  // Both icons render and CSS picks one, so server and client markup always match.
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </Button>
  )
}
