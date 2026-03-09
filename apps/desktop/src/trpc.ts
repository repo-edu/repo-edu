import {
  type AppSettingsStore,
  createConnectionWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createProfileWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  type ProfileStore,
  runInspectUserFileWorkflow,
  runSpikeCorsWorkflow,
  runSpikeWorkflow,
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
  createCancelledAppError,
  isAppError,
  type workflowCatalog,
} from "@repo-edu/application-contract"
import type { GitProviderKind, LmsProviderKind } from "@repo-edu/domain"
import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  UserFilePort,
} from "@repo-edu/host-runtime-contract"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import type {
  CreateRepositoriesRequest,
  DeleteRepositoriesRequest,
  GitConnectionDraft,
  ResolveRepositoryCloneUrlsRequest,
} from "@repo-edu/integrations-git-contract"
import { createLmsClient } from "@repo-edu/integrations-lms"
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract"
import { initTRPC } from "@trpc/server"
import { observable } from "@trpc/server/observable"

const t = initTRPC.create()

type DesktopWorkflowId = keyof typeof workflowCatalog

export type DesktopRouterPorts = {
  http: HttpPort
  profileStore: ProfileStore
  appSettingsStore: AppSettingsStore
  userFile: UserFilePort
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}

function createLmsProviderDispatch(http: HttpPort) {
  const clients = new Map<LmsProviderKind, ReturnType<typeof createLmsClient>>()

  const resolveClient = (provider: LmsProviderKind) => {
    const existing = clients.get(provider)
    if (existing) {
      return existing
    }

    const next = createLmsClient(provider, http)
    clients.set(provider, next)
    return next
  }

  return {
    verifyConnection(draft: LmsConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal)
    },
    listCourses(draft: LmsConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).listCourses(draft, signal)
    },
    fetchRoster(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).fetchRoster(draft, courseId, signal)
    },
    listGroupSets(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).listGroupSets(
        draft,
        courseId,
        signal,
      )
    },
    fetchGroupSet(
      draft: LmsConnectionDraft,
      courseId: string,
      groupSetId: string,
      signal?: AbortSignal,
      onProgress?: (message: string) => void,
    ) {
      return resolveClient(draft.provider).fetchGroupSet(
        draft,
        courseId,
        groupSetId,
        signal,
        onProgress,
      )
    },
  }
}

function createGitProviderDispatch(http: HttpPort) {
  const clients = new Map<
    GitProviderKind,
    ReturnType<typeof createGitProviderClient>
  >()

  const resolveClient = (provider: GitProviderKind) => {
    const existing = clients.get(provider)
    if (existing) {
      return existing
    }

    const next = createGitProviderClient(provider, http)
    clients.set(provider, next)
    return next
  }

  return {
    verifyConnection(draft: GitConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal)
    },
    verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).verifyGitUsernames(
        draft,
        usernames,
        signal,
      )
    },
    createRepositories(
      draft: GitConnectionDraft,
      request: CreateRepositoriesRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).createRepositories(
        draft,
        request,
        signal,
      )
    },
    resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).resolveRepositoryCloneUrls(
        draft,
        request,
        signal,
      )
    },
    deleteRepositories(
      draft: GitConnectionDraft,
      request: DeleteRepositoriesRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).deleteRepositories(
        draft,
        request,
        signal,
      )
    },
  }
}

function createDesktopWorkflowRegistry(
  ports: DesktopRouterPorts,
): WorkflowHandlerMap<DesktopWorkflowId> {
  const lms = createLmsProviderDispatch(ports.http)
  const git = createGitProviderDispatch(ports.http)

  return {
    ...createProfileWorkflowHandlers(ports.profileStore),
    ...createSettingsWorkflowHandlers(ports.appSettingsStore),
    ...createConnectionWorkflowHandlers({ lms, git }),
    ...createRosterWorkflowHandlers(
      ports.profileStore,
      ports.appSettingsStore,
      {
        lms,
        userFile: ports.userFile,
      },
    ),
    ...createGroupSetWorkflowHandlers(
      ports.profileStore,
      ports.appSettingsStore,
      {
        lms,
        userFile: ports.userFile,
      },
    ),
    ...createGitUsernameWorkflowHandlers(
      ports.profileStore,
      ports.appSettingsStore,
      {
        userFile: ports.userFile,
        git,
      },
    ),
    ...createValidationWorkflowHandlers(ports.profileStore),
    ...createRepositoryWorkflowHandlers(
      ports.profileStore,
      ports.appSettingsStore,
      {
        git,
        gitCommand: ports.gitCommand,
        fileSystem: ports.fileSystem,
      },
    ),
    "userFile.inspectSelection": (input, options) =>
      runInspectUserFileWorkflow(ports.userFile, input, options),
    "userFile.exportPreview": (input, options) =>
      runUserFileExportPreviewWorkflow(ports.userFile, input, options),
    "spike.e2e-trpc": (_input, options) => runSpikeWorkflow(options),
    "spike.cors-http": (_input, options) =>
      runSpikeCorsWorkflow({ http: ports.http }, options),
  }
}

