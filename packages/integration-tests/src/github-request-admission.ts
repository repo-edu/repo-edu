import type { GitProviderKind } from "@repo-edu/domain/connection"
import { createNodeHttpPort } from "@repo-edu/host-node"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])
const minimumMutationIntervalMs = 1_000

type StatusResponse = {
  status: number
}

type RequestAdmissionOptions = {
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
}

export class GitHubIntegrationRateLimitError extends Error {
  constructor(status: number) {
    super(
      `GitHub refused a live-test mutation with ${status}; the suite stops to prevent further content creation.`,
    )
    this.name = "GitHubIntegrationRateLimitError"
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
  let terminalError: GitHubIntegrationRateLimitError | null = null
  let lastMutationAt: number | null = null
  let mutationTail = Promise.resolve()

  return {
    async send<T extends StatusResponse>(
      method: string | undefined,
      request: () => Promise<T>,
    ): Promise<T> {
      if (terminalError !== null) {
        throw terminalError
      }

      if (!mutationMethods.has(method ?? "GET")) {
        return await request()
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

        if (lastMutationAt !== null) {
          const remaining = minimumMutationIntervalMs - (now() - lastMutationAt)
          if (remaining > 0) {
            await wait(remaining)
          }
        }

        if (terminalError !== null) {
          throw terminalError
        }

        lastMutationAt = now()
        const response = await request()
        if (response.status === 403 || response.status === 429) {
          terminalError = new GitHubIntegrationRateLimitError(response.status)
          throw terminalError
        }
        return response
      } finally {
        release?.()
      }
    },
  }
}

const githubLiveRunAdmission = createGitHubIntegrationRequestAdmission()

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
