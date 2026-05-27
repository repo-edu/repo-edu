import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  type AppError,
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { activateActiveSurface } from "../hooks/use-active-surface-navigation.js"
import {
  clearPersisterRegistry,
  type PersisterRegistry,
  setPersisterRegistry,
} from "../persistence/persister-registry.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"

function makeCourse(): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id: "course-1",
    displayName: "Course 1",
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-03-11T00:00:00.000Z",
  }
}

function installPersisterRegistry(overrides: {
  courseFlush?: () => Promise<void>
  settingsFlush?: () => Promise<void>
}) {
  const persister = {
    flush: async () => {},
    waitForIdle: async () => {},
    adoptCurrentSnapshot: () => {},
    dispose: () => {},
  }
  setPersisterRegistry({
    appSettings: {
      ...persister,
      flush: overrides.settingsFlush ?? persister.flush,
    },
    course: { ...persister, flush: overrides.courseFlush ?? persister.flush },
    flush: async () => {},
    waitForIdle: async () => {},
    dispose: () => {},
  } satisfies PersisterRegistry)
}

beforeEach(() => {
  clearWorkflowClient()
  clearPersisterRegistry()
  useAnalysisStore.getState().reset()
  useAppSettingsStore.getState().reset()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

describe("active surface navigation", () => {
  it("does not switch surfaces when leaving-course save fails", async () => {
    const course = makeCourse()
    let settingsSaveCalls = 0
    const validationError: AppError = {
      type: "validation",
      message: "save failed",
      issues: [],
    }
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async () => ({
        revision: 1,
        updatedAt: "2026-03-11T00:00:01.000Z",
      }),
      "settings.loadApp": async () => useAppSettingsStore.getState().settings,
      "settings.saveApp": async () => {},
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    installPersisterRegistry({
      courseFlush: async () => {
        throw validationError
      },
      settingsFlush: async () => {
        settingsSaveCalls += 1
      },
    })

    await useCourseStore.getState().load(course.id)
    useUiStore
      .getState()
      .setActiveSurface({ kind: "course", courseId: course.id })
    useUiStore.getState().setActiveTab("groups-assignments")
    useAppSettingsStore
      .getState()
      .setActiveSurface({ kind: "course", courseId: course.id })
    useAppSettingsStore.getState().setActiveTab("groups-assignments")
    useAnalysisStore.setState({
      discoveredRepos: [{ name: "existing", path: "/tmp/existing" }],
    })

    const switched = await activateActiveSurface(
      { kind: "folder", path: "/tmp/repos" },
      { recordRecent: true, preferredTab: "analysis" },
    )

    assert.equal(switched, false)
    assert.deepStrictEqual(useUiStore.getState().activeSurface, {
      kind: "course",
      courseId: course.id,
    })
    assert.equal(useUiStore.getState().activeTab, "groups-assignments")
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.activeSurface,
      { kind: "course", courseId: course.id },
    )
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentAnalysisFolders,
      [],
    )
    assert.deepStrictEqual(useAnalysisStore.getState().discoveredRepos, [
      { name: "existing", path: "/tmp/existing" },
    ])
    assert.equal(settingsSaveCalls, 0)
  })

  it("records submission recents separately from repository folders", async () => {
    const client = createWorkflowClient({
      "settings.loadApp": async () => useAppSettingsStore.getState().settings,
      "settings.saveApp": async () => {},
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    installPersisterRegistry({})

    const switched = await activateActiveSurface(
      {
        kind: "submission",
        path: "/tmp/submissions/ada",
        courseId: "course-1",
      },
      { recordRecent: true, preferredTab: "analysis" },
    )

    assert.equal(switched, true)
    assert.deepStrictEqual(useUiStore.getState().activeSurface, {
      kind: "submission",
      path: "/tmp/submissions/ada",
      courseId: "course-1",
    })
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentAnalysisFolders,
      [],
    )
    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentSubmissionFolders,
      [{ path: "/tmp/submissions/ada", courseId: "course-1" }],
    )
  })
})
