/**
 * Is this the live site (Vercel)? Vercel sets VERCEL=1 itself, so on your own computer this is false with no setup.
 *
 * A few features cannot run on Vercel: the SEO audit and competitor insights need a real Chrome, and the landing page
 * generator and GBP post writing run for minutes in the background. They are run from the app on your own computer; both
 * use the same database, so what they save shows up on the live site. On the live site they are switched off (see
 * liveDisabled for the API and components/local-only-notice.tsx for the screens), and the Chrome tooling is never loaded.
 */
export const isLive = () => process.env.VERCEL === "1"

/** The answer a switched-off route gives on the live site. */
export const liveDisabled = (feature: string) =>
  Response.json({ error: `${feature} cannot run on the live site. Run it from the app on your computer: the results are saved to the shared database and appear here.` }, { status: 503 })
