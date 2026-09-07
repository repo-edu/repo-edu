import {
  type AppSettingsStore,
  type CourseStore,
  createAnalysisWorkflowHandlers,
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
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
  AppSettingsLoadResult,
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
  defaultAppPreferences,
  type PersistedAppCredentials,
  type PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import type {
  ExaminationArchiveStoragePort,
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  LlmPort,
  TokenizerPort,
  UserFilePort,
} from "@repo-edu/host-runtime-contract"
import { createGitProviderDispatch } from "@repo-edu/integrations-git"
import { createLmsProviderDispatch } from "@repo-edu/integrations-lms"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"

export type DesktopWorkflowContext = {
  signal: AbortSignal
  settle(): void
  terminal(error: unknown): void
}

const t = initTRPC.context<DesktopWorkflowContext>().create()

type DesktopWorkflowId = keyof typeof workflowCatalog

export type DesktopRouterPorts = {
  http: HttpPort
  courseStore: CourseStore
  appSettingsStore: AppSettingsStore
  userFile: UserFilePort
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
  llm: LlmPort
  tokenizer: TokenizerPort
  examinationArchive: ExaminationArchiveStoragePort
  initialSettingsLoadResult: AppSettingsLoadResult
  /**
   * Called whenever `settings.saveCredentials` succeeds. Composition root uses
   * this to rebuild the LLM port delegate so the next workflow run sees the
   * updated connection.
   */
  onAppCredentialsSaved?: (credentials: PersistedAppCredentials) => void
  /** Factory for verifying draft LLM connections. */
  createDraftLlmTextClient: LlmConnectionWorkflowPorts["createDraftLlmTextClient"]
}

type DesktopSettingsStore = AppSettingsStore & {
  readPreferencesWithoutRecovery?(
    signal?: AbortSignal,
  ): Promise<PersistedAppPreferences | null> | PersistedAppPreferences | null
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
 * this launch. Env values are not persisted; preference saves strip these
 * fields from the raw preferences section.
 */
function applyEnvOverrides(
  result: AppSettingsLoadResult,
): AppSettingsLoadResult {
  const repoParallelism = envPositiveInt("REPO_EDU_REPO_PARALLELISM")
  const filesPerRepo = envPositiveInt("REPO_EDU_FILES_PER_REPO")
  if (repoParallelism === null && filesPerRepo === null) {
    return result
  }
  return {
    ...result,
    preferences: {
      ...result.preferences,
      analysisConcurrency: {
        repoParallelism:
          repoParallelism ??
          result.preferences.analysisConcurrency.repoParallelism,
        filesPerRepo:
          filesPerRepo ?? result.preferences.analysisConcurrency.filesPerRepo,
      },
    },
  }
}

function hasPreferenceEnvOverrides(): boolean {
  return (
    envPositiveInt("REPO_EDU_REPO_PARALLELISM") !== null ||
    envPositiveInt("REPO_EDU_FILES_PER_REPO") !== null
  )
}

/**
 * Prevents launch-scoped env overrides from leaking into persisted preferences.
 * Any field currently overridden by env is persisted from raw disk state.
 */
function stripEnvOverridesForPersist(
  next: PersistedAppPreferences,
  rawPersisted: PersistedAppPreferences,
): PersistedAppPreferences {
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

export async function resolveDesktopPreferencesSavePayload(
  next: PersistedAppPreferences,
  options: {
    readPreferencesWithoutRecovery?: (
      signal?: AbortSignal,
    ) =>
      | Promise<PersistedAppPreferences | null>
      | PersistedAppPreferences
      | null
    signal?: AbortSignal
  } = {},
): Promise<PersistedAppPreferences> {
  if (!hasPreferenceEnvOverrides()) {
    return next
  }

  const rawPersisted =
    (await options.readPreferencesWithoutRecovery?.(options.signal)) ??
    defaultAppPreferences

  return stripEnvOverridesForPersist(next, rawPersisted)
}

export function createDesktopWorkflowRegistry(
  ports: DesktopRouterPorts,
): WorkflowHandlerMap<DesktopWorkflowId> {
  const lms = createLmsProviderDispatch(ports.http)
  const git = createGitProviderDispatch(ports.http)

  const examinationArchive = createExaminationArchive(ports.examinationArchive)

  const appSettingsStore = ports.appSettingsStore as DesktopSettingsStore
  const settingsHandlers = createSettingsWorkflowHandlers(appSettingsStore)
  const wrappedSettingsHandlers: typeof settingsHandlers = {
    ...settingsHandlers,
    "settings.loadApp": async () =>
      applyEnvOverrides(ports.initialSettingsLoadResult),
    "settings.savePreferences": async (input, options) => {
      const persistable = await resolveDesktopPreferencesSavePayload(input, {
        readPreferencesWithoutRecovery:
          appSettingsStore.readPreferencesWithoutRecovery,
        signal: options?.signal,
      })
      await settingsHandlers["settings.savePreferences"](persistable, options)
    },
    "settings.saveCredentials": async (input, options) => {
      await settingsHandlers["settings.saveCredentials"](input, options)
      ports.onAppCredentialsSaved?.(input)
    },
  }

  return {
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
      tokenizer: ports.tokenizer,
      fileSystem: ports.fileSystem,
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
>(workflowId: TWorkflowId, handler: WorkflowHandler<TWorkflowId>) {
  return t.procedure
    .input({
      parse(value: unknown): WorkflowInput<TWorkflowId> {
        return value as WorkflowInput<TWorkflowId>
      },
    })
    .subscription(({ input, ctx }) =>
      observable<WorkflowEventFor<TWorkflowId>>((emit) => {
        const settleInvocation = ctx.settle
        if (ctx.signal.aborted) {
          settleInvocation()
          emit.complete()
          return
        }
        try {
          const emitNext = (value: WorkflowEventFor<TWorkflowId>) => {
            if (ctx.signal.aborted) {
              return
            }

            emit.next(value)
          }
          const emitComplete = () => {
            emit.complete()
          }

          handler(input, {
            signal: ctx.signal,
            onProgress(data) {
              emitNext({ type: "progress", data })
            },
            onOutput(data) {
              emitNext({ type: "output", data })
            },
          })
            .then((result) => {
              settleInvocation()
              emitNext({ type: "completed", data: result })
              emitComplete()
            })
            .catch((error) => {
              const failure = toAppError(error)
              if (
                failure.type === "course-storage" ||
                ((workflowId === "settings.saveCredentials" ||
                  workflowId === "settings.savePreferences") &&
                  failure.type !== "cancelled" &&
                  failure.type !== "validation")
              ) {
                // Terminal admission must precede call retirement: retirement
                // can otherwise start close preparation against a failed store.
                ctx.terminal(error)
                settleInvocation()
                emitComplete()
                return
              }
              settleInvocation()
              emitNext({
                type: "failed",
                error: failure,
              })
              emitComplete()
            })
            .finally(settleInvocation)
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
  return createDesktopWorkflowRouter(createDesktopWorkflowRegistry(ports))
}

export function createDesktopWorkflowRouter(
  workflowRegistry: WorkflowHandlerMap<DesktopWorkflowId>,
) {
  const procedures = Object.fromEntries(
    (Object.keys(workflowRegistry) as DesktopWorkflowId[]).map((workflowId) => [
      workflowId,
      createWorkflowSubscriptionProcedure(
        workflowId,
        workflowRegistry[workflowId] as WorkflowHandler<typeof workflowId>,
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
