import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { AnalysisProgress } from "@repo-edu/application-contract"
import { MAX_ANALYSIS_WORKFLOW_CONCURRENCY } from "@repo-edu/domain/analysis"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useAnalysisTransientStore } from "../analysis/analysis-transient-store.js"
import { buildEffectiveBlameWorkflowConfig } from "../analysis/analysis-workflow-inputs.js"
import {
  analysisDiscoveryRequestsEqual,
  selectActiveBlameFileForScope,
  selectAutoDiscoveryRequestForScope,
  selectBlameVisibleAuthorsForScope,
  selectEffectiveSelectedRepoPath,
  selectFileSelectionModeForScope,
  selectFocusedFilePathForScope,
  selectLastDiscoveryOutcomeForScope,
  selectPendingRepoDiscoveryRequestForScope,
  selectSelectedAuthorsForScope,
  selectSelectedFilesForScope,
  selectSelectedRepoPathForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"

function makeCourse(
  inputs: PersistedCourse["analysisInputs"],
): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    backing: "lms",
    revision: 0,
    id: "c1",
    displayName: "Course",
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
    analysisInputs: inputs,
    updatedAt: "2026-04-08T00:00:00Z",
  }
}

beforeEach(() => {
  useAnalysisStore.getState().reset()
  useAnalysisTransientStore.setState({
    discoveryRequestId: null,
    discoveryProgress: null,
    analysisByRequestKey: new Map(),
    blameByRequestKey: new Map(),
  })
})

