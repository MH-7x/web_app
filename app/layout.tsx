import type { Metadata } from "next"
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"

import { Suspense } from "react"

import { Sidebar, SidebarFallback } from "@/components/sidebar"
import { themeInitScript } from "@/components/theme-toggle"
import { NetworkErrorShim } from "@/components/network-error-shim"
import { Topbar } from "@/components/topbar"
import { Toaster } from "@/components/ui/sonner"
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the init script adds the "dark" class before React hydrates
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased font-sans", geistMono.variable, inter.variable, display.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar />
        </Suspense>
        <Topbar />
        <main className="ml-[200px] min-h-screen px-6 pt-[calc(3rem+1.5rem)] pb-10">{children}</main>
        <Toaster />
        <NetworkErrorShim />
      </body>
    </html>
  )
}
