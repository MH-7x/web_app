/** POST JSON to an auth route. Resolves with the parsed body whatever the status, so forms can show `error` themselves. */
export async function postJson<T extends object = Record<string, unknown>>(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; retryAfter?: number }
  return { ok: res.ok, status: res.status, data }
}

/** Does the app still need its first-run setup? null when the check itself failed. */
export async function fetchSetupNeeded(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/auth/setup", { cache: "no-store" })
    if (!res.ok) return null
    return ((await res.json()) as { needed?: boolean }).needed === true
  } catch {
    return null
  }
}

/** A hard navigation, not router.push: the root layout decides sidebar-or-not once per load and must be re-run. */
export function goTo(path: string) {
  window.location.assign(path)
}
