/** Tunable settings for the SEO audit. Change a number here and every check that uses it follows. */

export const AUDIT_CONFIG = {
  /** page budget for one crawl (sitemap URLs and discovered links together) */
  maxPages: 150,
  /** pages loaded with images so per-image checks have real sizes (the rest skip images for speed) */
  imagePages: 12,
  /** concurrent browser tabs */
  workers: 3,
  maxExternalLinkChecks: 150,
  maxInternalLinkChecks: 300,
  maxImageProbes: 100,

  thinContentWords: 300,
  titleMin: 15,
  titleMax: 60,
  titlePxMax: 600,
  metaMin: 70,
  metaMax: 160,
  metaPxMax: 960,
  slowTtfbMs: 800,
  maxDepth: 3,
  nearDuplicateTitle: 0.85,
  nearDuplicateContent: 0.8,
  minWordsForDuplicate: 120,
  keywordDensityMax: 3.5, // percent
  imageKbWarn: 200,
  imageKbFail: 500,

  /** key landing pages (besides the homepage) that also get a Lighthouse run */
  lighthouseLandingPages: 2,
} as const

/**
 * Switch checks off by id without touching their code. Set AUDIT_DISABLED_CHECKS in .env as a comma-separated list,
 * for example AUDIT_DISABLED_CHECKS=social-youtube-activity,tech-dmarc
 */
export function disabledChecks(): Set<string> {
  return new Set((process.env.AUDIT_DISABLED_CHECKS ?? "").split(",").map((s) => s.trim()).filter(Boolean))
}
