import type { WorkflowInput } from "@repo-edu/application-contract"
import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type { BlameResult } from "@repo-edu/domain/analysis"
import type { QueryClient } from "@tanstack/react-query"
import { nanoid } from "nanoid"
import type { SessionOperationGateway } from "../session/session-operations.js"
import { scopedSessionQueryOptions } from "../session/session-query.js"
import {
  type AnalysisSourceKeyParts,
  analysisQueryKeys,
  type BlameQueryIdentity,
  blameResultScopeKey,
} from "./analysis-query-keys.js"
import { useAnalysisTransientStore } from "./analysis-transient-store.js"

/** Discovery keeps its cancellation across input changes and observer removal. */
export class AnalysisDiscoveryRunner {
  private current: AbortController | null = null

  constructor(
    private readonly operations: SessionOperationGateway,
    private readonly queryClient: QueryClient,
  ) {}

  async run(
    source: AnalysisSourceKeyParts,
    surface: PersistedActiveSurface,
    input: { folder: string; depth: number },
  ): Promise<void> {
    this.current ??= new AbortController()
    const { signal } = this.current
    await this.operations.execute("analysis.discoverRepos", async (scope) => {
      signal.throwIfAborted()
      const result = await this.queryClient.fetchQuery({
        queryKey: analysisQueryKeys.discovery(
          source,
          input.folder,
          input.depth,
        ),
        ...scopedSessionQueryOptions(scope, signal, async (signal) => {
          const requestId = nanoid()
          useAnalysisTransientStore.getState().startDiscovery(requestId)
          try {
            return await scope.run(
              "analysis.discoverRepos",
              { searchFolder: input.folder, maxDepth: input.depth },
              {
                signal,
                onProgress: (progress) => {
                  useAnalysisTransientStore
                    .getState()
                    .setDiscoveryProgress(requestId, progress)
                },
              },
            )
          } finally {
            useAnalysisTransientStore.getState().finishDiscovery(requestId)
          }
        }),
      })
      signal.throwIfAborted()
      await scope.reconcileDiscovery(surface, input.folder, result)
    })
  }

  cancel(): void {
    this.current?.abort()
    this.current = null
    void this.queryClient.cancelQueries({
      predicate: (query) =>
        query.queryKey[0] === "analysis" && query.queryKey[3] === "discovery",
    })
  }
}

export function fetchAnalysisBlame(
  operations: SessionOperationGateway,
  queryClient: QueryClient,
  identity: BlameQueryIdentity,
  input: WorkflowInput<"analysis.blame">,
): Promise<BlameResult | undefined> {
  return operations.execute("analysis.blame", async (scope) => {
    const { signal } = new AbortController()
    return await queryClient.fetchQuery({
      queryKey: analysisQueryKeys.blame(identity),
      ...scopedSessionQueryOptions(scope, signal, async (signal) => {
        const requestKey = blameResultScopeKey(identity)
        const requestId = nanoid()
        useAnalysisTransientStore.getState().startBlame(requestKey, requestId)
        try {
          return await scope.run("analysis.blame", input, {
            signal,
            onProgress: (progress) => {
              const transient = useAnalysisTransientStore.getState()
              transient.setBlameProgress(requestKey, requestId, progress)
              if (progress.partialAuthorLines) {
                transient.setBlamePartialAuthorLines(
                  requestKey,
                  requestId,
                  new Map(
                    progress.partialAuthorLines.map((entry) => [
                      entry.personId,
                      entry.lines,
                    ]),
                  ),
                )
              }
            },
          })
        } finally {
          useAnalysisTransientStore
            .getState()
            .finishBlame(requestKey, requestId)
        }
      }),
    })
  })
}
