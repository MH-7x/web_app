import fs from "node:fs"

import type { Browser } from "puppeteer"

/**
 * Find a Chromium-based browser to drive. Order: PUPPETEER_EXECUTABLE_PATH / CHROME_PATH from .env, Puppeteer's own
 * download (if you ran `npx puppeteer browsers install chrome`), then Chrome or Edge installed on this machine.
 */
export async function findBrowserPath(): Promise<string | null> {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv

  try {
    const puppeteer = (await import("puppeteer")).default
    const bundled = await puppeteer.executablePath()
    if (bundled && fs.existsSync(bundled)) return bundled
  } catch {
    // no bundled browser, fall through to the system ones
  }

  const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[]
  const candidates = [
    ...programFiles.flatMap((base) => [`${base}\\Google\\Chrome\\Application\\chrome.exe`, `${base}\\Microsoft\\Edge\\Application\\msedge.exe`]),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await findBrowserPath()
  if (!executablePath) {
    throw new Error(
      "No Chrome or Edge browser was found for the crawler. Install Chrome, or run `npx puppeteer browsers install chrome`, or set PUPPETEER_EXECUTABLE_PATH in .env."
    )
  }
  const puppeteer = (await import("puppeteer")).default
  // Chrome will not start as root in a container without this, because the container has no user namespaces for its sandbox.
  // Opt-in (the worker's Dockerfile sets it): on a normal machine the sandbox stays on.
  const noSandbox = process.env.CHROME_NO_SANDBOX === "true" ? ["--no-sandbox"] : []
  return puppeteer.launch({ executablePath, headless: true, args: ["--disable-dev-shm-usage", "--no-first-run", "--mute-audio", ...noSandbox] })
}

/** The DevTools port of a launched browser, which Lighthouse connects to. */
export const browserPort = (browser: Browser) => Number(new URL(browser.wsEndpoint()).port)
