"use client"

import { Eye, EyeOff, Loader2, LogIn } from "lucide-react"
import { useEffect, useState } from "react"

import { AuthCard, FormError, PageLoading } from "@/components/auth/auth-card"
import { fetchSetupNeeded, goTo, postJson } from "@/components/auth/auth-api"
import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export function LoginForm() {
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [lockedFor, setLockedFor] = useState(0) // seconds left on a rate-limit lock

  // No account yet -> the setup wizard. Already signed in -> the dashboard.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [needed, me] = await Promise.all([fetchSetupNeeded(), fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.ok).catch(() => false)])
      if (cancelled) return
      if (needed) return goTo("/setup")
      if (me) return goTo("/")
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (lockedFor <= 0) return
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockedFor])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending || lockedFor > 0) return
    setPending(true)
    setError(null)
    try {
      const { ok, status, data } = await postJson("/api/auth/login", { email, password, rememberMe })
      if (ok) return goTo("/") // keep the spinner up while the page changes
      if (status === 429 && typeof data.retryAfter === "number") setLockedFor(data.retryAfter)
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
    setPending(false)
  }

  if (!ready) return <PageLoading />

  return (
    <AuthCard title="Sign in" subtitle="Sign in to manage your clients">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <Input id="login-password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10 [&::-ms-reveal]:hidden" />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="size-4 accent-primary" />
            Remember me
          </label>
          <ForgotPasswordDialog />
        </div>

        <FormError message={error} />

        <Button type="submit" size="lg" className="w-full" disabled={pending || lockedFor > 0 || !email || !password}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          {lockedFor > 0 ? `Try again in ${mmss(lockedFor)}` : pending ? "Signing in…" : "Login"}
        </Button>
      </form>
    </AuthCard>
  )
}
