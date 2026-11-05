import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import type { PersistedAnalysisConcurrency } from "@repo-edu/domain/settings"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useAnalysisContext } from "../hooks/use-analysis-context.js"
import {
  selectAnalysisConcurrency,
  selectDefaultExtensions,
} from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"
import { analysisSourceKeyFromSurface } from "../session/session-reducer.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import {
  type AnalysisSourceKeyParts,
  analysisSourceKeyParts,
  buildAnalysisOutputConfigKey,
  buildRosterOutputContextKey,
} from "./analysis-query-keys.js"
import { AnalysisSourceRunner } from "./analysis-source-runner.js"
import { buildEffectiveBlameWorkflowConfig } from "./analysis-workflow-inputs.js"

export type AnalysisSourceInput = {
  readonly activeSurface: PersistedActiveSurface
  readonly source: AnalysisSourceKeyParts
  readonly config: AnalysisConfig | null
  readonly rosterContext: AnalysisRosterContext | undefined
  readonly kind: "course" | "folder"
  readonly concurrency: PersistedAnalysisConcurrency
}

export function useAnalysisSourceInput() {
  const client = useWorkflowClient()
  const queryClient = useQueryClient()
  const analysisContext = useAnalysisContext()
  const defaultExtensions = useSessionControllerSelector(
    selectDefaultExtensions,
  )
  const concurrency = useSessionControllerSelector(selectAnalysisConcurrency)
  const blameConfig = useAnalysisStore((state) => state.blameConfig)

  const config =
    analysisContext.kind === "none"
      ? null
      : resolveAnalysisConfig(
          {
            searchFolder: analysisContext.searchFolder,
            analysisInputs: analysisContext.analysisInputs,
          },
          defaultExtensions,
          concurrency.filesPerRepo,
        )
  const source = analysisSourceKeyParts(
    analysisSourceKeyFromSurface(analysisContext.activeSurface),
  )
  const kind = analysisContext.kind === "course" ? "course" : "folder"
  const contentKey = JSON.stringify({
    source,
    config: config === null ? null : buildAnalysisOutputConfigKey(config),
    roster: buildRosterOutputContextKey(analysisContext.rosterContext),
    kind,
    concurrency,
  })

  // The result key fields define input equality; the host still takes full inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The content key replaces the identities of the course-derived objects.
  const input = useMemo<AnalysisSourceInput>(
    () => ({
      activeSurface: analysisContext.activeSurface,
      source,
      config,
      rosterContext: analysisContext.rosterContext,
      kind,
      concurrency,
    }),
    [contentKey],
  )

  const createSourceRunner = useCallback(
    (surface: PersistedActiveSurface) =>
      input.config === null
        ? null
        : new AnalysisSourceRunner(client, queryClient, {
            source: analysisSourceKeyParts(
              analysisSourceKeyFromSurface(surface),
            ),
            config: input.config,
            rosterContext: input.rosterContext,
            kind: input.kind,
            repoParallelism: input.concurrency.repoParallelism,
          }),
    [client, input, queryClient],
  )

  const blameSkip = analysisContext.analysisInputs.blameSkip
  const effectiveBlameConfig = useMemo<AnalysisBlameConfig | null>(() => {
    if (input.config === null || blameSkip) return null
    return buildEffectiveBlameWorkflowConfig(
      input.config,
      blameConfig,
      input.concurrency.repoParallelism * input.concurrency.filesPerRepo,
    )
  }, [blameConfig, blameSkip, input])

  return { input, createSourceRunner, effectiveBlameConfig }
}
