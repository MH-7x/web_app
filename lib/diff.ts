/** Word-level diff for the before/after view. Pure, so it runs in the browser. */

export type Piece = { text: string; changed: boolean }

const tokenize = (s: string) => s.match(/\s+|[^\s]+/g) ?? []
const norm = (t: string) => t.toLowerCase().replace(/[.,;:!?"'()“”‘’]+$/g, "")

/**
 * Splits both texts into words and marks the words that are not part of the longest common run.
 * Returns pieces for the original (what was removed or reworded) and for the new text (what was added).
 */
export function diffWords(before: string, after: string): { before: Piece[]; after: Piece[] } {
  const a = tokenize(before)
  const b = tokenize(after)
  const words = (t: string[]) => t.map((x) => (/^\s+$/.test(x) ? "" : norm(x)))
  const A = words(a)
  const B = words(b)

  // shrink the problem: shared prefix and suffix need no table
  let start = 0
  while (start < A.length && start < B.length && A[start] === B[start]) start++
  let endA = A.length
  let endB = B.length
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--
    endB--
  }

  const keepA = new Array<boolean>(A.length).fill(false)
  const keepB = new Array<boolean>(B.length).fill(false)
  for (let i = 0; i < start; i++) keepA[i] = keepB[i] = true
  for (let i = endA; i < A.length; i++) keepA[i] = true
  for (let i = endB; i < B.length; i++) keepB[i] = true

  const n = endA - start
  const m = endB - start
  // 6M cells is a few MB of Uint16; past that, highlight the whole middle rather than freeze the tab
  if (n > 0 && m > 0 && n * m <= 6_000_000) {
    const w = m + 1
    const table = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const x = A[start + i]
        table[i * w + j] = x !== "" && x === B[start + j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      const x = A[start + i]
      if (x !== "" && x === B[start + j]) {
        keepA[start + i] = keepB[start + j] = true
        i++
        j++
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++
      else j++
    }
  }

  return { before: group(a, keepA), after: group(b, keepB) }
}

/** Merge neighbouring tokens into runs; whitespace between two changed words stays inside the highlight. */
function group(tokens: string[], keep: boolean[]): Piece[] {
  const pieces: Piece[] = []
  tokens.forEach((t, i) => {
    const isSpace = /^\s+$/.test(t)
    const changed = isSpace ? Boolean(pieces.at(-1)?.changed) && keep[i + 1] === false : !keep[i]
    const last = pieces.at(-1)
    if (last && last.changed === changed) last.text += t
    else pieces.push({ text: t, changed })
  })
  return pieces
}
