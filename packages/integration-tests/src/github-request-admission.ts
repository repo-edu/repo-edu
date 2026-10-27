import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { GitProviderKind } from "@repo-edu/domain/connection"
import { createNodeHttpPort } from "@repo-edu/host-node"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])
const minimumMutationIntervalMs = 1_000
const contentWindowMs = 3_600_000

type StatusResponse = {
  status: number
}

export type GitHubRunRecord = {
  readStartedAt(): number | null
  writeStartedAt(startedAt: number): void
}

type RequestAdmissionOptions = {
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
  runRecord?: GitHubRunRecord
}

export class GitHubIntegrationRateLimitError extends Error {
  constructor(status: number) {
    super(
      `GitHub refused a live-test request with ${status}; the suite stops to prevent further content creation.`,
    )
    this.name = "GitHubIntegrationRateLimitError"
  }
}

export class GitHubIntegrationRunWindowError extends Error {
  constructor(previousStartedAt: number, now: number) {
    const minutesLeft = Math.ceil(
      (previousStartedAt + contentWindowMs - now) / 60_000,
    )
    super(
      `GitHub live tests created content ${minutesLeft} minutes ago or less; one content-creating run is allowed per hour.`,
    )
    this.name = "GitHubIntegrationRunWindowError"
  }
}

function createFileRunRecord(): GitHubRunRecord {
  const recordPath = join(
    homedir(),
    ".repo-edu",
    "github-live-run",
    "started-at",
  )
  return {
    readStartedAt() {
      let text: string
      try {
        text = readFileSync(recordPath, "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null
        }
        throw error
      }
      const startedAt = Number(text.trim())
      if (!Number.isSafeInteger(startedAt)) {
        throw new Error(
          `The GitHub live-run record at ${recordPath} is not a timestamp.`,
        )
      }
      return startedAt
    },
    writeStartedAt(startedAt) {
      mkdirSync(dirname(recordPath), { recursive: true, mode: 0o700 })
      writeFileSync(recordPath, `${startedAt}\n`, { mode: 0o600 })
    },
  }
}

export function createGitHubIntegrationRequestAdmission(
  options: RequestAdmissionOptions = {},
) {
  const now = options.now ?? Date.now
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const runRecord = options.runRecord ?? createFileRunRecord()
  let terminalError: Error | null = null
  let lastMutationAt: number | null = null
  let mutationCount = 0
  let mutationTail = Promise.resolve()

  function acceptResponse<T extends StatusResponse>(response: T): T {
    if (response.status === 403 || response.status === 429) {
      terminalError = new GitHubIntegrationRateLimitError(response.status)
      throw terminalError
    }
    return response
  }

  function admitRunStart(startedAt: number): void {
    const previousStartedAt = runRecord.readStartedAt()
    if (
      previousStartedAt !== null &&
      startedAt - previousStartedAt < contentWindowMs
    ) {
      terminalError = new GitHubIntegrationRunWindowError(
        previousStartedAt,
        startedAt,
      )
      throw terminalError
    }
    runRecord.writeStartedAt(startedAt)
  }

  return {
    /** The mutating requests this owner has sent, the run's write count. */
    mutationsSent(): number {
      return mutationCount
    },
    async send<T extends StatusResponse>(
      method: string | undefined,
      request: () => Promise<T>,
    ): Promise<T> {
      if (terminalError !== null) {
        throw terminalError
      }

      if (!mutationMethods.has(method ?? "GET")) {
        return acceptResponse(await request())
      }

      let release: (() => void) | undefined
      const previousMutation = mutationTail
      mutationTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previousMutation

      try {
        if (terminalError !== null) {
          throw terminalError
        }

        if (lastMutationAt === null) {
          admitRunStart(now())
        } else {
          const remaining = minimumMutationIntervalMs - (now() - lastMutationAt)
          if (remaining > 0) {
            await wait(remaining)
          }
        }

        if (terminalError !== null) {
          throw terminalError
        }

        lastMutationAt = now()
        mutationCount += 1
        return acceptResponse(await request())
      } finally {
        release?.()
      }
    },
  }
}

const githubLiveRunAdmission = createGitHubIntegrationRequestAdmission()

export function githubLiveRunMutationsSent(): number {
  return githubLiveRunAdmission.mutationsSent()
}

export function createIntegrationHttpPort(provider: GitProviderKind): HttpPort {
  const port = createNodeHttpPort()
  if (provider !== "github") {
    return port
  }

  return {
    fetch(request: HttpRequest): Promise<HttpResponse> {
      return githubLiveRunAdmission.send(request.method, () =>
        port.fetch(request),
      )
    },
  }
}

export async function fetchGitHubIntegration(
  url: string,
  options: RequestInit,
): Promise<Response> {
  return await githubLiveRunAdmission.send(options.method, () =>
    globalThis.fetch(url, options),
  )
}
