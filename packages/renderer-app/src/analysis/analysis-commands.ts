import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { analysisSourceKeyFromSurface } from "../session/session-reducer.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import {
  selectEffectiveSelectedRepoPath,
  selectSelectedRepoPathForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import type { AnalysisObservation } from "./analysis-observation.js"
import { discoverRepositories } from "./analysis-query-bodies.js"
import {
  analysisSourceKeyParts,
  analysisSourceScopeKey,
} from "./analysis-query-keys.js"
import type { AnalysisSourceState } from "./analysis-source-input.js"

type Discovery = Awaited<ReturnType<typeof discoverRepositories>>

export function useAnalysisCommands({
  input,
  createSourceRunner,
  effectiveBlameConfig,
  observation,
}: AnalysisSourceState & {
  observation: Pick<
    AnalysisObservation,
    "activeSourceText" | "discoveredRepoPaths" | "selectedRepoPath"
  >
}) {
  const client = useWorkflowClient()
  const queryClient = useQueryClient()
  const searchDepth = useAnalysisStore((state) => state.searchDepth)
  const setSelectedRepoPath = useAnalysisStore(
    (state) => state.setSelectedRepoPath,
  )
  const setPendingRepoDiscoveryRequest = useAnalysisStore(
    (state) => state.setPendingRepoDiscoveryRequest,
  )

  const runRepositories = useCallback(
    (
      start: SessionStart,
      repoPaths: readonly string[],
      selectedRepoPath: string,
    ) => {
      client.change(() => {
        void createSourceRunner(input.activeSurface)
          ?.run(start, repoPaths, selectedRepoPath, effectiveBlameConfig)
          .catch(() => {})
      })
    },
    [client, createSourceRunner, effectiveBlameConfig, input],
  )

  const runDiscovery = useCallback(
    (
      start: SessionStart,
      folder: string,
      onDiscovered?: (discovery: Discovery) => void,
    ) => {
      if (!folder) return
      client.change(() => {
        void client
          .execute(start, "analysis.discoverRepos", async (scope) => {
            const discovery = await discoverRepositories(
              scope,
              queryClient,
              input.activeSurface,
              { folder, depth: searchDepth },
            )
            if (onDiscovered === undefined) return
            scope.signal.throwIfAborted()
            scope.publish(() => onDiscovered(discovery))
          })
          .catch(() => {})
      })
    },
    [client, input, queryClient, searchDepth],
  )

  // One control stops whatever the analysis source is running. Enablement and
  // click both read the reservation, so they cannot disagree.
  const cancelAnalysis = useCallback(() => {
    client.stop("analysis.run")
  }, [client])

  const runAnalysis = useMemo(
    () =>
      bindSessionStart("analysisRun", (start: SessionStart) => {
        if (observation.selectedRepoPath === null) return
        runRepositories(
          start,
          observation.discoveredRepoPaths,
          observation.selectedRepoPath,
        )
      }),
    [
      observation.discoveredRepoPaths,
      observation.selectedRepoPath,
      runRepositories,
    ],
  )

  // Search only updates discovery; Start owns the chained analysis pass.
  const runRepoDiscovery = useMemo(
    () =>
      bindSessionStart(
        "analysisSearch",
        (start: SessionStart, folder: string) => {
          runDiscovery(start, folder)
        },
      ),
    [runDiscovery],
  )

  const startAnalysis = useMemo(
    () =>
      bindSessionStart(
        "analysisStart",
        (start: SessionStart, folder: string) => {
          runDiscovery(start, folder, (discovery) => {
            const source = analysisSourceKeyParts(
              analysisSourceKeyFromSurface(discovery.surface),
            )
            const selected = selectEffectiveSelectedRepoPath({
              storedRepoPath: selectSelectedRepoPathForScope(
                useAnalysisStore.getState(),
                analysisSourceScopeKey(source),
              ),
              discoveredRepos: discovery.result.repos,
            })
            // Reserve before search retirement without awaiting the next queue turn.
            // Search and analysis retain independent cancellation targets.
            void createSourceRunner(discovery.surface)
              ?.run(
                start,
                discovery.result.repos.map((repo) => repo.path),
                selected,
                effectiveBlameConfig,
              )
              .catch(() => {})
          })
        },
      ),
    [createSourceRunner, effectiveBlameConfig, runDiscovery],
  )

  const cancelDiscovery = useCallback(() => {
    client.stop("analysis.discoverRepos")
  }, [client])

  const selectRepository = useCallback(
    (repoPath: string) => {
      client.change(() => {
        setSelectedRepoPath(observation.activeSourceText, repoPath)
      })
    },
    [client, observation.activeSourceText, setSelectedRepoPath],
  )

  const analyseSelectedRepository = useMemo(
    () =>
      bindSessionStart("analysisSelected", (start: SessionStart) => {
        if (observation.selectedRepoPath === null) return
        runRepositories(
          start,
          [observation.selectedRepoPath],
          observation.selectedRepoPath,
        )
      }),
    [observation.selectedRepoPath, runRepositories],
  )

  const clearRepositoryDiscovery = useCallback(() => {
    setSelectedRepoPath(observation.activeSourceText, null)
    setPendingRepoDiscoveryRequest(observation.activeSourceText, null)
  }, [
    observation.activeSourceText,
    setPendingRepoDiscoveryRequest,
    setSelectedRepoPath,
  ])

  return {
    runRepoDiscovery,
    startAnalysis,
    clearRepositoryDiscovery,
    cancelDiscovery,
    selectRepository,
    analyseSelectedRepository,
    runAnalysis,
    cancelAnalysis,
  }
}
