import type { Metadata } from "next"

import { SetupForm } from "@/components/auth/setup-form"

export const metadata: Metadata = { title: "Initial setup" }

export default function SetupPage() {
  return <SetupForm />
}
