import {
  type AnalysisStore,
  type AppSettingsStore,
  type CourseStore,
  createAnalysisDocWorkflowHandlers,
  createAnalysisWorkflowHandlers,
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createDocumentsListWorkflowHandler,
  createExaminationArchive,
  createExaminationArchiveWorkflowHandlers,
  createExaminationWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createLlmConnectionWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  type LlmConnectionWorkflowPorts,
  runInspectUserFileWorkflow,
  runUserFileExportPreviewWorkflow,
} from "@repo-edu/application"
import type {
  AppError,
  WorkflowEventFor,
  WorkflowHandler,
  WorkflowHandlerMap,
  WorkflowId,
  WorkflowInput,
} from "@repo-edu/application-contract"
import {
  isAppError,
  type workflowCatalog,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import type {
  ExaminationArchiveStoragePort,
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  LlmPort,
  UserFilePort,
} from "@repo-edu/host-runtime-contract"
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"

const t = initTRPC.create()

type DesktopWorkflowId = keyof typeof workflowCatalog

export type DesktopRouterPorts = {
  http: HttpPort
  analysisStore: AnalysisStore
  courseStore: CourseStore
  appSettingsStore: AppSettingsStore
  userFile: UserFilePort
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
  llm: LlmPort
  examinationArchive: ExaminationArchiveStoragePort
  parentAbortSignal?: AbortSignal
  onWorkflowInvocationStart?: () => () => void
  /**
   * Called whenever `settings.saveApp` succeeds with the validated, env-stripped
   * settings about to be persisted. Composition root uses this to rebuild the
   * LLM port delegate so the next workflow run sees the updated connection.
   */
  onAppSettingsSaved?: (settings: PersistedAppSettings) => void
  /** Factory for verifying draft LLM connections. */
  createDraftLlmTextClient: LlmConnectionWorkflowPorts["createDraftLlmTextClient"]
}

function envPositiveInt(name: string): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/**
 * Applies session-scoped env overrides on top of the loaded settings so
 * the renderer and workflow handlers consume the same effective values
 * this launch. Env values are not persisted — `settings.saveApp` writes
 * the raw payload unchanged.
 */
function applyEnvOverrides(
  settings: PersistedAppSettings,
): PersistedAppSettings {
  const repoParallelism = envPositiveInt("REPO_EDU_REPO_PARALLELISM")
  const filesPerRepo = envPositiveInt("REPO_EDU_FILES_PER_REPO")
  if (repoParallelism === null && filesPerRepo === null) {
    return settings
  }
  return {
    ...settings,
    analysisConcurrency: {
      repoParallelism:
        repoParallelism ?? settings.analysisConcurrency.repoParallelism,
      filesPerRepo: filesPerRepo ?? settings.analysisConcurrency.filesPerRepo,
    },
  }
}

/**
 * Prevents launch-scoped env overrides from leaking into persisted settings.
 * Any field currently overridden by env is persisted from raw disk state.
 */
function stripEnvOverridesForPersist(
  next: PersistedAppSettings,
  rawPersisted: PersistedAppSettings,
): PersistedAppSettings {
  const repoParallelism = envPositiveInt("REPO_EDU_REPO_PARALLELISM")
  const filesPerRepo = envPositiveInt("REPO_EDU_FILES_PER_REPO")
  if (repoParallelism === null && filesPerRepo === null) {
    return next
  }
  return {
    ...next,
    analysisConcurrency: {
      repoParallelism:
        repoParallelism === null
          ? next.analysisConcurrency.repoParallelism
          : rawPersisted.analysisConcurrency.repoParallelism,
      filesPerRepo:
        filesPerRepo === null
          ? next.analysisConcurrency.filesPerRepo
          : rawPersisted.analysisConcurrency.filesPerRepo,
    },
  }
}

function createDesktopWorkflowRegistry(
  ports: DesktopRouterPorts,
): WorkflowHandlerMap<DesktopWorkflowId> {
  const lms = createLmsProviderDispatch(ports.http)
  const git = createGitProviderDispatch(ports.http)

  const examinationArchive = createExaminationArchive(ports.examinationArchive)

  const settingsHandlers = createSettingsWorkflowHandlers(
    ports.appSettingsStore,
  )
  const wrappedSettingsHandlers: typeof settingsHandlers = {
    ...settingsHandlers,
    "settings.loadApp": async (input, options) => {
      const loaded = await settingsHandlers["settings.loadApp"](input, options)
      return applyEnvOverrides(loaded)
    },
    "settings.saveApp": async (input, options) => {
      const rawPersisted =
        (await ports.appSettingsStore.loadSettings(options?.signal)) ??
        defaultAppSettings
      const persistable = stripEnvOverridesForPersist(input, rawPersisted)
      const saved = await settingsHandlers["settings.saveApp"](
        persistable,
        options,
      )
      ports.onAppSettingsSaved?.(saved)
      return applyEnvOverrides(saved)
    },
  }

  return {
    ...createAnalysisDocWorkflowHandlers(ports.analysisStore),
    ...createDocumentsListWorkflowHandler(
      ports.analysisStore,
      ports.courseStore,
    ),
    ...createCourseWorkflowHandlers(ports.courseStore),
    ...wrappedSettingsHandlers,
    ...createConnectionWorkflowHandlers({ lms, git }),
    ...createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: ports.createDraftLlmTextClient,
    }),
    ...createRosterWorkflowHandlers({
      lms,
      userFile: ports.userFile,
    }),
    ...createGroupSetWorkflowHandlers({
      lms,
      userFile: ports.userFile,
    }),
    ...createGitUsernameWorkflowHandlers({
      userFile: ports.userFile,
      git,
    }),
    ...createValidationWorkflowHandlers(),
    ...createRepositoryWorkflowHandlers({
      git,
      gitCommand: ports.gitCommand,
      fileSystem: ports.fileSystem,
    }),
    ...createAnalysisWorkflowHandlers({
      gitCommand: ports.gitCommand,
      fileSystem: ports.fileSystem,
    }),
    ...createExaminationWorkflowHandlers({
      llm: ports.llm,
      archive: examinationArchive,
    }),
    ...createExaminationArchiveWorkflowHandlers({
      archive: examinationArchive,
      userFile: ports.userFile,
    }),
    "userFile.inspectSelection": (input, options) =>
      runInspectUserFileWorkflow(ports.userFile, input, options),
    "userFile.exportPreview": (input, options) =>
      runUserFileExportPreviewWorkflow(ports.userFile, input, options),
  }
}

