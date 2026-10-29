import type { Metadata } from "next"
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Sidebar, SidebarFallback } from "@/components/sidebar"
import { themeInitScript } from "@/components/theme-toggle"
import { NetworkErrorShim } from "@/components/network-error-shim"
import { Topbar } from "@/components/topbar"
import { Toaster } from "@/components/ui/sonner"
import { getSession } from "@/lib/auth"
import { isPublicPage } from "@/lib/auth-token"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

/** The heading face of the proposal document. */
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "700"] })

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: { default: "UAE Marketing Hub", template: "%s · UAE Marketing Hub" },
  description: "Marketing dashboard for managing UAE moving company clients.",
}

/**
 * Signed in: the sidebar and top bar around the page. Signed out: just the page, which is only ever /login or /setup.
 * proxy.ts is what keeps strangers (and deactivated users) out. This is only a fallback for the chrome: Next renders
 * the page in parallel with this layout, so this redirect is NOT a data boundary and must not be relied on as one.
 */
async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, h] = await Promise.all([getSession(), headers()])
  // set by proxy.ts. Missing means proxy.ts did not run, so fail closed and treat the page as protected
  const pathname = h.get("x-pathname") ?? ""
  if (isPublicPage(pathname)) return <>{children}</>
  if (!session) redirect("/login")

  return (
    <>
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar />
      </Suspense>
      <Topbar user={{ name: session.name, email: session.email, role: session.role }} />
      <main className="ml-[200px] min-h-screen px-6 pt-[calc(3rem+1.5rem)] pb-10">{children}</main>
    </>
  )
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the init script adds the "dark" class before React hydrates
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased font-sans", geistMono.variable, inter.variable, display.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        {/* reads the session cookie, which is runtime data, so it streams in behind this boundary */}
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
        <Toaster />
        <NetworkErrorShim />
      </body>
    </html>
  )
}
