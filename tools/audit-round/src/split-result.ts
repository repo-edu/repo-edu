import { z } from "zod"

/** The six results a split call ends with, in the order of the round grammar. */
export const splitResults = [
  "made",
  "designed",
  "fine",
  "needs-plan",
  "skipped",
  "checks-failed",
] as const

export type SplitResultWord = (typeof splitResults)[number]

/**
 * How one split call ended: its result, the blob hash of the source content
 * the design session read and a message that says why.
 */
export type SplitResult = {
  readonly result: SplitResultWord
  readonly hash: string
  readonly message: string
}

/** Git's blob hash of one file, as `git hash-object` prints it. */
export const blobHashPattern = /^[0-9a-f]{40}$/

const prefix = "SPLIT RESULT: "
const hashRefusal =
  "Split result hash must be forty lowercase hexadecimal characters"
const messageRefusal = "Split result needs a message"

const splitResultSchema = z.strictObject(
  {
    result: z.enum(splitResults, {
      error: `Split result must be ${splitResults.slice(0, -1).join(", ")} or ${splitResults.at(-1)}`,
    }),
    hash: z.string({ error: hashRefusal }).regex(blobHashPattern, {
      error: hashRefusal,
    }),
    message: z
      .string({ error: messageRefusal })
      .regex(/\S/, { error: messageRefusal }),
  },
  { error: "Split result holds exactly the fields result, hash and message" },
)

/** The one line a split call ends with. */
export function splitResultLine(result: SplitResult): string {
  const { result: word, hash, message } = result
  return `${prefix}${JSON.stringify({ result: word, hash, message })}`
}

/** Read a split result line under the round grammar's Split result form. */
export function readSplitResult(line: string): SplitResult {
  const text = line.trim()
  if (!text.startsWith(prefix))
    throw new Error(`Split result line must open with ${prefix.trimEnd()}`)
  let value: unknown
  try {
    value = JSON.parse(text.slice(prefix.length))
  } catch {
    throw new Error("Split result is not one JSON object")
  }
  const parsed = splitResultSchema.safeParse(value)
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Split result is malformed",
    )
  return parsed.data
}
