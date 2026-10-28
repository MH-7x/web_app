import { AsyncLocalStorage } from "node:async_hooks"

import { db } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { TEMPLATE_DEFS, formatExamples, getDef, renderTemplate, type TemplateDef, type TemplateName } from "@/lib/prompts/templates"

type Draft = { systemPrompt: string; examples: unknown }

/** Lets "Test with sample client" run the real generator with an unsaved draft, without touching the database. */
const g = globalThis as unknown as { __promptOverrides?: AsyncLocalStorage<Partial<Record<TemplateName, Draft>>> }
const overrides = (g.__promptOverrides ??= new AsyncLocalStorage())

export const withTemplateDraft = <T>(name: TemplateName, draft: Draft, run: () => Promise<T>) => overrides.run({ [name]: draft }, run)

export type LoadedTemplate = {
  name: TemplateName
  systemPrompt: string
  examples: unknown
  /** Fill in the variables. `examples` is added automatically, for the language given. */
  render: (vars: Record<string, string | number | undefined | null>, lang?: "en" | "ar") => string
}

type Row = NonNullable<Awaited<ReturnType<typeof db.promptTemplate.findUnique>>>

/** Bring a saved prompt up to the current built-in default when the default was revised and the saved copy was never edited. */
async function followDefault(def: TemplateDef, row: Row): Promise<Row> {
  const key = `prompt-rev:${def.name}`
  const seen = Number((await db.setting.findUnique({ where: { key } }))?.value ?? 0)
  if (seen >= def.rev!) return row
  // saveTemplate raises the version on every edit, so version 1 means nobody has edited it
  const updated = row.version === 1 && row.systemPrompt !== def.systemPrompt ? await db.promptTemplate.update({ where: { name: def.name }, data: { systemPrompt: def.systemPrompt, fewShotExamples: def.examples as Prisma.InputJsonValue } }) : row
  await db.setting.upsert({ where: { key }, create: { key, value: String(def.rev) }, update: { value: String(def.rev) } })
  return updated
}

async function rowFor(def: TemplateDef) {
  const existing = await db.promptTemplate.findUnique({ where: { name: def.name } })
  if (existing) return def.rev ? followDefault(def, existing) : existing
  try {
    return await db.promptTemplate.create({ data: { name: def.name, systemPrompt: def.systemPrompt, fewShotExamples: def.examples as Prisma.InputJsonValue } })
  } catch {
    // another request created it first
    const row = await db.promptTemplate.findUnique({ where: { name: def.name } })
    if (row) return row
    throw new Error(`Could not load the prompt template "${def.name}".`)
  }
}

/** The template a generator should use right now: the saved one (created from the default on first use). */
export async function loadTemplate(name: TemplateName): Promise<LoadedTemplate> {
  const def = getDef(name)!
  const draft = overrides.getStore()?.[name]
  const row = draft ? null : await rowFor(def)
  // an emptied prompt would send the model nothing; fall back to the default rather than fail
  const systemPrompt = (draft?.systemPrompt ?? row?.systemPrompt ?? "").trim() ? (draft?.systemPrompt ?? row!.systemPrompt) : def.systemPrompt
  const examples = draft ? draft.examples : (row?.fewShotExamples ?? def.examples)
  return {
    name,
    systemPrompt,
    examples,
    render: (vars, lang = "en") => renderTemplate(systemPrompt, { ...vars, examples: formatExamples(examples, lang) }),
  }
}

export type TemplateRecord = {
  name: TemplateName
  label: string
  description: string
  variables: TemplateDef["variables"]
  systemPrompt: string
  examples: unknown
  defaultSystemPrompt: string
  defaultExamples: unknown
  version: number
  updatedAt: string
  /** differs from the built-in default */
  edited: boolean
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function toRecord(def: TemplateDef, row: { systemPrompt: string; fewShotExamples: unknown; version: number; updatedAt: Date }): TemplateRecord {
  const examples = row.fewShotExamples ?? []
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    variables: def.variables,
    systemPrompt: row.systemPrompt,
    examples,
    defaultSystemPrompt: def.systemPrompt,
    defaultExamples: def.examples,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    edited: row.systemPrompt !== def.systemPrompt || !same(examples, def.examples),
  }
}

/** Every template, creating any that are missing from the table. This is the seed. */
export async function listTemplates(): Promise<TemplateRecord[]> {
  return Promise.all(TEMPLATE_DEFS.map(async (def) => toRecord(def, await rowFor(def))))
}

export async function saveTemplate(name: TemplateName, systemPrompt: string, examples: unknown) {
  const def = getDef(name)!
  await rowFor(def)
  const row = await db.promptTemplate.update({
    where: { name },
    data: { systemPrompt, fewShotExamples: examples as Prisma.InputJsonValue, version: { increment: 1 } },
  })
  return toRecord(def, row)
}

export async function resetTemplate(name: TemplateName) {
  return saveTemplate(name, getDef(name)!.systemPrompt, getDef(name)!.examples)
}
