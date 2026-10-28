"use client"

import { MessageCircle, TriangleAlert, Users } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { AddReviewDialog } from "@/components/reviews/add-review-dialog"
import { CategoryBadge } from "@/components/category-badge"
import { EmptyState } from "@/components/empty-state"
import { Avatar, LanguageTag, ReplyStatusBadge, Stars } from "@/components/reviews/parts"
import { ReplyPanel } from "@/components/reviews/reply-panel"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select } from "@/components/ui/input"
import type { RatingFilter, ReplyStatus, ReviewDTO, ReviewSummary } from "@/lib/reviews-types"
import { cn } from "@/lib/utils"

/** `clientId` comes from the top bar's client selector ("" for all clients); only rating and status live in the URL. */
export type ReviewFilterState = { clientId: string; rating: RatingFilter; status: ReplyStatus | "all" }
type ClientOption = { id: string; name: string }

const COLLAPSED_LENGTH = 220

function filterHref(next: ReviewFilterState) {
  const params = new URLSearchParams()
  if (next.rating !== "all") params.set("rating", next.rating)
  if (next.status !== "all") params.set("status", next.status)
  const query = params.toString()
  return query ? `/reviews?${query}` : "/reviews"
}

export function ReviewsWorkspace({
  reviews: initial,
  summary,
  clients,
  activeClient,
  filters,
}: {
  reviews: ReviewDTO[]
  summary: ReviewSummary
  clients: ClientOption[]
  activeClient: ClientOption | null
  filters: ReviewFilterState
}) {
  const router = useRouter()
  const [reviews, setReviews] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [navigating, startNavigation] = useTransition()

  // the server list changes after adding a review or a filter change; local edits (a saved draft) stay in `reviews` until then
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setReviews(initial)
  }

  const selected = reviews.find((r) => r.id === selectedId) ?? null
  const filtered = filters.rating !== "all" || filters.status !== "all"

  function setFilter(patch: Partial<ReviewFilterState>) {
    setSelectedId(null)
    startNavigation(() => router.push(filterHref({ ...filters, ...patch })))
  }

  function patchReview(id: string, patch: Partial<ReviewDTO>) {
    setReviews((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    // the banner count comes from the server
    router.refresh()
  }

  function removeReview(id: string) {
    setReviews((list) => list.filter((r) => r.id !== id))
    setSelectedId(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end justify-between gap-4 p-6">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Reputation · {activeClient ? <span className="text-primary">{activeClient.name}</span> : "all clients"}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Google Reviews</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {activeClient
              ? "This client's reviews, with a drafted reply ready to paste into Google."
              : "Every review in one inbox, with a drafted reply ready to paste into Google. Pick a client in the top bar to focus on one."}
          </p>
        </div>
        <AddReviewDialog clients={clients} defaultClientId={filters.clientId} onAdded={(id) => { setSelectedId(id); router.refresh() }} onImported={() => router.refresh()} />
      </Card>

      {summary.needsAttention > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          <p className="flex-1 font-medium">
            <Badge variant="destructive" className="mr-2 bg-destructive text-white tabular-nums">
              {summary.needsAttention}
            </Badge>
            negative {summary.needsAttention === 1 ? "review needs" : "reviews need"} attention
          </p>
          <button
            type="button"
            onClick={() => setFilter({ rating: "negative", status: "none" })}
            className="font-medium underline underline-offset-2"
          >
            Show them
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter reviews">
        <Select aria-label="Rating" value={filters.rating} onChange={(e) => setFilter({ rating: e.target.value as RatingFilter })} className="w-44">
          <option value="all">All ratings</option>
          <option value="positive">Positive (4–5★)</option>
          <option value="negative">Negative (1–3★)</option>
        </Select>
        <Select aria-label="Reply status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value as ReviewFilterState["status"] })} className="w-44">
          <option value="all">All statuses</option>
          <option value="none">Needs reply</option>
          <option value="drafted">Draft ready</option>
          <option value="replied">Replied</option>
        </Select>
        {filtered && (
          <button type="button" onClick={() => setFilter({ rating: "all", status: "all" })} className="text-sm text-primary hover:underline">
            Clear filters
          </button>
        )}
        <p className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {navigating ? "Loading…" : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`}
        </p>
      </div>

      {reviews.length === 0 ? (
        <Empty summary={summary} filtered={filtered} clients={clients} defaultClientId={filters.clientId} onAdded={(id) => { setSelectedId(id); router.refresh() }} onImported={() => router.refresh()} />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <ul aria-label="Reviews" className={cn("space-y-3 transition-opacity", navigating && "opacity-60")}>
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} active={review.id === selectedId} onSelect={() => setSelectedId(review.id)} />
              </li>
            ))}
          </ul>

          <aside
            aria-label="Reply"
            className={cn(
              "z-40 overflow-y-auto bg-card p-5 shadow-xl ring-1 ring-foreground/10",
              // below xl the panel slides over the list; at xl it sits beside it
              "fixed inset-y-0 right-0 w-full max-w-md xl:sticky xl:top-18 xl:z-auto xl:block xl:h-[calc(100vh-6rem)] xl:max-w-none xl:rounded-xl xl:shadow-none",
              !selected && "hidden"
            )}
          >
            {selected ? (
              <ReplyPanel key={selected.id} review={selected} onChange={patchReview} onDelete={removeReview} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <MessageCircle className="size-6 text-muted-foreground/60" />
                <p>Select a review to read it and draft a reply.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function ReviewCard({ review, active, onSelect }: { review: ReviewDTO; active: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const long = review.text.length > COLLAPSED_LENGTH
  const shown = long && !expanded ? `${review.text.slice(0, COLLAPSED_LENGTH).trimEnd()}…` : review.text

  return (
    <article className={cn("rounded-xl bg-card ring-1 transition-colors", active ? "ring-2 ring-primary" : "ring-foreground/10 hover:ring-foreground/25")}>
      <button type="button" onClick={onSelect} aria-pressed={active} className="flex w-full items-start gap-3 rounded-t-xl p-4 pb-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={review.authorName} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{review.authorName}</span>
            <Stars rating={review.rating} />
            <span className="text-xs text-muted-foreground" title={new Date(review.publishedAt).toUTCString()}>
              {review.dateLabel}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={review.clientCategory} label={review.clientName} />
            <LanguageTag language={review.language} />
            <ReplyStatusBadge status={review.replyStatus} rating={review.rating} />
          </span>
        </span>
      </button>

      <div className="px-4 pb-4 pl-16">
        <p dir="auto" onClick={onSelect} className="cursor-pointer text-sm leading-relaxed whitespace-pre-line">
          {shown || <span className="text-muted-foreground italic">No text, star rating only.</span>}
        </p>
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-1 text-xs font-medium text-primary hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </article>
  )
}

function Empty({ summary, filtered, clients, defaultClientId, onAdded, onImported }: { summary: ReviewSummary; filtered: boolean; clients: ClientOption[]; defaultClientId: string; onAdded: (id: string) => void; onImported: () => void }) {
  if (summary.totalClients === 0) {
    return (
      <EmptyState icon={Users} title="No clients yet" description="Add a client first, then paste in their Google reviews to draft replies.">
        <Link href="/clients/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Add a client
        </Link>
      </EmptyState>
    )
  }
  if (filtered && summary.total > 0) {
    return <EmptyState icon={MessageCircle} title="No reviews match these filters" description="Try a different rating or status." />
  }
  return (
    <EmptyState icon={MessageCircle} title="No reviews yet" description="Import reviews or connect a client's place ID to fetch them. You can also copy one from Google Maps and add it here, then draft a reply, copy it back into Google and track what is answered.">
      <AddReviewDialog clients={clients} defaultClientId={defaultClientId} onAdded={onAdded} onImported={onImported} />
    </EmptyState>
  )
}
