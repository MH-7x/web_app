"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** The theme is the "dark" class on <html>, so the toasts follow the top bar toggle and Settings. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}
const current = () => (document.documentElement.classList.contains("dark") ? "dark" : "light")

export function Toaster(props: ToasterProps) {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as const)
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      duration={4000}
      toastOptions={{ classNames: { toast: "font-sans" } }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--card)",
          "--success-text": "var(--card-foreground)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--card)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--destructive)",
          "--border-radius": "var(--radius-lg, 0.75rem)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
