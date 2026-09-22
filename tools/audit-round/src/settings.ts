import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import defaults from "../default-settings.json" with { type: "json" }

const assistant = z.enum(["claude", "codex"])
const model = z.string().trim().min(1)
const selection = z.strictObject({
  model: model.nullable(),
  effort: z.enum(["low", "medium", "high", "xhigh"]).nullable(),
})
const documentPhase = selection.extend({ assistant })
const alternatingPhase = z.strictObject({ claude: selection, codex: selection })
const strengths = z.strictObject({ base: model, top: model })

export const settingsSchema = z.strictObject({
  defaultAuditor: assistant,
  strengthModels: z.strictObject({ claude: strengths, codex: strengths }),
  phases: z.strictObject({
    audit: alternatingPhase,
    vet: alternatingPhase,
    fix: selection,
    brief: documentPhase,
    rule: documentPhase,
    "rule-edit": documentPhase,
    watch: documentPhase,
    "watch-edit": documentPhase,
  }),
})

export type RoundSettings = z.infer<typeof settingsSchema>

export const defaultSettings = settingsSchema.parse(defaults)

/** Both checkout entry points use the editable file beside this tool. */
export async function readSettings(
  path: string | URL = new URL("../settings.json", import.meta.url),
): Promise<RoundSettings> {
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    content = JSON.stringify(defaultSettings, null, 2) + "\n"
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
