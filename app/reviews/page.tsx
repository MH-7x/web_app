import { GeminiKeyBanner } from "@/components/gemini-key-banner"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { Suspense } from "react"

import { ReviewsWorkspace, type ReviewFilterState } from "@/components/reviews/workspace"
import { TableSkeleton } from "@/components/skeletons"
import { ACTIVE_CLIENT_COOKIE } from "@/lib/constants"
import { getReviewSummary, listReviewClients, listReviews } from "@/lib/reviews"
import { isReplyStatus, type RatingFilter } from "@/lib/reviews-types"

export const metadata: Metadata = { title: "Reviews" }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function ReviewsPage(props: PageProps<"/reviews">) {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
      <Suspense fallback={null}>
        <GeminiKeyBanner />
      </Suspense>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <ReviewsContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function ReviewsContent({ searchParams }: { searchParams: PageProps<"/reviews">["searchParams"] }) {
  await connection()
  const [sp, jar, clients] = await Promise.all([searchParams, cookies(), listReviewClients()])

  // the top bar's client selector decides the scope; a cookie can outlive its client, so an unknown id means "all clients"
  const cookieId = jar.get(ACTIVE_CLIENT_COOKIE)?.value
  const activeClient = clients.find((c) => c.id === cookieId) ?? null
  const summary = await getReviewSummary(activeClient?.id)

  // URL params are user input: anything unrecognised falls back to "no filter"
  const ratingParam = first(sp.rating)
  const statusParam = first(sp.status)
  const filters: ReviewFilterState = {
    clientId: activeClient?.id ?? "",
    rating: (ratingParam === "positive" || ratingParam === "negative" ? ratingParam : "all") satisfies RatingFilter,
    status: isReplyStatus(statusParam) ? statusParam : "all",
  }

  const reviews = await listReviews({
    clientId: filters.clientId || undefined,
    rating: filters.rating === "all" ? undefined : filters.rating,
    replyStatus: filters.status === "all" ? undefined : filters.status,
  })

  return <ReviewsWorkspace reviews={reviews} summary={summary} clients={clients} activeClient={activeClient} filters={filters} />
}
