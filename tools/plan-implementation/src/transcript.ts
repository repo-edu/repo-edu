import { randomUUID } from "node:crypto"
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import type { PlanImplementationEvent } from "./contracts.js"
import { readGitText } from "./git-command.js"

const transcriptGitPath = "repo-edu/plan-implementation/transcripts"

export type PlanImplementationTranscript = {
  readonly invocationId: string
  readonly path: string
  write(event: PlanImplementationEvent): void
  close(): void
}

export type PlanImplementationTranscriptFactory = (
  repoEduRoot: string,
) => Promise<PlanImplementationTranscript>

export class PlanImplementationTranscriptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PlanImplementationTranscriptError"
  }
}

function utcBasicTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "")
}

async function resolveTranscriptDirectory(
  repoEduRoot: string,
): Promise<string> {
  const path = await readGitText(repoEduRoot, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    transcriptGitPath,
  ])
  if (!isAbsolute(path)) {
    throw new PlanImplementationTranscriptError(
      "Git did not return an absolute transcript directory.",
    )
  }
  return path
}

export async function createPlanImplementationTranscript(
  repoEduRoot: string,
  options: {
    readonly now?: () => Date
    readonly createInvocationId?: () => string
  } = {},
): Promise<PlanImplementationTranscript> {
  const now = options.now ?? (() => new Date())
  const createInvocationId = options.createInvocationId ?? randomUUID
  const invocationId = createInvocationId()
  const directory = await resolveTranscriptDirectory(repoEduRoot)
  const path = join(
    directory,
    `${utcBasicTimestamp(now())}-${invocationId}.jsonl`,
  )
  let descriptor: number
  try {
    mkdirSync(dirname(path), { recursive: true })
    descriptor = openSync(path, "wx", 0o600)
  } catch (error) {
    throw new PlanImplementationTranscriptError(
      "The runner could not create its transcript.",
      { cause: error },
    )
  }

  let closed = false
  return {
    invocationId,
    path,
    write(event) {
      if (closed) {
        throw new PlanImplementationTranscriptError(
          "The runner cannot write a closed transcript.",
        )
      }
      try {
        writeSync(descriptor, `${JSON.stringify(event)}\n`)
      } catch (error) {
        throw new PlanImplementationTranscriptError(
          "The runner could not write its transcript.",
          { cause: error },
        )
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        closeSync(descriptor)
      } catch (error) {
        throw new PlanImplementationTranscriptError(
          "The runner could not close its transcript.",
          { cause: error },
        )
      }
    },
  }
}
