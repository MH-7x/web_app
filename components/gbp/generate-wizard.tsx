"use client"

import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Plus, Sparkles, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ErrorNote } from "@/components/content/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input, Label, Select } from "@/components/ui/input"
import { setActiveClientAction } from "@/lib/actions"
import type { GbpJobSnapshot } from "@/lib/gbp-jobs"
import { MAX_KEYWORDS, MAX_WEEKS, POSTS_PER_WEEK, addDays, longDayLabel, weekStart, weekday, type PostLanguage } from "@/lib/gbp-posts-types"
import { cn } from "@/lib/utils"

export type WizardClient = { id: string; name: string; emirate: string; services: string[]; areas: string[] }

const STEPS = ["Business", "Schedule", "Keywords", "Language"] as const

const LANGUAGES: { value: PostLanguage; title: string; hint: string; lang?: string }[] = [
  { value: "en", title: "English", hint: "English posts only" },
  { value: "ar", title: "العربية", hint: "Arabic posts only", lang: "ar" },
  { value: "both", title: "Both", hint: "An Arabic and an English version of every post" },
]

/** Today if there are still 3 posting days left this week (Mon, Wed, Fri), otherwise the start of next week. */
export function defaultStartFor(base: string) {
  return weekday(base) <= 1 ? base : addDays(weekStart(base), 7)
}

function suggestionsFor(c: WizardClient) {
  const e = c.emirate
  const list = [
    ...c.services.slice(0, 4).map((s) => `${s.toLowerCase()} ${e}`),
    `movers and packers in ${e}`,
    `furniture movers ${e}`,
    ...c.areas.slice(0, 2).map((a) => `movers in ${a}`),
  ]
  return [...new Set(list)].slice(0, 8)
}

