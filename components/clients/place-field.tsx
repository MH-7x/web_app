"use client"

import { Check, Loader2, MapPin, Search, Star, X } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"
import { PLACE_ID_PATTERN } from "@/lib/client-schema"
import type { PlaceResult } from "@/lib/reviews-types"
import { cn } from "@/lib/utils"

function Rating({ place }: { place: PlaceResult }) {
  if (place.rating === null) return <span>No reviews yet</span>
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="size-3 fill-amber-400 text-amber-400" />
      {place.rating.toFixed(1)} · {(place.reviewCount ?? 0).toLocaleString("en-US")} reviews
    </span>
  )
}

/** The Google Place ID input. "Search Google" looks the business up by name and emirate so nobody has to dig the ID out of Google Maps. */
export function PlaceField({
  value,
  error,
  companyName,
  emirate,
  onChange,
}: {
  value: string
  error?: string
  companyName: string
  emirate: string
  onChange: (placeId: string) => void
}) {
  const id = useId()
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  /** the business the current Place ID points to, shown so the user can confirm it is the right one */
  const [linked, setLinked] = useState<PlaceResult | null>(null)
  /** an ID Google answered "not found" for */
  const [unknownId, setUnknownId] = useState<string | null>(null)

  const trimmed = value.trim()
  const idLooksValid = PLACE_ID_PATTERN.test(trimmed)
  const checking = idLooksValid && linked?.placeId !== trimmed && unknownId !== trimmed

  // a pasted (or saved) Place ID is looked up, so the card below always matches the ID in the box
  useEffect(() => {
    if (!idLooksValid || linked?.placeId === trimmed) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?id=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        const body = (await res.json().catch(() => null)) as { place?: PlaceResult; error?: string } | null
        if (res.ok && body?.place) setLinked(body.place)
        else setUnknownId(trimmed)
      } catch {
        // aborted by a newer keystroke, or offline: leave the card as it was
      }
    }, 450)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, idLooksValid, linked?.placeId])

  async function search() {
    const name = companyName.trim()
    if (!name) {
      toast.error("Enter the company name first", { description: "The search uses the company name and emirate." })
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(`${name} ${emirate}`.trim())}`)
      const body = (await res.json().catch(() => null)) as { places?: PlaceResult[]; error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      setResults(body?.places ?? [])
    } catch (e) {
      setResults(null)
      toast.error("Google search failed", { description: e instanceof Error ? e.message : "Please try again." })
    } finally {
      setSearching(false)
    }
  }

  function pick(place: PlaceResult) {
    onChange(place.placeId)
    setLinked(place)
    setResults(null)
  }

  const showLinked = linked && linked.placeId === trimmed

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={id}>Google Place ID</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint`}
          placeholder="ChIJ…"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="button" variant="outline" size="lg" onClick={search} disabled={searching} className="shrink-0">
          {searching ? <Loader2 className="animate-spin" /> : <Search />} Search Google
        </Button>
      </div>
      {error ? (
        <p id={`${id}-hint`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Links the client to its Google listing so the Reviews page can fetch its reviews. Search by company name and emirate, or paste the ID.
        </p>
      )}

      {checking && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking this Place ID with Google…
        </p>
      )}
      {unknownId === trimmed && !error && (
        <p role="alert" className="text-xs text-destructive">
          Google could not find a business with this Place ID. Check it for typos, or use Search Google.
        </p>
      )}

      {showLinked && (
        <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-3 text-sm ring-1 ring-primary/30">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{linked.name}</p>
            <p className="text-xs text-muted-foreground">{linked.address}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Rating place={linked} />
            </p>
          </div>
          <button type="button" aria-label="Unlink this place" onClick={() => onChange("")} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}

      {results && (
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{results.length ? "Pick the right business" : "No matching business found on Google"}</p>
            <button type="button" aria-label="Close results" onClick={() => setResults(null)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <ul className="grid gap-2">
            {results.map((p) => (
              <li key={p.placeId}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className={cn("flex w-full items-start gap-3 rounded-lg bg-background p-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", p.placeId === value && "ring-2 ring-primary")}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{p.address}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <Rating place={p} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
