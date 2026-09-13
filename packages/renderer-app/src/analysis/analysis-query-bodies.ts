import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type { QueryClient } from "@tanstack/react-query"
import { nanoid } from "nanoid"
import type { SessionOperationScope } from "../session/session-operations.js"
import { scopedSessionQueryOptions } from "../session/session-query.js"
import { analysisSourceKeyFromSurface } from "../session/session-reducer.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { refreshSourceSnapshotHeadQueries } from "./analysis-query-client.js"
import {
  analysisQueryKeys,
  analysisSourceKeyParts,
  analysisSourceScopeKey,
} from "./analysis-query-keys.js"
import { useAnalysisTransientStore } from "./analysis-transient-store.js"

/** Discovery keeps its cancellation across input changes and observer removal. */
export class AnalysisDiscoveryRunner {
  private current: AbortController | null = null

  constructor(private readonly queryClient: QueryClient) {}

  /** Capture cancellation before reserving the picker or search body. */
  createRequest() {
    this.current ??= new AbortController()
    const { signal } = this.current
    return {
      signal,
      run: (
        scope: SessionOperationScope,
        surface: PersistedActiveSurface,
        input: { folder: string; depth: number },
      ) => this.run(scope, surface, input, signal),
    }
  }

  private async run(
    scope: SessionOperationScope,
    surface: PersistedActiveSurface,
    input: { folder: string; depth: number },
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()
    const source = analysisSourceKeyParts(analysisSourceKeyFromSurface(surface))
    const queryKey = analysisQueryKeys.discovery(
      source,
      input.folder,
      input.depth,
    )
    scope.publish(() => {
      refreshSourceSnapshotHeadQueries(this.queryClient, source)
      void this.queryClient.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: "none",
      })
      useAnalysisStore
        .getState()
        .setPendingRepoDiscoveryRequest(analysisSourceScopeKey(source), input)
    })
    const result = await this.queryClient.fetchQuery({
      queryKey,
      ...scopedSessionQueryOptions(
        scope,
        async (signal) => {
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
        },
        signal,
      ),
    })
    signal.throwIfAborted()
    const openedSurface = await scope.reconcileDiscovery(
      surface,
      input.folder,
      result,
    )
    if (openedSurface === null) return
    scope.publish(() => {
      const openedSource = analysisSourceKeyParts(
        analysisSourceKeyFromSurface(openedSurface),
      )
      this.queryClient.setQueryData(
        analysisQueryKeys.discovery(openedSource, input.folder, input.depth),
        result,
      )
      useAnalysisStore
        .getState()
        .setPendingRepoDiscoveryRequest(
          analysisSourceScopeKey(openedSource),
          input,
        )
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
