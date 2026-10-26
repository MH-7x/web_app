import { Badge } from "@/components/ui/badge"
import { STATUSES, type ProjectStatus } from "@/lib/proposals-types"

const VARIANT = { draft: "muted", sent: "default", accepted: "success", declined: "destructive" } as const

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUSES.find((s) => s.value === status)?.label ?? status}</Badge>
}