function createWorkflowSubscriptionProcedure<
  TWorkflowId extends DesktopWorkflowId,
>(handler: WorkflowHandler<TWorkflowId>) {
  return t.procedure
    .input({
      parse(value: unknown): WorkflowInput<TWorkflowId> {
        return value as WorkflowInput<TWorkflowId>
      },
    })
    .subscription(({ input }) =>
      observable<WorkflowEventFor<TWorkflowId>>((emit) => {
        const abortController = new AbortController()

        handler(input, {
          signal: abortController.signal,
          onProgress(data) {
            emit.next({ type: "progress", data })
          },
          onOutput(data) {
            emit.next({ type: "output", data })
          },
        })
          .then((result) => {
            emit.next({ type: "completed", data: result })
            emit.complete()
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error)
          })

        return () => {
          abortController.abort()
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

  return t.router({
    "profile.list": createWorkflowSubscriptionProcedure(
      workflowRegistry["profile.list"],
    ),
    "profile.load": createWorkflowSubscriptionProcedure(
      workflowRegistry["profile.load"],
    ),
    "profile.save": createWorkflowSubscriptionProcedure(
      workflowRegistry["profile.save"],
    ),
    "profile.delete": createWorkflowSubscriptionProcedure(
      workflowRegistry["profile.delete"],
    ),
    "settings.loadApp": createWorkflowSubscriptionProcedure(
      workflowRegistry["settings.loadApp"],
    ),
    "settings.saveApp": createWorkflowSubscriptionProcedure(
      workflowRegistry["settings.saveApp"],
    ),
    "connection.verifyLmsDraft": createWorkflowSubscriptionProcedure(
      workflowRegistry["connection.verifyLmsDraft"],
    ),
    "connection.listLmsCoursesDraft": createWorkflowSubscriptionProcedure(
      workflowRegistry["connection.listLmsCoursesDraft"],
    ),
    "connection.verifyGitDraft": createWorkflowSubscriptionProcedure(
      workflowRegistry["connection.verifyGitDraft"],
    ),
    "roster.importFromFile": createWorkflowSubscriptionProcedure(
      workflowRegistry["roster.importFromFile"],
    ),
    "roster.importFromLms": createWorkflowSubscriptionProcedure(
      workflowRegistry["roster.importFromLms"],
    ),
    "roster.exportStudents": createWorkflowSubscriptionProcedure(
      workflowRegistry["roster.exportStudents"],
    ),
    "groupSet.fetchAvailableFromLms": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.fetchAvailableFromLms"],
    ),
    "groupSet.connectFromLms": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.connectFromLms"],
    ),
    "groupSet.syncFromLms": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.syncFromLms"],
    ),
    "groupSet.previewImportFromFile": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.previewImportFromFile"],
    ),
    "groupSet.previewReimportFromFile": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.previewReimportFromFile"],
    ),
    "groupSet.export": createWorkflowSubscriptionProcedure(
      workflowRegistry["groupSet.export"],
    ),
    "gitUsernames.import": createWorkflowSubscriptionProcedure(
      workflowRegistry["gitUsernames.import"],
    ),
    "validation.roster": createWorkflowSubscriptionProcedure(
      workflowRegistry["validation.roster"],
    ),
    "validation.assignment": createWorkflowSubscriptionProcedure(
      workflowRegistry["validation.assignment"],
    ),
    "repo.create": createWorkflowSubscriptionProcedure(
      workflowRegistry["repo.create"],
    ),
    "repo.clone": createWorkflowSubscriptionProcedure(
      workflowRegistry["repo.clone"],
    ),
    "repo.delete": createWorkflowSubscriptionProcedure(
      workflowRegistry["repo.delete"],
    ),
    "userFile.inspectSelection": createWorkflowSubscriptionProcedure(
      workflowRegistry["userFile.inspectSelection"],
    ),
    "userFile.exportPreview": createWorkflowSubscriptionProcedure(
      workflowRegistry["userFile.exportPreview"],
    ),
    "spike.e2e-trpc": createWorkflowSubscriptionProcedure(
      workflowRegistry["spike.e2e-trpc"],
    ),
    "spike.cors-http": createWorkflowSubscriptionProcedure(
      workflowRegistry["spike.cors-http"],
    ),
  })
}

function emitFailure(
  emit: {
    next(value: { type: "failed"; error: AppError }): void
    complete(): void
  },
  signal: AbortSignal,
  error: unknown,
) {
  if (signal.aborted) {
    emit.next({
      type: "failed",
      error: createCancelledAppError(),
    })
  } else if (isAppError(error)) {
    emit.next({
      type: "failed",
      error,
    })
  } else {
    emit.next({
      type: "failed",
      error: {
        type: "unexpected",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    })
  }

  emit.complete()
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>
export type { DesktopWorkflowId as DesktopWorkflowKey, WorkflowId }
