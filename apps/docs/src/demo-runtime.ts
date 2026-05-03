import {
  createAnalysisWorkflowHandlers,
  createConnectionWorkflowHandlers,
  createCourseWorkflowHandlers,
  createExaminationArchiveWorkflowHandlers,
  createExaminationWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createInMemoryAppSettingsStore,
  createInMemoryCourseStore,
  createInMemoryExaminationArchive,
  createLlmConnectionWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  runInspectUserFileWorkflow,
  runUserFileExportPreviewWorkflow,
} from "@repo-edu/application"
import type {
  AppError,
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/application-contract"
import { createWorkflowClient } from "@repo-edu/application-contract"
import type { GroupSet, PersistedCourse } from "@repo-edu/domain/types"
import { createBrowserMockHostEnvironment } from "@repo-edu/host-browser-mock"
import type { FileSystemPort } from "@repo-edu/host-runtime-contract"
import type { RemoteLmsMember } from "@repo-edu/integrations-lms-contract"
import { applyFixtureSourceOverlay } from "@repo-edu/test-fixtures"
import React from "react"
import { createRoot as createReactRoot } from "react-dom/client"
import type { DocsFixtureSource } from "./fixtures/docs-fixtures.js"
import {
  getDocsFixture,
  resolveDocsFixtureSelection,
} from "./fixtures/docs-fixtures.js"

export type DocsMountRoot = {
  render(element: ReturnType<typeof React.createElement>): void
}

export type DocsMountOptions = {
  queryMountNode?: () => unknown
  createRoot?: (mountNode: unknown) => DocsMountRoot
  source?: DocsFixtureSource
  appRootComponent?: React.ComponentType<{
    workflowClient: ReturnType<typeof createDocsDemoRuntime>["workflowClient"]
    rendererHost: ReturnType<typeof createDocsDemoRuntime>["rendererHost"]
  }>
}

export type DocsDemoRuntimeOptions = {
  source?: DocsFixtureSource
}

function resolveMountNode(queryMountNode?: () => unknown): unknown {
  if (queryMountNode) {
    return queryMountNode()
  }

  if (typeof document === "undefined") {
    return null
  }

  return document.querySelector("#app")
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as TValue
}

function toBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value)
  }
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  if (typeof btoa === "function") {
    return btoa(binary)
  }
  return value
}

// ---------------------------------------------------------------------------
// Mock LMS ports — source-aware factory
// ---------------------------------------------------------------------------

