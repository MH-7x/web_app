import type { JobSnapshot } from "@/lib/audit/types"
import type { GbpJobSnapshot } from "@/lib/gbp-jobs"
import { workerBaseUrl, workerGetJson } from "@/lib/worker"

/**
 * "Is a job already running for this client?" for server-rendered pages. The jobs live in the worker's memory, so with a
 * worker configured the question is put to it; otherwise this process answers. A worker that does not answer counts as
 * "nothing running": the page still loads, and starting a job reports the problem clearly.
 */
export async function activeAuditJob(clientId: string, userId: string | undefined): Promise<JobSnapshot | null> {
  if (workerBaseUrl()) {
    if (!userId) return null
    return (await workerGetJson<{ job: JobSnapshot | null }>(`/api/seo/audit/active?clientId=${encodeURIComponent(clientId)}`, userId))?.job ?? null
  }
  // dynamic: this module pulls in Chrome tooling, which only belongs where the audit actually runs
  return (await import("@/lib/audit/jobs")).getActiveJob(clientId)
}

export async function activeGbpJob(clientId: string, userId: string | undefined): Promise<GbpJobSnapshot | null> {
  if (workerBaseUrl()) {
    if (!userId) return null
    return (await workerGetJson<{ job: GbpJobSnapshot | null }>(`/api/gbp-posts/jobs/active?clientId=${encodeURIComponent(clientId)}`, userId))?.job ?? null
  }
  return (await import("@/lib/gbp-jobs")).getActiveGbpJob(clientId)
}
