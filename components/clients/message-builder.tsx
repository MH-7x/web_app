"use client"

import { MessageCircle, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"

export const DEFAULT_TEMPLATE = `Here are the digital assets for {{clientName}}:

🌐 Website: {{website}}
📘 Facebook: {{facebookUrl}}
📸 Instagram: {{instagramUrl}}
📁 Project Assets: {{driveLink}}
{{otherLinks}}`

const STORAGE_KEY = "client-message-template"

type Values = {
  clientName: string
  website: string
  facebookUrl: string
  instagramUrl: string
  driveLink: string
  /** one "🔗 Label: url" line per extra link */
  otherLinks: string
}

/**
 * Fill the template. A line whose placeholders are all empty is dropped, so a client without Instagram
 * has no Instagram line. Lines without placeholders (greetings, sign-offs) are always kept.
 */
export function buildMessage(template: string, values: Values) {
  const lines = template.split(/\r?\n/).flatMap((line) => {
    const names = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
    if (names.length && names.every((n) => !(values[n as keyof Values] ?? "").trim())) return []
    return [line.replace(/\{\{(\w+)\}\}/g, (_, n: string) => values[n as keyof Values] ?? "")]
  })
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

type Props = {
  clientName: string
  /** digits only, with country code, for wa.me */
  whatsapp: string
  website: string | null
  facebookUrl: string
  instagramUrl: string
  driveLink: string
  otherLinks: { label: string; url: string }[]
}

export function MessageBuilder({ clientName, whatsapp, website, facebookUrl, instagramUrl, driveLink, otherLinks }: Props) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)

  // the edited template is kept in this browser and used for every client
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (saved) setTemplate(saved)
    } catch {}
  }, [])

  function change(next: string) {
    setTemplate(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }

  const message = useMemo(
    () =>
      buildMessage(template, {
        clientName,
        website: website ?? "",
        facebookUrl,
        instagramUrl,
        driveLink,
        otherLinks: otherLinks.map((l) => `🔗 ${l.label.trim() || "Link"}: ${l.url}`).join("\n"),
      }),
    [template, clientName, website, facebookUrl, instagramUrl, driveLink, otherLinks]
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="message-template" className="text-xs font-medium text-muted-foreground">
            Template
          </label>
          {template !== DEFAULT_TEMPLATE && (
            <Button type="button" variant="ghost" size="sm" onClick={() => change(DEFAULT_TEMPLATE)}>
              <RotateCcw /> Reset
            </Button>
          )}
        </div>
        <Textarea id="message-template" value={template} onChange={(e) => change(e.target.value)} rows={8} spellCheck={false} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">
          Placeholders: {"{{clientName}} {{website}} {{facebookUrl}} {{instagramUrl}} {{driveLink}} {{otherLinks}}"}. Lines with an empty value are hidden.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <pre dir="auto" className="rounded-lg bg-muted/60 p-4 font-sans text-sm break-words whitespace-pre-wrap">
          {message || "Nothing to show yet. Add links on the Edit Client page."}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={message} label="Copy Message" />
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!message}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4"
        >
          <MessageCircle /> Open in WhatsApp
        </a>
      </div>
    </div>
  )
}
