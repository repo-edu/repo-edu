import { join } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import type { MoveList } from "./move-list.js"

/** One file a clean attempt would write, with its path relative to the Repo Edu root. */
export type AttemptFile = {
  readonly path: string
  readonly text: string
  readonly isNew: boolean
}

/**
 * How one in-memory attempt of a move list ended: `clean` with every file the
 * list would write, `changed` when the source no longer holds the content the
 * list names, or `refused` with the reason the first refused move gives.
 */
export type AttemptReply =
  | { readonly outcome: "clean"; readonly files: readonly AttemptFile[] }
  | { readonly outcome: "changed"; readonly message: string }
  | { readonly outcome: "refused"; readonly message: string }

const diagnosticSchema = z.strictObject({
  path: z.string().optional(),
  line: z.int().optional(),
  column: z.int().optional(),
  code: z.int(),
  message: z.string(),
})

/** The reply the statement move tool's `list` command prints, as its documentation states it. */
const replySchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("clean"),
    files: z.array(
      z.strictObject({
        path: z.string().min(1),
        text: z.string(),
        isNew: z.boolean(),
      }),
    ),
  }),
  z.strictObject({ outcome: z.literal("changed"), message: z.string() }),
  z.strictObject({
    outcome: z.literal("refused"),
    entry: z.int().min(1).nullable(),
    message: z.string(),
    diagnostics: z.array(diagnosticSchema),
  }),
])

/**
 * Try a whole move list in memory in a child process, as the statement move
 * tool's `list` command does, and write nothing. The attempt builds a
 * TypeScript 6 project before and after each move, which blocks its process
 * for seconds at a time. In a child process the runner's own event loop stays
 * free, so the split lock's refresh timer keeps running while it waits.
 */
export async function attemptMoveList(
  repoEduRoot: string,
  list: Extract<MoveList, { kind: "moves" }>,
  signal: AbortSignal | undefined,
): Promise<AttemptReply> {
  const request = {
    source: list.source,
    hash: list.hash,
    entries: list.moves.map((move) => ({
      target: move.target,
      ranges: move.ranges,
    })),
  }
  const child = await execa(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repoEduRoot, "tools/statement-move/src/main.ts"),
      "list",
    ],
    {
      cwd: repoEduRoot,
      input: JSON.stringify(request),
      reject: false,
      cancelSignal: signal,
    },
  )
  signal?.throwIfAborted()
  if (child.exitCode !== 0)
    throw new Error(
      `The statement move tool's list command exited ${child.exitCode}: ${child.stderr.trim() || "no message"}`,
    )
  const reply = replySchema.parse(JSON.parse(child.stdout))
  if (reply.outcome !== "refused") return reply
  const diagnostics = reply.diagnostics.map(
    (diagnostic) =>
      `${diagnostic.path === undefined ? "(project)" : `${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`} TS${diagnostic.code} ${diagnostic.message}`,
  )
  return {
    outcome: "refused",
    message: [reply.message, ...diagnostics].join("\n"),
  }
}
