import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import defaults from "../default-settings.json" with { type: "json" }
import { efforts } from "./phase.js"

const assistant = z.enum(["claude", "codex"])
const model = z
  .string()
  .trim()
  .min(1)
  .regex(/^\S+$/, "Model names contain no spaces")
const effort = z.enum(efforts)
/**
 * A phase field either names its own value or says `default`, which reads the
 * assistant's default selection. Null is not a value: a field left unset would
 * be the CLI's choice, which the runner never consults.
 */
const defaulted = z.literal("default")
const selection = z.strictObject({
  model: z.union([model, defaulted]),
  effort: z.union([effort, defaulted]),
})
/** The selection a phase's `default` reads, so it names a model outright. */
const defaultSelection = z.strictObject({
  model: model.refine((value) => value !== defaulted.value, {
    message: "The defaults must name a model",
  }),
  effort,
})
export type PhaseSelection = z.infer<typeof selection>
const assignedPhase = selection.extend({ assistant })
export const coderSchema = z.strictObject({ assistant, model, effort })
export type Coder = z.infer<typeof coderSchema>
const assistantPhase = z.strictObject({
  claude: selection,
  codex: selection,
})
const strengths = z.strictObject({ base: model, top: model })

export const settingsSchema = z.strictObject({
  /**
   * Who opens a series without a command-line choice. `random` flips a coin
   * for each scope's series.
   */
  defaultAuditor: z.enum(["claude", "codex", "random"]),
  maximumAutomaticRounds: z.number().int().positive(),
  strengthModels: z.strictObject({ claude: strengths, codex: strengths }),
  defaults: z.strictObject({
    claude: defaultSelection,
    codex: defaultSelection,
  }),
  coders: z.array(coderSchema).min(1),
  phases: z.strictObject({
    audit: assistantPhase,
    vet: assistantPhase,
    brief: assignedPhase,
    watch: assignedPhase,
    judge: assignedPhase,
    close: assignedPhase,
  }),
})

export type RoundSettings = z.infer<typeof settingsSchema>

export const defaultSettings = settingsSchema.parse(defaults)

/** The one durable coder line a ready marker carries. */
export function coderRecord(coder: Coder): string {
  return `Coder: ${coder.assistant} ${coder.model} ${coder.effort}`
}

/** Parse a ready marker body, returning null for the older empty marker form. */
export function parseCoderRecord(body: string): Coder | null {
  const lines = body
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
  if (lines.length !== 1) return null
  const match = /^Coder: (claude|codex) (\S+) (low|medium|high|xhigh)$/.exec(
    lines[0],
  )
  if (match === null) return null
  return coderSchema.parse({
    assistant: match[1],
    model: match[2],
    effort: match[3],
  })
}

/** Both checkout entry points use the editable file beside this tool. */
export async function readSettings(
  path: string | URL = new URL("../settings.json", import.meta.url),
): Promise<RoundSettings> {
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    content = `${JSON.stringify(defaultSettings, null, 2)}\n`
    await writeFile(path, content, { flag: "wx" })
  }
  try {
    return settingsSchema.parse(JSON.parse(content))
  } catch (error) {
    throw new Error(
      `Invalid audit-round settings in ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}
