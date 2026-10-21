/** Text utilities for the audit: duplicate detection, readability, language detection. */

const ARABIC = /[؀-ۿݐ-ݿ]/g
const LETTER = /\p{L}/gu

export const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Share of letters that are Arabic script, 0 to 1. */
export function arabicRatio(text: string) {
  const letters = text.match(LETTER)?.length ?? 0
  return letters ? (text.match(ARABIC)?.length ?? 0) / letters : 0
}

export const isArabicText = (text: string) => arabicRatio(text) >= 0.4

/* -------------------------------------------------------- near-duplicates */

const K = 64

function hash32(s: string, seed: number) {
  let h = (2166136261 ^ seed) >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** MinHash signature over 5-word shingles; two signatures' match rate estimates how similar the texts are. */
export function minhash(text: string): number[] | null {
  const w = words(text)
  if (w.length < 20) return null
  const shingles = new Set<string>()
  for (let i = 0; i + 5 <= w.length; i++) shingles.add(w.slice(i, i + 5).join(" "))
  const sig = new Array<number>(K).fill(0xffffffff)
  for (const s of shingles) {
    for (let k = 0; k < K; k++) {
      const h = hash32(s, k * 7919 + 1)
      if (h < sig[k]) sig[k] = h
    }
  }
  return sig
}

export function similarity(a: number[], b: number[]) {
  let same = 0
  for (let i = 0; i < K; i++) if (a[i] === b[i]) same++
  return same / K
}

/** Jaccard overlap of the word sets of two short strings (titles). */
export function wordOverlap(a: string, b: string) {
  const A = new Set(words(a))
  const B = new Set(words(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

/* -------------------------------------------------------------- readability */

function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups?.length ?? 1)
}

/** Flesch reading ease for English text: 60-70 is plain English, below 30 is very hard. */
export function fleschReadingEase(text: string) {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().split(/\s+/).length > 2)
  const ws = text.match(/[A-Za-z']+/g) ?? []
  if (sentences.length < 3 || ws.length < 50) return null
  const syl = ws.reduce((n, w) => n + syllables(w), 0)
  return Math.round(206.835 - 1.015 * (ws.length / sentences.length) - 84.6 * (syl / ws.length))
}

/** How many times the keyword appears as a share of all words, in percent. */
export function keywordDensity(text: string, keyword: string) {
  const w = words(text)
  const k = words(keyword)
  if (!w.length || !k.length) return 0
  let hits = 0
  for (let i = 0; i + k.length <= w.length; i++) if (k.every((t, j) => w[i + j] === t)) hits++
  return Math.round(((hits * k.length) / w.length) * 1000) / 10
}

/** Case/spacing-insensitive "contains" for a phrase. */
export const containsPhrase = (text: string, phrase: string) => words(text).join(" ").includes(words(phrase).join(" "))
