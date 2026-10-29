"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { useState } from "react"

import { FormError } from "@/components/auth/auth-card"
import { postJson } from "@/components/auth/auth-api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/input"
import { validatePassword } from "@/lib/password-rules"

type Step = "email" | "answer" | "password" | "done"

/** "Forgot password?": email -> its security question -> answer -> new password. */
export function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) return
    // closing throws everything away, including the reset token
    setStep("email")
    setEmail("")
    setQuestion("")
    setAnswer("")
    setToken("")
    setPassword("")
    setConfirm("")
    setError(null)
  }

  async function run(body: Record<string, unknown>, onOk: (data: Record<string, unknown>) => void) {
    setPending(true)
    setError(null)
    try {
      const { ok, data } = await postJson("/api/auth/reset-password", body)
      if (ok) onOk(data)
      else setError(data.error ?? "Something went wrong. Please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
    setPending(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // This dialog renders inside the login <form> in the React tree (only its DOM is portaled out), so without this the
    // submit would bubble up and also try to sign in with whatever is in the login fields, counting as a failed attempt.
    e.stopPropagation()
    if (pending) return
    if (step === "email") {
      run({ step: "question", email }, (d) => {
        setQuestion(String(d.question ?? ""))
        setStep("answer")
      })
    } else if (step === "answer") {
      run({ step: "verify", email, answer }, (d) => {
        setToken(String(d.resetToken ?? ""))
        setStep("password")
      })
    } else if (step === "password") {
      const problem = validatePassword(password) ?? (password !== confirm ? "The passwords do not match." : null)
      if (problem) return setError(problem)
      run({ step: "reset", resetToken: token, newPassword: password }, () => setStep("done"))
    }
  }

  return (
    <>
      <button type="button" onClick={() => onOpenChange(true)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Forgot password?
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Reset your password</DialogTitle>
          {step === "done" ? (
            <>
              <div className="mt-4 flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>Your password has been changed. You can sign in with it now.</p>
              </div>
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>Back to sign in</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} className="mt-1 space-y-4">
              <DialogDescription>
                {step === "email" && "Enter your account email and we'll ask your security question."}
                {step === "answer" && "Answer your security question to continue."}
                {step === "password" && "Choose a new password."}
              </DialogDescription>

              {step === "email" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fp-email">Email</Label>
                  <Input id="fp-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              {step === "answer" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fp-answer">{question}</Label>
                  <Input id="fp-answer" autoComplete="off" autoFocus required value={answer} onChange={(e) => setAnswer(e.target.value)} />
                </div>
              )}
              {step === "password" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fp-new">New password</Label>
                    <Input id="fp-new" type="password" autoComplete="new-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
                    <p className="text-xs text-muted-foreground">At least 8 characters with an uppercase letter, a lowercase letter and a number.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fp-confirm">Confirm new password</Label>
                    <Input id="fp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </>
              )}

              <FormError message={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || (step === "email" && !email) || (step === "answer" && !answer)}>
                  {pending && <Loader2 className="animate-spin" />}
                  {step === "password" ? "Reset password" : "Continue"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