function createWorkflowSubscriptionProcedure<
  TWorkflowId extends DesktopWorkflowId,
>(
  handler: WorkflowHandler<TWorkflowId>,
  parentAbortSignal: AbortSignal | undefined,
  onWorkflowInvocationStart: (() => () => void) | undefined,
) {
  return t.procedure
    .input({
      parse(value: unknown): WorkflowInput<TWorkflowId> {
        return value as WorkflowInput<TWorkflowId>
      },
    })
    .subscription(({ input }) =>
      observable<WorkflowEventFor<TWorkflowId>>((emit) => {
        const markInvocationSettled = onWorkflowInvocationStart?.()
        let settled = false
        const settleInvocation = () => {
          if (settled) return
          settled = true
          markInvocationSettled?.()
        }
        // Any synchronous throw between the counter increment above and
        // the `.finally(settleInvocation)` wiring below would leak the
        // in-flight counter; the outer try/catch guarantees a decrement
        // on setup failures.
        try {
          const abortController = new AbortController()
          const onParentAbort = () => {
            if (!abortController.signal.aborted) {
              abortController.abort()
            }
          }
          let removeParentAbortListener = () => {}
          if (parentAbortSignal) {
            if (parentAbortSignal.aborted) {
              abortController.abort()
            } else {
              parentAbortSignal.addEventListener("abort", onParentAbort, {
                once: true,
              })
              removeParentAbortListener = () => {
                parentAbortSignal.removeEventListener("abort", onParentAbort)
              }
            }
          }
          const emitNext = (value: WorkflowEventFor<TWorkflowId>) => {
            if (abortController.signal.aborted) {
              return
            }

            try {
              emit.next(value)
            } catch {
              // Stream can already be closed during shutdown races.
            }
          }
          const emitComplete = () => {
            if (abortController.signal.aborted) {
              return
            }

            try {
              emit.complete()
            } catch {
              // Stream can already be closed during shutdown races.
            }
          }

          handler(input, {
            signal: abortController.signal,
            onProgress(data) {
              emitNext({ type: "progress", data })
            },
            onOutput(data) {
              emitNext({ type: "output", data })
            },
          })
            .then((result) => {
              emitNext({ type: "completed", data: result })
              emitComplete()
            })
            .catch((error) => {
              if (abortController.signal.aborted) {
                return
              }

              emitNext({
                type: "failed",
                error: toAppError(error),
              })
              emitComplete()
            })
            .finally(() => {
              removeParentAbortListener()
              settleInvocation()
            })

          return () => {
            removeParentAbortListener()
            abortController.abort()
          }
        } catch (error) {
          settleInvocation()
          throw error
        }
      }),
    )
}

/**
 * Creates the Electron main-side tRPC router for all shared workflow ids.
 *
 * Workflow registration is compile-time exhaustive through WorkflowHandlerMap.
 */
export function createDesktopRouter(ports: DesktopRouterPorts) {
  const workflowRegistry = createDesktopWorkflowRegistry(ports)

  const procedures = Object.fromEntries(
    (Object.keys(workflowRegistry) as DesktopWorkflowId[]).map((workflowId) => [
      workflowId,
      createWorkflowSubscriptionProcedure(
        workflowRegistry[workflowId] as WorkflowHandler<typeof workflowId>,
        ports.parentAbortSignal,
        ports.onWorkflowInvocationStart,
      ),
    ]),
  )

  return t.router(procedures)
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }

  return {
    type: "unexpected",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  }
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>
export type { DesktopWorkflowId as DesktopWorkflowKey, WorkflowId }