function createMockLmsPorts(
  source: DocsFixtureSource,
  seedCourse: PersistedCourse,
  seedCourseId: string,
  collaborativeGroupSet: GroupSet | null,
  lmsMemberIds: string[],
) {
  const toRemoteMember = (
    member: PersistedCourse["roster"]["students"][number],
  ): RemoteLmsMember => ({
    id: `remote-${member.id}`,
    lmsUserId: member.lmsUserId ?? member.id,
    name: member.name,
    email: member.email || null,
    studentNumber: member.studentNumber,
    enrollmentType: member.enrollmentType,
    enrollmentDisplay: member.enrollmentDisplay,
    status: member.status,
    lmsStatus: member.lmsStatus,
    source: member.source,
  })

  if (source === "file") {
    return {
      async verifyConnection() {
        return { verified: false }
      },
      async listCourses() {
        return []
      },
      async fetchRoster(): Promise<never> {
        throw new Error("No LMS connection configured")
      },
      async listGroupSets() {
        return []
      },
      async fetchGroupSet(): Promise<never> {
        throw new Error("No LMS connection configured")
      },
    }
  }

  return {
    async verifyConnection() {
      return { verified: true }
    },
    async listCourses() {
      return [
        { id: seedCourseId, name: "Docs Demo Course", code: "DOCS-101" },
        { id: "course-advanced", name: "Advanced Docs Course", code: null },
      ]
    },
    async fetchRoster() {
      return seedCourse.roster.students
        .concat(seedCourse.roster.staff)
        .map(toRemoteMember)
    },
    async listGroupSets() {
      return [
        {
          id: "lms-group-set-1",
          name: "LMS Teams",
          groupCount:
            collaborativeGroupSet?.nameMode === "named"
              ? collaborativeGroupSet.groupIds.length
              : (collaborativeGroupSet?.teams.length ?? 1),
        },
      ]
    },
    async fetchGroupSet(
      _draft: unknown,
      _courseId: string,
      groupSetId: string,
      _signal?: AbortSignal,
      _onProgress?: (message: string) => void,
    ) {
      return {
        groupSet: {
          id: groupSetId,
          name: "LMS Teams",
        },
        groups: [
          {
            id: "lms-group-1",
            name: "lms-team-1",
            memberLmsUserIds: lmsMemberIds,
          },
        ],
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Runtime creation
// ---------------------------------------------------------------------------

export function createDocsDemoRuntime(options: DocsDemoRuntimeOptions = {}) {
  const fixtureSelection = resolveDocsFixtureSelection(options)
  const fixture = getDocsFixture(fixtureSelection)
  const seedCourse = cloneValue(fixture.course)
  const seedSettings = cloneValue(fixture.settings)
  const seedCourseEntityId = seedCourse.id
  const seedCourseId = seedCourse.lmsCourseId ?? "course-task-groups"

  applyFixtureSourceOverlay(
    seedCourse,
    seedSettings,
    fixtureSelection.source,
    seedCourseId,
  )

  const browserMockHost = createBrowserMockHostEnvironment({
    readableFiles: fixture.readableFiles,
  })
  const lmsMemberIds = seedCourse.roster.students
    .slice(0, 2)
    .map((member) => member.id)
  const collaborativeGroupSet =
    seedCourse.roster.groupSets.find(
      (groupSet) =>
        groupSet.connection !== null && groupSet.connection.kind !== "system",
    ) ?? null

  const courseStore = createInMemoryCourseStore([seedCourse])
  const appSettingsStore = createInMemoryAppSettingsStore(seedSettings)

  const lmsPorts = createMockLmsPorts(
    fixtureSelection.source,
    seedCourse,
    seedCourseId,
    collaborativeGroupSet,
    lmsMemberIds,
  )

  const gitPorts = {
    async verifyConnection() {
      return { verified: true }
    },
    async verifyGitUsernames(_draft: unknown, usernames: string[]) {
      return usernames.map((username) => ({
        username,
        exists: !username.toLowerCase().includes("invalid"),
      }))
    },
    async createRepositories(
      _draft: unknown,
      request: { organization: string; repositoryNames: string[] },
    ) {
      return {
        created: request.repositoryNames.map((name) => ({
          repositoryName: name,
          repositoryUrl: `https://github.com/${request.organization}/${name}`,
        })),
        alreadyExisted: [],
        failed: [],
      }
    },
    async createTeam(
      _draft: unknown,
      request: { teamName: string; memberUsernames: string[] },
    ) {
      return {
        created: true,
        teamSlug: request.teamName,
        membersAdded: request.memberUsernames,
        membersNotFound: [],
      }
    },
    async assignRepositoriesToTeam(
      _draft: unknown,
      _request: { repositoryNames: string[]; teamSlug: string },
    ) {
      return
    },
    async getRepositoryDefaultBranchHead(
      _draft: unknown,
      request: { owner: string; repositoryName: string },
    ) {
      return {
        sha: `${request.owner}-${request.repositoryName}-sha`,
        branchName: "main",
      }
    },
    async getTemplateDiff() {
      return {
        files: [
          {
            path: "README.md",
            previousPath: null,
            status: "modified" as const,
            contentBase64: toBase64("Updated template content"),
          },
        ],
      }
    },
    async createBranch() {
      return
    },
    async createPullRequest(
      _draft: unknown,
      request: { owner: string; repositoryName: string; headBranch: string },
    ) {
      return {
        url: `https://github.com/${request.owner}/${request.repositoryName}/pull/1?branch=${request.headBranch}`,
        created: true,
      }
    },
    async resolveRepositoryCloneUrls(
      _draft: unknown,
      request: { organization: string; repositoryNames: string[] },
    ) {
      return {
        resolved: request.repositoryNames.map((repositoryName) => ({
          repositoryName,
          cloneUrl: `https://github.com/${request.organization}/${repositoryName}.git`,
        })),
        missing: [],
      }
    },
    async listRepositories() {
      return { repositories: [] }
    },
  }

  const gitCommandPort = {
    cancellation: "best-effort" as const,
    async run() {
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }
    },
  }

  const fileSystemPort: FileSystemPort = {
    userHomeSystemDirectories: [],
    async inspect(request) {
      return request.paths.map((path) => ({
        path,
        kind: "missing" as const,
      }))
    },
    async applyBatch(request) {
      return {
        completed: request.operations,
      }
    },
    async createTempDirectory(_prefix) {
      return "/tmp/repo-edu-demo"
    },
    async listDirectory(_request) {
      return [
        { name: "team-alpha-project", kind: "directory" as const },
        { name: "team-beta-project", kind: "directory" as const },
        { name: "README.md", kind: "file" as const },
      ]
    },
  }

  const workflowHandlers = {
    ...createCourseWorkflowHandlers(courseStore),
    ...createSettingsWorkflowHandlers(appSettingsStore),
    ...createConnectionWorkflowHandlers({
      lms: lmsPorts,
      git: gitPorts,
    }),
    ...createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: () => ({
        async generateText() {
          throw {
            type: "provider",
            message:
              "LLM connection verification is not available in the docs demo. Run the desktop app to verify your credentials.",
            provider: "llm",
            operation: "verifyLlmDraft",
            retryable: false,
          } satisfies AppError
        },
      }),
    }),
    ...createValidationWorkflowHandlers(),
    ...createRosterWorkflowHandlers({
      lms: lmsPorts,
      userFile: browserMockHost.userFilePort,
    }),
    ...createGroupSetWorkflowHandlers({
      lms: lmsPorts,
      userFile: browserMockHost.userFilePort,
    }),
    ...createGitUsernameWorkflowHandlers({
      userFile: browserMockHost.userFilePort,
      git: gitPorts,
    }),
    ...createRepositoryWorkflowHandlers({
      git: gitPorts,
      gitCommand: gitCommandPort,
      fileSystem: fileSystemPort,
    }),
    ...createAnalysisWorkflowHandlers({
      gitCommand: gitCommandPort,
      fileSystem: fileSystemPort,
    }),
    ...(() => {
      const archive = createInMemoryExaminationArchive()
      return {
        ...createExaminationWorkflowHandlers({
          llm: {
            async run(_request) {
              throw {
                type: "provider",
                message:
                  "LLM calls are not available in the docs demo. Run the desktop app to generate examination questions.",
                provider: "llm",
                operation: "examination.generateQuestions",
                retryable: false,
              } satisfies AppError
            },
          },
          archive,
        }),
        ...createExaminationArchiveWorkflowHandlers({
          archive,
          userFile: browserMockHost.userFilePort,
        }),
      }
    })(),
    "cache.getStats": async () => ({ caches: [] }),
    "cache.clearAll": async () => ({ cleared: [] }),
    "userFile.inspectSelection": (
      input: UserFileRef,
      options: Parameters<typeof runInspectUserFileWorkflow>[2],
    ) =>
      runInspectUserFileWorkflow(browserMockHost.userFilePort, input, options),
    "userFile.exportPreview": (
      input: UserSaveTargetRef,
      options: Parameters<typeof runUserFileExportPreviewWorkflow>[2],
    ) =>
      runUserFileExportPreviewWorkflow(
        browserMockHost.userFilePort,
        input,
        options,
      ),
  }

  const workflowClient = createWorkflowClient(workflowHandlers)

  return {
    workflowClient,
    workflowHandlers,
    rendererHost: browserMockHost.rendererHost,
    seedCourseEntityId,
    seedCourseId,
    fixtureSelection,
  }
}

export function mountDocsDemoApp(options: DocsMountOptions = {}) {
  const mountNode = resolveMountNode(options.queryMountNode)
  if (mountNode === null || mountNode === undefined) {
    throw new Error("Docs app mount node #app was not found")
  }

  const runtime = createDocsDemoRuntime({
    source: options.source,
  })
  const appRootComponent = options.appRootComponent
  if (!appRootComponent) {
    throw new Error("Docs app root component was not provided.")
  }
  const createRoot =
    options.createRoot ??
    ((node: unknown) =>
      createReactRoot(node as Parameters<typeof createReactRoot>[0]))

  createRoot(mountNode).render(
    React.createElement(appRootComponent, {
      workflowClient: runtime.workflowClient,
      rendererHost: runtime.rendererHost,
    }),
  )

  return runtime
}
