import { readFile, writeFile } from "node:fs/promises"
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser"
import { z } from "zod"
import defaults from "../default-settings.json" with { type: "json" }
import { efforts, selectionTag } from "./phase.js"

const assistant = z.enum(["claude", "codex"])
const model = z
  .string()
  .trim()
  .min(1)
  .regex(/^\S+$/, "Model names contain no spaces")
const effort = z.enum(efforts)
/**
 * A phase or list field either names its own value or says `default`, which
 * reads the assistant's default selection. Null is not a value: a field left
 * unset would be the CLI's choice, which the runner never consults.
 */
const defaulted = z.literal("default")
const selection = z.strictObject({
  model: z.union([model, defaulted]),
  effort: z.union([effort, defaulted]),
})
/** The selection a `default` reads names its model outright, so it defers nowhere else. */
const defaultSelection = z.strictObject({
  model: model.refine((value) => value !== defaulted.value, {
    message: "The defaults must name a model",
  }),
  effort,
})
const assistantDefaults = z.strictObject({
  claude: defaultSelection,
  codex: defaultSelection,
})
export type PhaseSelection = z.infer<typeof selection>
const assignedSelection = selection.extend({ assistant })
type AssignedSelection = z.infer<typeof assignedSelection>
export const coderSchema = z.strictObject({ assistant, model, effort })
export type Coder = z.infer<typeof coderSchema>
/** One auditor the series may run, in the coder's resolved shape. */
export type Auditor = Coder
const strengths = z.strictObject({ base: model, top: model })

/**
 * A class entry's `default` resolves once, when the file loads, so every reader
 * sees the selection the entry runs. A ready marker therefore records that
 * selection, and a later change to `defaults` leaves it as it was.
 */
function resolveEntry(
  entry: AssignedSelection,
  defaults: z.infer<typeof assistantDefaults>,
): Coder {
  const own = defaults[entry.assistant]
  return {
    assistant: entry.assistant,
    model: entry.model === defaulted.value ? own.model : entry.model,
    effort: entry.effort === defaulted.value ? own.effort : entry.effort,
  }
}

export const settingsSchema = z
  .strictObject({
    /**
     * Selects an entry of the target work class's auditor list to open a series
     * without a command-line choice. `random` picks one entry for each scope's
     * series.
     */
    defaultAuditor: z.enum(["first", "random"]),
    maximumAutomaticRounds: z.number().int().positive(),
    strengthModels: z.strictObject({ claude: strengths, codex: strengths }),
    defaults: assistantDefaults,
    planning: z.strictObject({
      /** The ordered pool for planning work. */
      auditors: z.array(assignedSelection).min(1),
      /** The one fixer of planning work. */
      fixer: assignedSelection,
      /** The panel that vets every planning audit report, run in parallel. */
      vetters: z.array(assignedSelection).min(1),
    }),
    implementation: z.strictObject({
      /** The ordered pool for implementation work. */
      auditors: z.array(assignedSelection).min(1),
      /**
       * The implementation coders `ready` assigns in turn. The first also
       * fixes code work that has no ready assignment.
       */
      coders: z.array(assignedSelection).min(1),
      /** The panel that vets every implementation audit report, run in parallel. */
      vetters: z.array(assignedSelection).min(1),
    }),
    phases: z.strictObject({
      watch: assignedSelection,
      close: assignedSelection,
    }),
  })
  .transform((settings) => ({
    ...settings,
    planning: {
      auditors: settings.planning.auditors.map((entry) =>
        resolveEntry(entry, settings.defaults),
      ),
      fixer: resolveEntry(settings.planning.fixer, settings.defaults),
      vetters: settings.planning.vetters.map((entry) =>
        resolveEntry(entry, settings.defaults),
      ),
    },
    implementation: {
      auditors: settings.implementation.auditors.map((entry) =>
        resolveEntry(entry, settings.defaults),
      ),
      coders: settings.implementation.coders.map((entry) =>
        resolveEntry(entry, settings.defaults),
      ),
      vetters: settings.implementation.vetters.map((entry) =>
        resolveEntry(entry, settings.defaults),
      ),
    },
  }))
  /**
   * Each vet report is named by its writer's tag, so two vetters of one list
   * with one tag would write one file and the round would lose a vet's
   * verdicts. The good case this blocks is two models of one assistant on one
   * tier and effort; changing one effort lets both run.
   */
  .superRefine((settings, context) => {
    for (const workClass of ["planning", "implementation"] as const) {
      const tags = settings[workClass].vetters.map(
        ({ assistant, model, effort }) =>
          selectionTag(assistant, model, effort, settings),
      )
      const repeated = tags.find((tag, index) => tags.indexOf(tag) !== index)
      if (repeated !== undefined)
        context.addIssue({
          code: "custom",
          path: [workClass, "vetters"],
          message: `Two ${workClass} vetters share the tag ${repeated}, so one vet report would overwrite the other; give one of them another model tier or effort`,
        })
    }
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
 * generated default copy stays plain JSON and keeps each `default` as written.
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
    content = `${JSON.stringify(defaults, null, 2)}\n`
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