export function GenerateWizard({
  clients,
  activeClientId,
  baseDate,
  activeJob,
}: {
  clients: WizardClient[]
  activeClientId: string
  /** the day the default start is worked out from: today, or the first of the month being viewed */
  baseDate: string
  activeJob: GbpJobSnapshot | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [clientId, setClientId] = useState(activeClientId)
  const [weeks, setWeeks] = useState(4)
  const [startDate, setStartDate] = useState(defaultStartFor(baseDate))
  const [keywords, setKeywords] = useState<string[]>([])
  const [draft, setDraft] = useState("")
  const [language, setLanguage] = useState<PostLanguage>("both")
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<GbpJobSnapshot | null>(activeJob)

  const client = clients.find((c) => c.id === clientId) ?? clients[0]
  const total = weeks * POSTS_PER_WEEK
  const running = job?.status === "queued" || job?.status === "running"
  const lastWritten = useRef(job?.written ?? 0)
  const handled = useRef<string | null>(null)

  /* ---- follow the running job: poll, and refresh the calendar as posts land ---- */

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/gbp-posts/jobs/${id}`, { cache: "no-store" })
        const body = (await res.json().catch(() => null)) as { job?: GbpJobSnapshot; error?: string } | null
        if (!res.ok || !body?.job) {
          setJob(null)
          setError(body?.error ?? "Lost track of the job.")
          router.refresh()
          return
        }
        setJob(body.job)
      } catch {
        // a dropped request: the next tick tries again
      }
    },
    [router]
  )

  useEffect(() => {
    if (!job || !running) return
    const timer = setInterval(() => void poll(job.id), 2000)
    return () => clearInterval(timer)
  }, [job, running, poll])

  const finish = useCallback(
    async (done: GbpJobSnapshot) => {
      if (done.written === 0) return
      const month = done.firstDate?.slice(0, 7)
      if (done.clientId !== activeClientId) {
        // the posts belong to another business: switch to it so the calendar shows them
        await setActiveClientAction(done.clientId)
        router.push(month ? `/gbp-posts?month=${month}` : "/gbp-posts")
      } else if (month && !baseDate.startsWith(month)) {
        router.push(`/gbp-posts?month=${month}`)
      } else {
        router.refresh()
      }
    },
    [activeClientId, baseDate, router]
  )

  useEffect(() => {
    if (!job) return
    if (job.clientId === activeClientId && job.written !== lastWritten.current) {
      lastWritten.current = job.written
      router.refresh()
    }
    if ((job.status === "completed" || job.status === "failed") && handled.current !== job.id) {
      handled.current = job.id
      if (job.status === "completed") toast.success(`${job.written} ${job.written === 1 ? "post" : "posts"} generated`, { description: "Review them on the calendar." })
      else toast.error("Writing the posts stopped", { description: job.error ?? undefined })
      void finish(job)
    }
  }, [job, activeClientId, router, finish])

  /* ---- wizard ---- */

  function reset() {
    setStep(0)
    setClientId(activeClientId)
    setWeeks(4)
    setStartDate(defaultStartFor(baseDate))
    setKeywords([])
    setDraft("")
    setLanguage("both")
    setError(null)
  }

  const addKeywords = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((k) => k.trim()).filter(Boolean)
    if (!parts.length) return keywords
    const next = [...new Set([...keywords, ...parts.map((p) => p.slice(0, 80))])].slice(0, MAX_KEYWORDS)
    setKeywords(next)
    setDraft("")
    return next
  }

  function next() {
    setError(null)
    if (step === 1 && !startDate) return setError("Choose a start date.")
    if (step === 2) {
      const all = draft.trim() ? addKeywords(draft) : keywords
      if (!all.length) return setError("Add at least one keyword so the posts have something to cover.")
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function generate() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/gbp-posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, weeks, keywords, language, startDate }),
      })
      const body = (await res.json().catch(() => null)) as { job?: GbpJobSnapshot; error?: string } | null
      if (!res.ok || !body?.job) throw new Error(body?.error ?? `Request failed (${res.status}).`)
      lastWritten.current = 0
      handled.current = null
      setJob(body.job)
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
      setError(message)
      toast.error("Couldn't start writing the posts", { description: message })
    } finally {
      setStarting(false)
    }
  }

  const showProgress = job !== null
  // Mon-Fri days left from the start date: fewer than 3 means that week is skipped so no week gets fewer than 3
  const startsNextWeek = startDate !== "" && weekday(startDate) > 3

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next && !running && !job) reset()
      }}
    >
      <DialogTrigger render={<Button size="lg" id="gbp-generate-trigger" />}>
        {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {running ? `Writing ${job!.written}/${job!.total}…` : "Generate Posts"}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        {showProgress ? (
          <ProgressView
            job={job!}
            onDone={() => {
              setJob(null)
              setOpen(false)
              reset()
            }}
            onAnother={() => {
              setJob(null)
              reset()
            }}
          />
        ) : (
          <>
            <DialogTitle>Generate GBP posts</DialogTitle>
            <DialogDescription>Step {step + 1} of {STEPS.length}: {STEPS[step]}</DialogDescription>

            <ol className="mt-4 flex gap-2" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} className="flex-1">
                  <div className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
                  <span className={cn("mt-1.5 block text-[11px] font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 min-h-56 space-y-4">
              {step === 0 && (
                <div className="space-y-2">
                  <Label htmlFor="w-client">Business name</Label>
                  <Select id="w-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {client.emirate}
                    {client.services.length > 0 && ` · ${client.services.length} ${client.services.length === 1 ? "service" : "services"}`}
                    {client.areas.length > 0 && ` · ${client.areas.length} ${client.areas.length === 1 ? "area" : "areas"}`}
                  </p>
                  {clientId !== activeClientId && <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">The calendar will switch to {client.name} when the posts are ready.</p>}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="w-weeks">
                      How many weeks of posts? <span className="font-semibold tabular-nums">{weeks}</span>
                    </Label>
                    <input id="w-weeks" type="range" min={1} max={MAX_WEEKS} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="block h-9 w-full accent-primary" />
                    <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm">
                      <span className="font-medium">{POSTS_PER_WEEK} posts every week</span> → {total} posts in total
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-start">Start from</Label>
                    <Input id="w-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Posts go out Monday, Wednesday and Friday at 10:30 AM GST. Weeks that already have {POSTS_PER_WEEK} posts are skipped, and a week with fewer is topped up.
                      {startsNextWeek && ` ${longDayLabel(startDate)} is too late in the week to fit ${POSTS_PER_WEEK} posts, so posting starts the following week.`}
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <Label htmlFor="w-kw">Keywords to cover in the posts</Label>
                  <div className="flex gap-2">
                    <Input
                      id="w-kw"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault()
                          addKeywords(draft)
                        }
                      }}
                      placeholder="e.g. villa movers in Sharjah"
                      maxLength={80}
                    />
                    <Button type="button" variant="outline" size="lg" onClick={() => addKeywords(draft)}>
                      <Plus /> Add
                    </Button>
                  </div>
                  {keywords.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {keywords.map((k) => (
                        <li key={k} className="flex items-center gap-1.5 rounded-md bg-primary/10 py-1 pr-1 pl-2.5 text-sm text-primary">
                          {k}
                          <button type="button" aria-label={`Remove ${k}`} onClick={() => setKeywords((cur) => cur.filter((x) => x !== k))} className="rounded p-0.5 hover:bg-primary/15">
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Suggestions for {client.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestionsFor(client)
                        .filter((s) => !keywords.includes(s))
                        .map((s) => (
                          <button key={s} type="button" onClick={() => setKeywords((cur) => [...new Set([...cur, s])].slice(0, MAX_KEYWORDS))} className="rounded-md bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                            + {s}
                          </button>
                        ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {keywords.length}/{MAX_KEYWORDS} keywords. Each is worked into the posts naturally and spread across the schedule, so every one is covered at least once.
                  </p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Post language</legend>
                    <div role="radiogroup" aria-label="Post language" className="grid gap-2 sm:grid-cols-3">
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          role="radio"
                          aria-checked={language === l.value}
                          onClick={() => setLanguage(l.value)}
                          className={cn("flex flex-col gap-1 rounded-xl p-3 text-start ring-1 transition-colors", language === l.value ? "bg-primary/5 ring-2 ring-primary" : "bg-muted/40 ring-transparent hover:bg-muted")}
                        >
                          <span className="flex items-center justify-between font-semibold" lang={l.lang}>
                            {l.title}
                            {language === l.value && <Check className="size-4 text-primary" />}
                          </span>
                          <span className="text-xs text-muted-foreground">{l.hint}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <dl className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
                    <Row label="Business" value={client.name} />
                    <Row label="Schedule" value={`${weeks} ${weeks === 1 ? "week" : "weeks"} × ${POSTS_PER_WEEK} posts = ${total} posts`} />
                    <Row label="Starting" value={startDate ? longDayLabel(startDate) : "-"} />
                    <Row label="Keywords" value={keywords.join(", ")} />
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    SEO-optimised, natural-sounding drafts, each with a call to action and an image prompt. Allow about a minute per post. They appear on the calendar as they are written, and you can close this window meanwhile.
                  </p>
                </div>
              )}

              {error && <ErrorNote message={error} />}
            </div>

            <DialogFooter className="justify-between">
              {step > 0 ? (
                <Button variant="outline" size="lg" onClick={() => { setError(null); setStep(step - 1) }} disabled={starting}>
                  <ArrowLeft /> Back
                </Button>
              ) : (
                <DialogClose render={<Button variant="outline" size="lg" />}>Cancel</DialogClose>
              )}
              {step < STEPS.length - 1 ? (
                <Button size="lg" onClick={next}>
                  Next <ArrowRight />
                </Button>
              ) : (
                <Button size="lg" onClick={generate} disabled={starting}>
                  {starting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {starting ? "Starting…" : `Generate ${total} posts`}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium break-words">{value}</dd>
    </div>
  )
}

function ProgressView({ job, onDone, onAnother }: { job: GbpJobSnapshot; onDone: () => void; onAnother: () => void }) {
  const running = job.status === "queued" || job.status === "running"
  const pct = job.total ? Math.round((job.written / job.total) * 100) : 0
  return (
    <div aria-live="polite" className="space-y-5">
      <div className="space-y-1">
        <DialogTitle className="flex items-center gap-2">
          {running ? <Loader2 className="size-5 animate-spin text-primary" /> : job.status === "completed" ? <CheckCircle2 className="size-5 text-emerald-500" /> : null}
          {running ? "Writing your posts" : job.status === "completed" ? "Posts ready" : "Stopped early"}
        </DialogTitle>
        <DialogDescription>{job.message}</DialogDescription>
      </div>

      <div className="space-y-1.5">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Posts written" className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {job.written} of {job.total} posts written
        </p>
      </div>

      {job.error && <ErrorNote message={job.error} />}
      {running && <p className="text-xs text-muted-foreground">You can close this window. Posts keep appearing on the calendar as they are written.</p>}

      <DialogFooter>
        {running ? (
          <DialogClose render={<Button variant="outline" size="lg" />}>Close</DialogClose>
        ) : (
          <>
            <Button variant="outline" size="lg" onClick={onAnother}>
              {job.status === "failed" ? "Try again" : "Generate more"}
            </Button>
            <Button size="lg" onClick={onDone}>
              Done
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  )
}