describe("analysis view state", () => {
  it("builds blame workflow config from course inputs and blame fields", () => {
    const store = useAnalysisStore.getState()
    store.setBlameConfig({ copyMove: 3 })

    const course = makeCourse({
      subfolder: "src",
      extensions: ["ts", "tsx"],
      includeFiles: ["*.ts"],
      excludeFiles: ["*.spec.ts"],
      excludeAuthors: ["bot*"],
      excludeEmails: ["noreply@*"],
      whitespace: true,
    })

    const merged = buildEffectiveBlameWorkflowConfig(
      course,
      useAnalysisStore.getState().blameConfig,
      ["py"],
      4,
    )
    assert.equal(merged.subfolder, "src")
    assert.deepEqual(merged.extensions, ["ts", "tsx"])
    assert.deepEqual(merged.includeFiles, ["*.ts"])
    assert.deepEqual(merged.excludeFiles, ["*.spec.ts"])
    assert.deepEqual(merged.excludeAuthors, ["bot*"])
    assert.deepEqual(merged.excludeEmails, ["noreply@*"])
    assert.equal(merged.whitespace, true)
    assert.equal(merged.maxConcurrency, 4)
    assert.equal(merged.copyMove, 3)
  })

  it("caps blame workflow concurrency at the workflow schema limit", () => {
    const merged = buildEffectiveBlameWorkflowConfig(
      makeCourse({}),
      useAnalysisStore.getState().blameConfig,
      ["ts"],
      MAX_ANALYSIS_WORKFLOW_CONCURRENCY * 8,
    )

    assert.equal(merged.maxConcurrency, MAX_ANALYSIS_WORKFLOW_CONCURRENCY)
  })

  it("opens blame by storing only view focus", () => {
    const store = useAnalysisStore.getState()
    store.openFileForBlame("analysis-a", "src/a.ts")

    const state = useAnalysisStore.getState()
    assert.equal(state.activeView, "blame")
    assert.equal(selectActiveBlameFileForScope(state, "analysis-a"), "src/a.ts")
    assert.equal(selectFocusedFilePathForScope(state, "analysis-a"), "src/a.ts")
    assert.equal(selectActiveBlameFileForScope(state, "analysis-b"), null)
  })

  it("hydrates only persisted sidebar settings", () => {
    const store = useAnalysisStore.getState()
    store.setSelectedRepoPath("source-a", "/repo")
    store.hydrateFromPersistedSettings({
      searchDepth: 8,
      sectionState: {},
      repoViewMode: "list",
      fileViewMode: "tree",
      fileSortMode: "alpha",
      blameConfig: { copyMove: 4 },
    })

    const state = useAnalysisStore.getState()
    assert.equal(selectSelectedRepoPathForScope(state, "source-a"), "/repo")
    assert.equal(state.searchDepth, 8)
    assert.equal(state.blameConfig.copyMove, 4)
  })

  it("scopes selected repositories by analysis source", () => {
    const store = useAnalysisStore.getState()
    store.setSelectedRepoPath("course-a", "/repo-a")

    let state = useAnalysisStore.getState()
    assert.equal(selectSelectedRepoPathForScope(state, "course-a"), "/repo-a")
    assert.equal(selectSelectedRepoPathForScope(state, "course-b"), null)

    store.setSelectedRepoPath("course-b", "/repo-b")
    state = useAnalysisStore.getState()
    assert.equal(selectSelectedRepoPathForScope(state, "course-a"), "/repo-a")
    assert.equal(selectSelectedRepoPathForScope(state, "course-b"), "/repo-b")

    store.setSelectedRepoPath("course-b", null)
    state = useAnalysisStore.getState()
    assert.equal(selectSelectedRepoPathForScope(state, "course-a"), "/repo-a")
    assert.equal(selectSelectedRepoPathForScope(state, "course-b"), null)
  })

  it("scopes discovery request state by analysis source", () => {
    const store = useAnalysisStore.getState()
    const courseARequest = { folder: "/courses/a", depth: 5 }
    const courseBRequest = { folder: "/courses/b", depth: 6 }

    store.setPendingRepoDiscoveryRequest("course-a", courseARequest)
    store.setLastDiscoveryOutcome("course-a", "none")
    store.markAutoDiscoveryRequest("course-a", courseARequest)
    store.setPendingRepoDiscoveryRequest("course-b", courseBRequest)
    store.setLastDiscoveryOutcome("course-b", "cancelled")

    let state = useAnalysisStore.getState()
    assert.deepEqual(
      selectPendingRepoDiscoveryRequestForScope(state, "course-a"),
      courseARequest,
    )
    assert.deepEqual(
      selectPendingRepoDiscoveryRequestForScope(state, "course-b"),
      courseBRequest,
    )
    assert.equal(selectLastDiscoveryOutcomeForScope(state, "course-a"), "none")
    assert.equal(
      selectLastDiscoveryOutcomeForScope(state, "course-b"),
      "cancelled",
    )
    assert.equal(selectLastDiscoveryOutcomeForScope(state, "course-c"), "none")
    assert.deepEqual(
      selectAutoDiscoveryRequestForScope(state, "course-a"),
      courseARequest,
    )
    assert.equal(selectAutoDiscoveryRequestForScope(state, "course-b"), null)
    assert.equal(
      analysisDiscoveryRequestsEqual(
        selectAutoDiscoveryRequestForScope(state, "course-a"),
        { folder: "/courses/a", depth: 6 },
      ),
      false,
    )

    store.setPendingRepoDiscoveryRequest("course-a", null)
    store.setLastDiscoveryOutcome("course-a", "none")

    state = useAnalysisStore.getState()
    assert.equal(
      selectPendingRepoDiscoveryRequestForScope(state, "course-a"),
      null,
    )
    assert.equal(selectLastDiscoveryOutcomeForScope(state, "course-a"), "none")
  })

  it("projects effective selected repository from discovery data", () => {
    const repos = [{ path: "/repo-a" }, { path: "/repo-b" }]

    assert.equal(
      selectEffectiveSelectedRepoPath({
        storedRepoPath: "/repo-b",
        discoveredRepos: repos,
      }),
      "/repo-b",
    )
    assert.equal(
      selectEffectiveSelectedRepoPath({
        storedRepoPath: "/repo-c",
        discoveredRepos: repos,
      }),
      "/repo-a",
    )
    assert.equal(
      selectEffectiveSelectedRepoPath({
        storedRepoPath: null,
        discoveredRepos: [],
      }),
      null,
    )
  })

  it("scopes result-local filters and focus by analysis identity", () => {
    const store = useAnalysisStore.getState()
    store.setSelectedAuthors("analysis-a", new Set(["p_0000"]))
    store.setSelectedFiles("analysis-a", new Set(["src/main.ts"]))
    store.openFileForBlame("analysis-a", "src/main.ts")
    store.toggleBlameAuthorVisible("analysis-a", "p_0001", ["p_0000", "p_0001"])

    let state = useAnalysisStore.getState()
    assert.deepEqual(
      [...selectSelectedAuthorsForScope(state, "analysis-a")],
      ["p_0000"],
    )
    assert.deepEqual(
      [...selectSelectedAuthorsForScope(state, "analysis-b")],
      [],
    )
    assert.equal(selectFileSelectionModeForScope(state, "analysis-a"), "subset")
    assert.equal(selectFileSelectionModeForScope(state, "analysis-b"), "all")
    assert.deepEqual(
      [...selectSelectedFilesForScope(state, "analysis-a")],
      ["src/main.ts"],
    )
    assert.deepEqual([...selectSelectedFilesForScope(state, "analysis-b")], [])
    assert.equal(
      selectFocusedFilePathForScope(state, "analysis-a"),
      "src/main.ts",
    )
    assert.equal(selectFocusedFilePathForScope(state, "analysis-b"), null)
    assert.deepEqual(
      [...(selectBlameVisibleAuthorsForScope(state, "analysis-a") ?? [])],
      ["p_0000"],
    )
    assert.equal(selectBlameVisibleAuthorsForScope(state, "analysis-b"), null)

    store.setSelectedAuthors("analysis-b", new Set(["p_0002"]))
    store.setSelectedFiles("analysis-b", new Set(["src/other.ts"]))
    store.openFileForBlame("analysis-b", "src/other.ts")
    store.toggleBlameAuthorVisible("analysis-b", "p_0003", ["p_0002", "p_0003"])

    state = useAnalysisStore.getState()
    assert.deepEqual(
      [...selectSelectedAuthorsForScope(state, "analysis-a")],
      ["p_0000"],
    )
    assert.deepEqual(
      [...selectSelectedAuthorsForScope(state, "analysis-b")],
      ["p_0002"],
    )
    assert.deepEqual(
      [...selectSelectedFilesForScope(state, "analysis-a")],
      ["src/main.ts"],
    )
    assert.deepEqual(
      [...selectSelectedFilesForScope(state, "analysis-b")],
      ["src/other.ts"],
    )
    assert.equal(
      selectFocusedFilePathForScope(state, "analysis-a"),
      "src/main.ts",
    )
    assert.equal(
      selectFocusedFilePathForScope(state, "analysis-b"),
      "src/other.ts",
    )
    assert.deepEqual(
      [...(selectBlameVisibleAuthorsForScope(state, "analysis-a") ?? [])],
      ["p_0000"],
    )
    assert.deepEqual(
      [...(selectBlameVisibleAuthorsForScope(state, "analysis-b") ?? [])],
      ["p_0002"],
    )
  })

  it("scopes transient analysis progress by result identity key", () => {
    const store = useAnalysisTransientStore.getState()
    const progress: AnalysisProgress = {
      phase: "log",
      label: "Collecting commits",
      processedFiles: 1,
      totalFiles: 2,
    }

    store.startAnalysis("analysis-a", "request-a")
    store.startAnalysis("analysis-b", "request-b")
    store.setAnalysisProgress("analysis-a", "request-a", progress)
    store.setAnalysisProgress("analysis-b", "request-a", {
      ...progress,
      label: "Wrong request",
    })

    const state = useAnalysisTransientStore.getState()
    assert.equal(
      state.analysisByRequestKey.get("analysis-a")?.progress?.label,
      "Collecting commits",
    )
    assert.equal(state.analysisByRequestKey.get("analysis-b")?.progress, null)
  })

  it("scopes transient blame partial LOC by blame identity key", () => {
    const store = useAnalysisTransientStore.getState()

    store.startBlame("blame-a", "request-a")
    store.startBlame("blame-b", "request-b")
    store.setBlamePartialAuthorLines(
      "blame-a",
      "request-a",
      new Map([["p_0001", 4]]),
    )
    store.setBlamePartialAuthorLines(
      "blame-b",
      "request-a",
      new Map([["p_0002", 9]]),
    )

    const state = useAnalysisTransientStore.getState()
    assert.equal(
      state.blameByRequestKey.get("blame-a")?.partialAuthorLines.get("p_0001"),
      4,
    )
    assert.equal(
      state.blameByRequestKey.get("blame-b")?.partialAuthorLines.size,
      0,
    )
  })
})
