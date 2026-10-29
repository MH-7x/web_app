"use client"

import { ArrowLeft, ArrowRight, Check, Loader2, Rocket } from "lucide-react"
import { useEffect, useState } from "react"

import { AuthCard, FormError, PageLoading } from "@/components/auth/auth-card"
import { fetchSetupNeeded, goTo, postJson } from "@/components/auth/auth-api"
import { Button } from "@/components/ui/button"
import { Input, Label, Select } from "@/components/ui/input"
import { normalizeEmail, passwordStrength, validateEmail, validateName, validatePassword } from "@/lib/password-rules"
import { SECURITY_QUESTIONS } from "@/lib/security-questions"
import { cn } from "@/lib/utils"

const CUSTOM = "__custom__"
const STEPS = ["Account", "Security question", "Ready"] as const
const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"] as const
const STRENGTH_COLOR = ["", "bg-destructive", "bg-chart-2/70", "bg-chart-3", "bg-chart-4"] as const

function StrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password)
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full bg-muted", i <= score && STRENGTH_COLOR[score])} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{password ? `Strength: ${STRENGTH[score]}` : "At least 8 characters with an uppercase letter, a lowercase letter and a number."}</p>
    </div>
  )
}

export function SetupForm() {
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [choice, setChoice] = useState<string>(SECURITY_QUESTIONS[0])
  const [custom, setCustom] = useState("")
  const [answer, setAnswer] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Setup is a one-time thing: once an account exists this page leads nowhere but the login.
  useEffect(() => {
    let cancelled = false
    fetchSetupNeeded().then((needed) => {
      if (cancelled) return
      if (needed === false) goTo("/login")
      else setReady(true) // null (check failed) still shows the form; the API enforces the rule anyway
    })
    return () => {
      cancelled = true
    }
  }, [])

  const question = choice === CUSTOM ? custom.trim() : choice

  function next() {
    setError(null)
    if (step === 0) {
      const problem = validateName(name.trim()) ?? validateEmail(normalizeEmail(email)) ?? validatePassword(password) ?? (password !== confirm ? "The passwords do not match." : null)
      if (problem) return setError(problem)
    } else if (step === 1) {
      if (question.length < 3) return setError("Choose a question, or write your own.")
      if (!answer.trim()) return setError("Enter an answer to your security question.")
    }
    setStep((s) => s + 1)
  }

  async function create() {
    setPending(true)
    setError(null)
    try {
      const { ok, data } = await postJson("/api/auth/setup", { name: name.trim(), email: normalizeEmail(email), password, securityQuestion: question, securityAnswer: answer })
      if (ok) return goTo("/login")
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
    setPending(false)
  }

  if (!ready) return <PageLoading />

  return (
    <AuthCard title={["Create admin account", "Security question", "Ready!"][step]} subtitle="Initial setup">
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/15 text-primary ring-1 ring-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-xs sm:block", i === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (pending) return
          if (step < 2) next()
          else void create()
        }}
        className="space-y-4"
        noValidate
      >
        {step === 0 && (
          <>
            <p className="text-sm text-muted-foreground">This is the first time the dashboard is being used. Create the super admin account that manages everyone else.</p>
            <div className="space-y-1.5">
              <Label htmlFor="su-name">Full name</Label>
              <Input id="su-name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-email">Email</Label>
              <Input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-password">Password</Label>
              <Input id="su-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <StrengthMeter password={password} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-confirm">Confirm password</Label>
              <Input id="su-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={confirm !== "" && confirm !== password} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">If you forget your password, answering this question lets you set a new one. Pick something only you would know.</p>
            <div className="space-y-1.5">
              <Label htmlFor="su-question">Question</Label>
              <Select id="su-question" value={choice} onChange={(e) => setChoice(e.target.value)}>
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
                <option value={CUSTOM}>Custom question…</option>
              </Select>
            </div>
            {choice === CUSTOM && (
              <div className="space-y-1.5">
                <Label htmlFor="su-custom">Your question</Label>
                <Input id="su-custom" maxLength={200} autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="su-answer">Answer</Label>
              <Input id="su-answer" autoComplete="off" maxLength={200} value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <p className="text-xs text-muted-foreground">Capital letters and extra spaces don&apos;t matter when you answer later.</p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">Check these details, then create your account.</p>
            <dl className="space-y-2 rounded-lg bg-muted/60 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{name.trim()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{normalizeEmail(email)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">Super admin</dd>
              </div>
            </dl>
          </>
        )}

        <FormError message={error} />

        <div className="flex items-center justify-between gap-2 pt-1">
          {step > 0 ? (
            <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => (setError(null), setStep((s) => s - 1))}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button type="submit" size="lg">
              Next <ArrowRight />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
              {pending ? "Creating…" : "Create Account & Start"}
            </Button>
          )}
        </div>
      </form>
    </AuthCard>
  )
}
