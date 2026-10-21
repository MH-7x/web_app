/**
 * Deterministic detectors for the most mechanical signs of AI writing (from the humanizer guide).
 * They are blended with the model's judgement in scoreContent, and shown as chips in the UI.
 * English only: the word lists mean nothing in Arabic.
 */

export type PatternHit = { id: string; label: string; count: number }

type Pattern = { id: string; label: string; re: RegExp; weight: number }

const anyOf = (list: string[]) => new RegExp(`\\b(?:${list.join("|")})\\b`, "gi")

const PATTERNS: Pattern[] = [
  {
    id: "ai-vocabulary",
    label: "AI vocabulary",
    weight: 3,
    re: anyOf([
      "delve[sd]?",
      "tapestry",
      "testament",
      "pivotal",
      "intricate",
      "intricacies",
      "interplay",
      "underscor(?:e|es|ed|ing)",
      "showcas(?:e|es|ed|ing)",
      "foster(?:s|ed|ing)?",
      "garner(?:s|ed|ing)?",
      "vibrant",
      "enduring",
      "additionally",
      "landscape",
      "crucial",
    ]),
  },
  {
    id: "promotional",
    label: "Promotional language",
    weight: 3,
    re: /\b(?:nestled|breathtaking|stunning|must-visit|renowned|groundbreaking|world-class|state-of-the-art|cutting-edge|seamless(?:ly)?|unparalleled|second to none|top-notch|boasts?)\b|in the heart of|leading (?:moving|company|provider)|comprehensive (?:range|services|solutions)|wide range of/gi,
  },
  {
    id: "significance",
    label: "Inflated significance",
    weight: 3,
    re: /\b(?:stands? as|serves? as|marks? a|is a testament|plays? a (?:vital|crucial|key|pivotal|significant) role|evolving landscape|rich (?:cultural )?heritage|commitment to|dedicated to)\b/gi,
  },
  { id: "-ing-tail", label: "Tacked-on -ing phrases", weight: 2, re: /,\s*(?:ensuring|highlighting|underscoring|showcasing|reflecting|symbolizing|fostering|contributing to|emphasizing|enhancing)\b/gi },
  { id: "negative-parallel", label: "“Not just X, it’s Y”", weight: 3, re: /\b(?:it'?s|it is|this is) not (?:just|merely|only|simply)\b|\bnot only\b[^.]{0,80}\bbut(?: also)?\b/gi },
  { id: "filler", label: "Filler phrases", weight: 2, re: /\b(?:in order to|due to the fact that|at this point in time|it is important to note|it'?s worth noting|in the event that|has the ability to|when it comes to)\b/gi },
  { id: "authority", label: "Authority tropes", weight: 2, re: /\b(?:the real question is|at its core|what really matters|the heart of the matter|fundamentally)\b/gi },
  { id: "signposting", label: "Signposting", weight: 2, re: /\b(?:let'?s dive|let'?s explore|let'?s break this down|here'?s what you need to know|without further ado)\b/gi },
  { id: "chatbot", label: "Chatbot artifacts", weight: 4, re: /\b(?:i hope this helps|great question|certainly!|of course!|let me know if|as an ai|here is (?:a|an|the) )\b/gi },
  { id: "vague-attribution", label: "Vague attributions", weight: 2, re: /\b(?:experts (?:say|believe|argue)|industry (?:reports|experts|observers)|studies (?:show|suggest)|observers have)\b/gi },
  { id: "generic-conclusion", label: "Generic conclusion", weight: 2, re: /\b(?:the future looks bright|exciting times|in conclusion|in today'?s (?:fast-paced|rapidly evolving|digital) )\b/gi },
  { id: "em-dash", label: "Em dashes", weight: 1, re: /—/g },
  { id: "curly-quotes", label: "Curly quotes", weight: 1, re: /[“”‘’]/g },
  { id: "emoji", label: "Emoji", weight: 1, re: /\p{Extended_Pictographic}/gu },
  { id: "bold", label: "Bold markup", weight: 1, re: /\*\*[^*\n]+\*\*/g },
]

const wordCount = (text: string) => (text.match(/[\p{L}\p{N}']+/gu) ?? []).length

/** True when the text is mostly Arabic script, where the English detectors do not apply. */
export const isMostlyArabic = (text: string) => {
  const letters = text.match(/\p{L}/gu) ?? []
  if (!letters.length) return false
  return letters.filter((c) => /[؀-ۿ]/.test(c)).length / letters.length > 0.5
}

export function findPatterns(text: string): PatternHit[] {
  if (isMostlyArabic(text)) return []
  return PATTERNS.map((p) => ({ id: p.id, label: p.label, count: (text.match(p.re) ?? []).length })).filter((h) => h.count > 0)
}

/** 0-100 from how many tells there are per 100 words. Short texts are judged on the same density. */
export function heuristicScore(text: string): number {
  if (isMostlyArabic(text)) return 0
  const count = wordCount(text)
  if (!count) return 0
  const weighted = PATTERNS.reduce((sum, p) => sum + (text.match(p.re) ?? []).length * p.weight, 0)
  const per100 = (weighted / Math.max(count, 25)) * 100
  // 8 weighted tells per 100 words is as bad as it gets
  return Math.min(100, Math.round((per100 / 8) * 100))
}
