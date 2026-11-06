import { readFile, writeFile } from "node:fs/promises"
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser"
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
/** A model the selection names outright, because `default` would defer the choice elsewhere. */
const namedModel = (owner: string) =>
  model.refine((value) => value !== defaulted.value, {
    message: `${owner} must name a model`,
  })
/** The selection a phase's `default` reads, so it names a model outright. */
const defaultSelection = z.strictObject({
  model: namedModel("The defaults"),
  effort,
})
export type PhaseSelection = z.infer<typeof selection>
const assignedPhase = selection.extend({ assistant })
export const coderSchema = z.strictObject({ assistant, model, effort })
export type Coder = z.infer<typeof coderSchema>
/**
 * One auditor the series may run. The list is the choice, so an entry names
 * its model outright rather than reading the defaults.
 */
const auditorSchema = z.strictObject({
  assistant,
  model: namedModel("An auditor"),
  effort,
})
export type Auditor = z.infer<typeof auditorSchema>
const assistantPhase = z.strictObject({
  claude: selection,
  codex: selection,
})
const strengths = z.strictObject({ base: model, top: model })

export const settingsSchema = z.strictObject({
  /**
   * Which `auditors` entry opens a series without a command-line choice.
   * `random` picks one entry for each scope's series.
   */
  defaultAuditor: z.enum(["first", "random"]),
  maximumAutomaticRounds: z.number().int().positive(),
  strengthModels: z.strictObject({ claude: strengths, codex: strengths }),
  defaults: z.strictObject({
    claude: defaultSelection,
    codex: defaultSelection,
  }),
  /** The ordered pool the automatic series opens from and the judge draws on. */
  auditors: z.array(auditorSchema).min(1),
  coders: z.array(coderSchema).min(1),
  phases: z.strictObject({
    vet: assistantPhase,
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

/**
 * The file is JSON with comments and trailing commas, so an operator can keep
 * an alternative selection beside the live one without a second file. The
 * generated default copy stays plain JSON.
 */
function parseSettingsText(content: string): unknown {
  const errors: ParseError[] = []
  const value = parse(content, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const first = errors[0]
    throw new Error(
      `${printParseErrorCode(first.error)} at offset ${first.offset}`,
    )
  }
  return value
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
    return settingsSchema.parse(parseSettingsText(content))
  } catch (error) {
    throw new Error(
      `Invalid audit-round settings in ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}
