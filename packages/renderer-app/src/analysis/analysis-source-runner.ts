import type {
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import type { QueryClient } from "@tanstack/react-query"
import { nanoid } from "nanoid"
import type {
  SessionOperationGateway,
  SessionOperationScope,
} from "../session/session-operations.js"
import { scopedSessionQueryOptions } from "../session/session-query.js"
import {
  type AnalysisSourceKeyParts,
  analysisQueryKeys,
  analysisResultScopeKey,
  buildAnalysisQueryIdentity,
} from "./analysis-query-keys.js"
import { useAnalysisTransientStore } from "./analysis-transient-store.js"

type AnalysisSourceInput = {
  source: AnalysisSourceKeyParts
  config: AnalysisConfig
  rosterContext: AnalysisRosterContext | undefined
  kind: "course" | "folder"
  repoParallelism: number
}

/** Owns every snapshot and analysis fetch for one source and input set.
 * Selected-repository queries only observe the cache this body fills. */
export class AnalysisSourceRunner {
  private current: AbortController | null = null

  constructor(
    private readonly operations: SessionOperationGateway,
    private readonly queryClient: QueryClient,
    private readonly input: AnalysisSourceInput,
  ) {}

  async run(
    repoPaths: readonly string[],
    selectedRepoPath: string | null,
  ): Promise<void> {
    if (repoPaths.length === 0) return
    this.current ??= new AbortController()
    const run = this.current
    // Start the selected repository first within the same parallel limit.
    const ordered =
      selectedRepoPath === null
        ? repoPaths
        : [
            selectedRepoPath,
            ...repoPaths.filter((path) => path !== selectedRepoPath),
          ]
    let nextIndex = 0
    const failures: unknown[] = []
    while (!run.signal.aborted && nextIndex < ordered.length) {
      const reservation = this.operations.reserve<void>("analysis.run")
      if (reservation === null) break
      try {
        await reservation.run(async (scope) => {
          const worker = async () => {
            while (!run.signal.aborted && nextIndex < ordered.length) {
              const repoPath = ordered[nextIndex++]
              try {
                await this.fetchRepo(scope, repoPath, run.signal)
              } catch {
                // Query publishes each repository's failure to its observers.
              }
              if (this.operations.hasWaitingBody()) break
            }
          }
          await Promise.all(
            Array.from(
              {
                length: Math.max(
                  1,
                  Math.min(this.input.repoParallelism, ordered.length),
                ),
              },
              worker,
            ),
          )
        })
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) throw failures[0]
  }

  cancel(): void {
    this.current?.abort()
    this.current = null
    void this.queryClient.cancelQueries({
      queryKey: analysisQueryKeys.sourceRepos(this.input.source),
    })
  }

  private async fetchRepo(
    scope: SessionOperationScope,
    repoPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()
    const { source, config, rosterContext, kind } = this.input
    const snapshotCommitOid = await this.queryClient.fetchQuery({
      queryKey: analysisQueryKeys.snapshotHead({
        source,
        repoPath,
        until: config.until ?? null,
      }),
      ...scopedSessionQueryOptions(scope, signal, (signal) =>
        scope.run(
          "analysis.resolveSnapshotHead",
          { repositoryAbsolutePath: repoPath, until: config.until },
          { signal },
        ),
      ),
    })
    signal.throwIfAborted()
    const identity = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid,
      config,
      rosterContext,
    })
    const requestKey = analysisResultScopeKey(identity)
    await this.queryClient.fetchQuery({
      queryKey: analysisQueryKeys.result(identity),
      ...scopedSessionQueryOptions(scope, signal, async (signal) => {
        const requestId = nanoid()
        useAnalysisTransientStore
          .getState()
          .startAnalysis(requestKey, requestId)
        try {
          return await scope.run(
            "analysis.run",
            {
              repositoryAbsolutePath: repoPath,
              config,
              snapshotCommitOid,
              analysisSource:
                kind === "course"
                  ? {
                      kind: "course",
                      ...(rosterContext ? { rosterContext } : {}),
                    }
                  : { kind: "folder" },
            },
            {
              signal,
              onProgress: (progress) => {
                useAnalysisTransientStore
                  .getState()
                  .setAnalysisProgress(requestKey, requestId, progress)
              },
            },
          )
        } finally {
          useAnalysisTransientStore
            .getState()
            .finishAnalysis(requestKey, requestId)
        }
      }),
    })
  }
}
