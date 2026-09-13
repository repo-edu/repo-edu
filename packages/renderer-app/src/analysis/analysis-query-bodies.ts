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

/** Searches one folder for repositories and carries the result to the surface
 * the search opened. The reservation that admits the body owns its stop, so a
 * search queued behind a folder pick is cancellable before it begins. */
export async function discoverRepositories(
  scope: SessionOperationScope,
  queryClient: QueryClient,
  surface: PersistedActiveSurface,
  input: { folder: string; depth: number },
): Promise<void> {
  const source = analysisSourceKeyParts(analysisSourceKeyFromSurface(surface))
  const queryKey = analysisQueryKeys.discovery(
    source,
    input.folder,
    input.depth,
  )
  scope.publish(() => {
    refreshSourceSnapshotHeadQueries(queryClient, source)
    void queryClient.invalidateQueries({
      queryKey,
      exact: true,
      refetchType: "none",
    })
    useAnalysisStore
      .getState()
      .setPendingRepoDiscoveryRequest(analysisSourceScopeKey(source), input)
  })
  const result = await queryClient.fetchQuery({
    queryKey,
    ...scopedSessionQueryOptions(scope, async () => {
      const requestId = nanoid()
      useAnalysisTransientStore.getState().startDiscovery(requestId)
      try {
        return await scope.run(
          "analysis.discoverRepos",
          { searchFolder: input.folder, maxDepth: input.depth },
          {
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
    queryClient.setQueryData(
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
