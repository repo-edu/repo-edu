import {
  createConnectionWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createInMemoryAppSettingsStore,
  createInMemoryProfileStore,
  createProfileWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  runInspectUserFileWorkflow,
  runUserFileExportPreviewWorkflow,
} from "@repo-edu/application"
import type {
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/application-contract"
import { createWorkflowClient } from "@repo-edu/application-contract"
import { ORIGIN_LMS } from "@repo-edu/domain"
import { createBrowserMockHostEnvironment } from "@repo-edu/host-browser-mock"
import React from "react"
import { createRoot as createReactRoot } from "react-dom/client"
import type {
  DocsFixturePreset,
  DocsFixtureTier,
} from "./fixtures/docs-fixtures.js"
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
  tier?: DocsFixtureTier
  preset?: DocsFixturePreset
  appRootComponent?: React.ComponentType<{
    workflowClient: ReturnType<typeof createDocsDemoRuntime>["workflowClient"]
    rendererHost: ReturnType<typeof createDocsDemoRuntime>["rendererHost"]
  }>
}

export type DocsDemoRuntimeOptions = {
  tier?: DocsFixtureTier
  preset?: DocsFixturePreset
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

export function createDocsDemoRuntime(options: DocsDemoRuntimeOptions = {}) {
  const fixtureSelection = resolveDocsFixtureSelection(options)
  const fixture = getDocsFixture(fixtureSelection)
  const seedProfile = cloneValue(fixture.profile)
  const seedSettings = cloneValue(fixture.settings)
  const seedProfileId = seedProfile.id
  const seedCourseId =
    seedProfile.courseId ??
    `course-${fixtureSelection.tier}-${fixtureSelection.preset}`
  const browserMockHost = createBrowserMockHostEnvironment({
    readableFiles: fixture.readableFiles,
  })
  const lmsMemberIds = seedProfile.roster.students
    .slice(0, 2)
    .map((member) => member.id)
  const collaborativeGroupSet =
    seedProfile.roster.groupSets.find(
      (groupSet) => groupSet.connection === null,
    ) ?? null

  const profileStore = createInMemoryProfileStore([seedProfile])
  const appSettingsStore = createInMemoryAppSettingsStore(seedSettings)

  const lmsPorts = {
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
      return {
        ...seedProfile.roster,
        connection: {
          kind: "canvas" as const,
          courseId: seedCourseId,
          lastUpdated: new Date().toISOString(),
        },
      }
    },
    async listGroupSets() {
      return [
        {
          id: "lms-group-set-1",
          name: "LMS Teams",
          groupCount: collaborativeGroupSet?.groupIds.length ?? 1,
        },
      ]
    },
    async fetchGroupSet(
      _draft: unknown,
      courseId: string,
      groupSetId: string,
      _signal?: AbortSignal,
      _onProgress?: (message: string) => void,
    ) {
      return {
        groupSet: {
          id: groupSetId,
          name: "LMS Teams",
          groupIds: ["lms-group-1"],
          connection: {
            kind: "canvas" as const,
            courseId,
            groupSetId,
            lastUpdated: new Date().toISOString(),
          },
          groupSelection: {
            kind: "all" as const,
            excludedGroupIds: [],
          },
        },
        groups: [
          {
            id: "lms-group-1",
            name: "lms-team-1",
            memberIds: lmsMemberIds,
            origin: ORIGIN_LMS,
            lmsGroupId: "lms-group-1",
          },
        ],
      }
    },
  }

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
        createdCount: request.repositoryNames.length,
        repositoryUrls: request.repositoryNames.map(
          (name) => `https://github.com/${request.organization}/${name}`,
        ),
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
    async deleteRepositories(
      _draft: unknown,
      request: { repositoryNames: string[] },
    ) {
      return {
        deletedCount: request.repositoryNames.length,
        missing: [],
      }
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

  const fileSystemPort = {
    async inspect(request: { paths: string[] }) {
      return request.paths.map((path) => ({
        path,
        kind: "missing" as const,
      }))
    },
    async applyBatch(request: {
      operations: Array<{
        kind: "ensure-directory" | "delete-path"
        path: string
      }>
    }) {
      return {
        completed: request.operations,
      }
    },
  }

  const workflowHandlers = {
    ...createProfileWorkflowHandlers(profileStore),
    ...createSettingsWorkflowHandlers(appSettingsStore),
    ...createConnectionWorkflowHandlers({
      lms: lmsPorts,
      git: gitPorts,
    }),
    ...createValidationWorkflowHandlers(profileStore),
    ...createRosterWorkflowHandlers(profileStore, appSettingsStore, {
      lms: lmsPorts,
      userFile: browserMockHost.userFilePort,
    }),
    ...createGroupSetWorkflowHandlers(profileStore, appSettingsStore, {
      lms: lmsPorts,
      userFile: browserMockHost.userFilePort,
    }),
    ...createGitUsernameWorkflowHandlers(profileStore, appSettingsStore, {
      userFile: browserMockHost.userFilePort,
      git: gitPorts,
    }),
    ...createRepositoryWorkflowHandlers(profileStore, appSettingsStore, {
      git: gitPorts,
      gitCommand: gitCommandPort,
      fileSystem: fileSystemPort,
    }),
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
    seedProfileId,
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
    tier: options.tier,
    preset: options.preset,
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
