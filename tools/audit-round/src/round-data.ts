import { writeFileSync } from "node:fs"
import { z } from "zod"

const assistant = z.enum(["claude", "codex"])
const modelSelection = z.strictObject({
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
})
const auditSelection = z.union([
  modelSelection,
  z.tuple([modelSelection, modelSelection]),
])
const tokenUsage = z.strictObject({
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
})

/** The retained machine-readable account of one automated round. */
export const roundDataSchema = z.strictObject({
  target: z.string().min(1),
  round: z.number().int().positive(),
  started: z.string().min(1),
  settings: z.strictObject({
    audit: z.strictObject({
      claude: auditSelection,
      codex: auditSelection,
    }),
    vet: z.strictObject({
      claude: modelSelection,
      codex: modelSelection,
    }),
    fix: modelSelection.extend({ assistant }),
  }),
  auditor: modelSelection.extend({
    assistant,
    chosenBy: z.enum(["settings", "command-line"]),
  }),
  phases: z.array(
    z.strictObject({
      phase: z.enum(["audit", "vet", "rebut", "fix", "brief", "watch"]),
      assistant,
      model: z.string().min(1),
      effort: z.string().min(1).nullable(),
      milliseconds: z.number().int().nonnegative(),
      tokens: z.array(tokenUsage),
    }),
  ),
  commits: z.array(
    z.strictObject({
      repository: z.enum(["repo-edu", "plan"]),
      sha: z.string().regex(/^[0-9a-f]{40}$/i),
    }),
  ),
})

export type RoundData = z.infer<typeof roundDataSchema>
export type ModelTokenUsage = z.infer<typeof tokenUsage>
export type LandedCommit = RoundData["commits"][number]

/** Split the allocated name into the target-wide identity stored in JSON. */
export function roundDataIdentity(nameStart: string): {
  readonly target: string
  readonly round: number
} {
  const match = /^(.+)-(\d{2,})$/.exec(nameStart)
  if (match === null) throw new Error(`Invalid round identity: ${nameStart}`)
  return { target: match[1], round: Number(match[2]) }
}

/** Validate the writer with the same schema the trial reader uses. */
export function writeRoundData(path: string, value: RoundData): void {
  const data = roundDataSchema.parse(value)
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" })
}
