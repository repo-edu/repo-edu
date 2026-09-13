import type { WorkflowInput } from "@repo-edu/application-contract"
import type {
  AnalysisConfig,
  AnalysisRosterContext,
  BlameResult,
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
  type BlameQueryIdentity,
  blameResultScopeKey,
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

/** Owns every snapshot, analysis and blame fetch for one source and input set.
 * Selected-repository queries only observe the cache this body fills. */
export class AnalysisSourceRunner {
  constructor(
    private readonly operations: SessionOperationGateway,
    private readonly queryClient: QueryClient,
    private readonly input: AnalysisSourceInput,
  ) {}

  /** One background body analyses the whole source. A reservation entering
   * behind it stops it; a later start skips the repositories already cached. */
  async run(
    repoPaths: readonly string[],
    selectedRepoPath: string | null,
  ): Promise<void> {
    if (repoPaths.length === 0) return
    // Start the selected repository first within the same parallel limit.
    const ordered =
      selectedRepoPath === null
        ? repoPaths
        : [
            selectedRepoPath,
            ...repoPaths.filter((path) => path !== selectedRepoPath),
          ]
    await this.operations.execute(
      "analysis.run",
      async (scope) => {
        let nextIndex = 0
        const worker = async () => {
          while (!scope.signal.aborted && nextIndex < ordered.length) {
            try {
              await this.fetchRepo(scope, ordered[nextIndex++])
            } catch {
              // Query publishes each repository's failure to its observers.
            }
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
      },
      "background",
    )
  }

  async fetchBlame(
    identity: BlameQueryIdentity,
    input: WorkflowInput<"analysis.blame">,
  ): Promise<BlameResult | undefined> {
    return await this.operations.execute("analysis.blame", async (scope) => {
      return await this.queryClient.fetchQuery({
        queryKey: analysisQueryKeys.blame(identity),
        ...scopedSessionQueryOptions(scope, async () => {
          const requestKey = blameResultScopeKey(identity)
          const requestId = nanoid()
          useAnalysisTransientStore.getState().startBlame(requestKey, requestId)
          try {
            return await scope.run("analysis.blame", input, {
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

  private async fetchRepo(
    scope: SessionOperationScope,
    repoPath: string,
  ): Promise<void> {
    const { source, config, rosterContext, kind } = this.input
    const snapshotCommitOid = await this.queryClient.fetchQuery({
      queryKey: analysisQueryKeys.snapshotHead({
        source,
        repoPath,
        until: config.until ?? null,
      }),
      ...scopedSessionQueryOptions(scope, () =>
        scope.run("analysis.resolveSnapshotHead", {
          repositoryAbsolutePath: repoPath,
          until: config.until,
        }),
      ),
    })
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
      ...scopedSessionQueryOptions(scope, async () => {
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
