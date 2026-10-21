import { readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

const ENV_PATH = path.join(process.cwd(), ".env")

/** Show enough of a secret to recognise it, never all of it. */
export function maskSecret(value: string | undefined) {
  if (!value) return null
  if (value.length < 12) return "••••••••"
  return `${value.slice(0, 4)}${"•".repeat(Math.min(24, value.length - 8))}${value.slice(-4)}`
}

/**
 * Set NAME=value in the .env file, keeping every other line, comment and the quoting style of the line being replaced.
 * Also updates process.env so the running server uses the value straight away.
 */
export async function setEnvValue(name: string, value: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("Invalid variable name.")
  if (/[\r\n"'\$`\s]/.test(value)) throw new Error("The value contains characters that are not allowed.")

  let text = ""
  try {
    text = await readFile(ENV_PATH, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n"
  const lines = text === "" ? [] : text.split(/\r?\n/)
  const line = new RegExp(`^\s*(?:export\s+)?${name}\s*=\s*(["']?)`)
  let replaced = false
  const next = lines.map((l) => {
    const m = line.exec(l)
    if (!m || replaced) return l
    replaced = true
    return `${name}=${m[1]}${value}${m[1]}`
  })
  if (!replaced) {
    if (next.length && next[next.length - 1] === "") next.pop()
    next.push(`${name}=${value}`)
  }
  const out = next.join(eol).replace(new RegExp(`(?:${eol})*$`), "") + eol

  const tmp = `${ENV_PATH}.tmp`
  await writeFile(tmp, out, "utf8")
  await rename(tmp, ENV_PATH)
  process.env[name] = value
}
