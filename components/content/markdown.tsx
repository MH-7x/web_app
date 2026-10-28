import { Fragment, type ReactNode } from "react"

/** Minimal, safe markdown renderer (headings, lists, paragraphs, bold/italic/code/links). Never injects HTML. */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    if (match.index > last) out.push(text.slice(last, match.index))
    if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith("`")) out.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{token.slice(1, -1)}</code>)
    else if (token.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!
      out.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {label}
        </a>
      )
    } else out.push(<em key={key++}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
const isTableRow = (line: string) => line.trim().startsWith("|") && line.indexOf("|", line.indexOf("|") + 1) > 0
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = []
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-4 border-border" />)
      i++
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line)
      const align = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "text-center" : "text-right") : "text-left"))
      i += 2
      const body: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) body.push(cells(lines[i++]))
      blocks.push(
        <div key={key++} className="mt-3 overflow-x-auto">
          <table dir="auto" className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {head.map((h, n) => (
                  <th key={n} className={`border border-border bg-muted px-3 py-1.5 font-semibold ${align[n] ?? "text-left"}`}>
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {head.map((_, n) => (
                    <td key={n} className={`border border-border px-3 py-1.5 align-top ${align[n] ?? "text-left"}`}>
                      {inline(row[n] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const cls = level === 1 ? "text-xl font-semibold" : level === 2 ? "text-lg font-semibold" : "text-base font-semibold"
      blocks.push(
        <p key={key++} role="heading" aria-level={level} dir="auto" className={`${cls} mt-5 first:mt-0`}>
          {inline(heading[2])}
        </p>
      )
      i++
      continue
    }

    const list = /^(\s*)([-*]|\d+[.)])\s+/.exec(line)
    if (list) {
      const ordered = /\d/.test(list[2])
      const items: ReactNode[] = []
      while (i < lines.length && /^(\s*)([-*]|\d+[.)])\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{inline(lines[i].replace(/^(\s*)([-*]|\d+[.)])\s+/, ""))}</li>)
        i++
      }
      const Tag = ordered ? "ol" : "ul"
      blocks.push(
        <Tag key={key++} dir="auto" className={`${ordered ? "list-decimal" : "list-disc"} mt-3 space-y-1 ps-6`}>
          {items}
        </Tag>
      )
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+[.)])\s+)/.test(lines[i]) && !isTableRow(lines[i])) para.push(lines[i++])
    blocks.push(
      <p key={key++} dir="auto" className="mt-3 first:mt-0">
        {para.map((p, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>
}
