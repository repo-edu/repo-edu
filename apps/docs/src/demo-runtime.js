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
import { createWorkflowClient } from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  ORIGIN_LMS,
  persistedProfileKind,
} from "@repo-edu/domain"
import { createBrowserMockHostEnvironment } from "@repo-edu/host-browser-mock"
import React from "react"
import { createRoot as createReactRoot } from "react-dom/client"

const seedProfileId = "docs-profile"
const seedCourseId = "course-seed"
function resolveMountNode(queryMountNode) {
  if (queryMountNode) {
    return queryMountNode()
  }
  if (typeof document === "undefined") {
    return null
  }
  return document.querySelector("#app")
}
export function createDocsDemoRuntime() {
  const browserMockHost = createBrowserMockHostEnvironment()
  const now = new Date().toISOString()
  const seedProfile = {
    kind: persistedProfileKind,
    schemaVersion: 2,
    id: seedProfileId,
    displayName: "Docs Demo Profile",
    lmsConnectionName: "Canvas Demo",
    gitConnectionName: "GitHub Demo",
    courseId: seedCourseId,
    roster: {
      connection: null,
      students: [
        {
          id: "s-ada",
          name: "Ada Lovelace",
          email: "ada@example.edu",
          studentNumber: "1001",
          gitUsername: "ada",
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: "active",
          lmsUserId: "s-ada",
          enrollmentType: "student",
          enrollmentDisplay: "Student",
          department: null,
          institution: null,
          source: "seed",
        },
        {
          id: "s-grace",
          name: "Grace Hopper",
          email: "grace@example.edu",
          studentNumber: "1002",
          gitUsername: "grace",
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: "active",
          lmsUserId: "s-grace",
          enrollmentType: "student",
          enrollmentDisplay: "Student",
          department: null,
          institution: null,
          source: "seed",
        },
      ],
      staff: [],
      groups: [
        {
          id: "g-team-1",
          name: "team-1",
          memberIds: ["s-ada", "s-grace"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs-local-1",
          name: "Project Teams",
          groupIds: ["g-team-1"],
          connection: null,
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
        },
      ],
      assignments: [
        {
          id: "a-project-1",
          name: "project-1",
          groupSetId: "gs-local-1",
        },
      ],
    },
    repositoryTemplate: {
      owner: "demo-org",
      name: "starter-template",
      visibility: "private",
    },
    updatedAt: now,
  }
  const seedSettings = {
    ...defaultAppSettings,
    activeProfileId: seedProfileId,
    lmsConnections: [
      {
        name: "Canvas Demo",
        provider: "canvas",
        baseUrl: "https://canvas.example.edu",
        token: "demo-token",
      },
    ],
    gitConnections: [
      {
        name: "GitHub Demo",
        provider: "github",
        baseUrl: null,
        token: "demo-token",
        organization: "demo-org",
      },
    ],
    lastOpenedAt: now,
  }
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
          kind: "canvas",
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
          groupCount: 1,
        },
      ]
    },
    async fetchGroupSet(_draft, courseId, groupSetId) {
      return {
        groupSet: {
          id: groupSetId,
          name: "LMS Teams",
          groupIds: ["lms-group-1"],
          connection: {
            kind: "canvas",
            courseId,
            groupSetId,
            lastUpdated: new Date().toISOString(),
          },
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
        },
        groups: [
          {
            id: "lms-group-1",
            name: "lms-team-1",
            memberIds: ["s-ada", "s-grace"],
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
    async verifyGitUsernames(_draft, usernames) {
      return usernames.map((username) => ({
        username,
        exists: !username.toLowerCase().includes("invalid"),
      }))
    },
    async createRepositories(_draft, request) {
      return {
        createdCount: request.repositoryNames.length,
        repositoryUrls: request.repositoryNames.map(
          (name) => `https://github.com/${request.organization}/${name}`,
        ),
      }
    },
    async resolveRepositoryCloneUrls(_draft, request) {
      return {
        resolved: request.repositoryNames.map((repositoryName) => ({
          repositoryName,
          cloneUrl: `https://github.com/${request.organization}/${repositoryName}.git`,
        })),
        missing: [],
      }
    },
    async deleteRepositories(_draft, request) {
      return {
        deletedCount: request.repositoryNames.length,
        missing: [],
      }
    },
  }
  const gitCommandPort = {
    cancellation: "best-effort",
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
    async inspect(request) {
      return request.paths.map((path) => ({
        path,
        kind: "missing",
      }))
    },
    async applyBatch(request) {
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
    "userFile.inspectSelection": (input, options) =>
      runInspectUserFileWorkflow(browserMockHost.userFilePort, input, options),
    "userFile.exportPreview": (input, options) =>
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
  }
}
export function mountDocsDemoApp(options = {}) {
  const mountNode = resolveMountNode(options.queryMountNode)
  if (mountNode === null || mountNode === undefined) {
    throw new Error("Docs app mount node #app was not found")
  }
  const runtime = createDocsDemoRuntime()
  const appRootComponent = options.appRootComponent
  if (!appRootComponent) {
    throw new Error("Docs app root component was not provided.")
  }
  const createRoot = options.createRoot ?? ((node) => createReactRoot(node))
  createRoot(mountNode).render(
    React.createElement(appRootComponent, {
      workflowClient: runtime.workflowClient,
      rendererHost: runtime.rendererHost,
    }),
  )
  return runtime
}
