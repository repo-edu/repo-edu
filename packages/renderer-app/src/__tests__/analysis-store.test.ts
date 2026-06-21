import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { AnalysisProgress } from "@repo-edu/application-contract"
import {
  type AnalysisResult,
  type BlameResult,
  buildPersonDbIdentityKey,
  type FileStats,
  MAX_ANALYSIS_WORKFLOW_CONCURRENCY,
} from "@repo-edu/domain/analysis"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  buildCohortPrefetchMarker,
  buildDiscoveryCompletionMarker,
  selectCurrentAnalysisResult,
  selectCurrentBlameResult,
} from "../analysis/analysis-query-coordinator.js"
import {
  analysisAutoDiscoveryScopeKey,
  analysisQueryKeys,
  buildAnalysisOutputConfigKey,
  buildAnalysisQueryIdentity,
  buildBlameOutputConfigKey,
  buildBlameQueryIdentity,
  buildRosterOutputContextKey,
} from "../analysis/analysis-query-keys.js"
import { useAnalysisTransientStore } from "../analysis/analysis-transient-store.js"
import {
  buildAuthorColorsByPersonId,
  buildAuthorDisplayByPersonId,
  buildRosterMatchByPersonId,
  filterAuthorStats,
  filterFileStats,
  mergeAuthorStats,
  mergeFileStats,
  selectEffectiveBlameVisibleAuthors,
  selectEffectiveFileSelection,
  selectEffectiveFocusedFile,
} from "../analysis/analysis-view-models.js"
import { buildEffectiveBlameWorkflowConfig } from "../analysis/analysis-workflow-inputs.js"
import {
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import { publishCourseRemoval } from "../session/source-lifecycle-events.js"
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
import { useExaminationStore } from "../stores/examination-store.js"
import { authorColor } from "../utils/author-colors.js"

const repositoryIdentity: SourceIdentity = {
  kind: "repository-analysis",
  repoPath: "/repo",
  commitOid: "a".repeat(40),
  subjectId: "p_1",
  excerptScopeId: "scope-1",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

const submissionIdentity: SourceIdentity = {
  kind: "submission",
  folderPath: "/submission",
  contentScopeId: "submission-scope",
  subjectId: "submission",
  excerptScopeId: "submission-scope",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

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

function makeRosterMember(id: string, name: string, email: string) {
  return {
    id,
    name,
    email,
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown" as const,
    status: "active" as const,
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student" as const,
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "test",
  }
}

function makeBaseResult(): AnalysisResult {
  return {
    authorStats: [
      {
        personId: "p_0000",
        canonicalName: "Alice",
        canonicalEmail: "alice@uni.edu",
        commits: 10,
        insertions: 100,
        deletions: 20,
        lines: 80,
        linesPercent: 60,
        insertionsPercent: 70,
        weightedActivityTimestamp: 1_700_000_090,
        commitShas: new Set(["sha1"]),
      },
      {
        personId: "p_0001",
        canonicalName: "Bob",
        canonicalEmail: "bob@uni.edu",
        commits: 5,
        insertions: 50,
        deletions: 10,
        lines: 40,
        linesPercent: 40,
        insertionsPercent: 30,
        weightedActivityTimestamp: 1_700_000_060,
        commitShas: new Set(["sha2"]),
      },
    ],
    fileStats: [],
    authorDailyActivity: [],
    personDbBaseline: {
      persons: [
        {
          id: "p_0000",
          canonicalName: "Alice",
          canonicalEmail: "alice@uni.edu",
          aliases: [],
          commitCount: 10,
        },
        {
          id: "p_0001",
          canonicalName: "Bob",
          canonicalEmail: "bob@uni.edu",
          aliases: [],
          commitCount: 5,
        },
      ],
      identityIndex: new Map(),
    },
  }
}

function makeFileStatsWithBreakdown(): FileStats[] {
  return [
    {
      path: "src/a.ts",
      bytes: 0,
      commits: 2,
      insertions: 10,
      deletions: 2,
      lines: 0,
      lastModified: 1_700_000_000,
      commitShas: new Set(["sha-a"]),
      authorBreakdown: new Map([
        [
          "p_0000",
          {
            insertions: 7,
            deletions: 1,
            commits: 1,
            lines: 0,
            commitShas: new Set(["sha-a1"]),
          },
        ],
        [
          "p_0001",
          {
            insertions: 3,
            deletions: 1,
            commits: 1,
            lines: 0,
            commitShas: new Set(["sha-a2"]),
          },
        ],
      ]),
    },
  ]
}

function makeBlameResult(): BlameResult {
  return {
    fileBlames: [],
    authorSummaries: [
      {
        personId: "p_0000",
        canonicalName: "Alice",
        canonicalEmail: "alice@uni.edu",
        lines: 60,
        linesPercent: 75,
      },
      {
        personId: "p_0001",
        canonicalName: "Bob",
        canonicalEmail: "bob@uni.edu",
        lines: 20,
        linesPercent: 25,
      },
    ],
    fileSummaries: [
      {
        path: "src/a.ts",
        lines: 80,
        authorLines: new Map([
          ["p_0000", 60],
          ["p_0001", 20],
        ]),
      },
    ],
    personDbOverlay: { persons: [], identityIndex: new Map() },
    delta: { newPersons: [], newAliases: [], relinkedIdentities: [] },
  }
}

function onlyDefinedValues(value: object) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

beforeEach(() => {
  useAnalysisStore.getState().reset()
  useExaminationStore.getState().reset()
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
      makeCourse(),
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
    store.setLastDiscoveryOutcome("course-a", "completed")
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
    assert.equal(
      selectLastDiscoveryOutcomeForScope(state, "course-a"),
      "completed",
    )
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

describe("analysis query keys", () => {
  it("canonicalizes analysis output config identity", () => {
    const key = buildAnalysisOutputConfigKey({
      subfolder: " src\\",
      extensions: [".TS", "ts", " js "],
      includeFiles: ["*"],
      excludeFiles: ["", " **/dist/** "],
      excludeAuthors: [" Bob ", "Alice", "Bob"],
      whitespace: false,
      nFiles: 10,
    })

    assert.deepEqual(onlyDefinedValues(key), {
      subfolder: "src",
      extensions: ["js", "ts"],
      excludeFiles: ["**/dist/**"],
      excludeAuthors: ["Alice", "Bob"],
      nFiles: 10,
    })
  })

  it("canonicalizes blame output config identity", () => {
    const key = buildBlameOutputConfigKey({
      subfolder: " src\\",
      extensions: [".TS", "ts"],
      includeFiles: ["*"],
      excludeEmails: [" student@example.com ", "staff@example.com"],
      whitespace: false,
      copyMove: 1,
    })

    assert.deepEqual(onlyDefinedValues(key), {
      subfolder: "src",
      extensions: ["ts"],
      excludeEmails: ["staff@example.com", "student@example.com"],
    })
  })

  it("preserves roster order in the output context identity", () => {
    const key = buildRosterOutputContextKey({
      members: [
        makeRosterMember("m_002", "Sam Student", "sam.two@example.test"),
        makeRosterMember("m_001", "Sam Student", "sam.one@example.test"),
      ],
    })

    assert.deepEqual(
      key.map((member) => member.id),
      ["m_002", "m_001"],
    )
  })

  it("nests analysis result and blame keys under the repository prefix", () => {
    const source = ["folder", "/courses"] as const
    const repoPath = "/courses/repo-a"
    const analysis = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "abc123",
      config: { includeFiles: ["*"], whitespace: false },
      rosterContext: undefined,
    })
    const blame = buildBlameQueryIdentity({
      source,
      repoPath,
      analysis,
      config: { includeFiles: ["*"], copyMove: 1 },
    })

    assert.deepEqual(
      analysisQueryKeys.result(analysis).slice(0, 5),
      analysisQueryKeys.repo(source, repoPath),
    )
    assert.deepEqual(
      analysisQueryKeys.blame(blame).slice(0, 5),
      analysisQueryKeys.repo(source, repoPath),
    )
    assert.equal("files" in blame, false)
  })

  it("treats same-data discovery refetches as new completions", () => {
    const key = analysisQueryKeys.discovery(
      ["folder", "/courses"],
      "/courses",
      5,
    )

    assert.notEqual(
      buildDiscoveryCompletionMarker(key, 100),
      buildDiscoveryCompletionMarker(key, 101),
    )
  })

  it("keys cohort prefetch by discovery completion and analysis identity", () => {
    const key = analysisQueryKeys.discovery(
      ["course", "course-a"],
      "/courses",
      5,
    )
    const base = buildCohortPrefetchMarker({
      discoveryQueryKey: key,
      dataUpdatedAt: 100,
      analysisConfig: { includeFiles: ["*"], extensions: ["ts"] },
      rosterContext: undefined,
      repoPaths: ["/courses/repo-a"],
    })

    assert.equal(
      base,
      buildCohortPrefetchMarker({
        discoveryQueryKey: key,
        dataUpdatedAt: 100,
        analysisConfig: { includeFiles: ["*"], extensions: ["ts"] },
        rosterContext: undefined,
        repoPaths: ["/courses/repo-a"],
      }),
    )
    assert.notEqual(
      base,
      buildCohortPrefetchMarker({
        discoveryQueryKey: key,
        dataUpdatedAt: 100,
        analysisConfig: { includeFiles: ["*"], extensions: ["py"] },
        rosterContext: undefined,
        repoPaths: ["/courses/repo-a"],
      }),
    )
    assert.notEqual(
      base,
      buildCohortPrefetchMarker({
        discoveryQueryKey: key,
        dataUpdatedAt: 101,
        analysisConfig: { includeFiles: ["*"], extensions: ["ts"] },
        rosterContext: undefined,
        repoPaths: ["/courses/repo-a"],
      }),
    )
  })

  it("scopes auto-discovery markers by source, folder and depth", () => {
    const folder = "/courses/shared"

    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-b"], folder, 5),
    )
    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["folder", folder], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
    )
    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 6),
    )
  })
})

describe("analysis query value projection", () => {
  it("hides previous analysis data while the current query is errored", () => {
    const result = makeBaseResult()

    assert.equal(
      selectCurrentAnalysisResult({
        snapshotCommitOid: "a".repeat(40),
        analysisIsFetching: false,
        analysisIsError: true,
        data: result,
      }),
      null,
    )
  })

  it("hides previous blame data while the current query is errored", () => {
    const blameResult = makeBlameResult()

    assert.equal(
      selectCurrentBlameResult({
        blameIsFetching: false,
        blameIsError: true,
        data: blameResult,
      }),
      null,
    )
  })
})

describe("analysis view models", () => {
  it("passes raw stats through when blameResult is null", () => {
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()

    assert.equal(
      mergeAuthorStats({
        result,
        blameResult: null,
        partialAuthorLines: new Map(),
      }),
      result.authorStats,
    )
    assert.equal(
      mergeFileStats({ result, blameResult: null }),
      result.fileStats,
    )
  })

  it("fills author and file LOC from blame summaries", () => {
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    const blameResult = makeBlameResult()

    const authors = mergeAuthorStats({
      result,
      blameResult,
      partialAuthorLines: new Map(),
    })
    const files = mergeFileStats({ result, blameResult })

    const alice = authors.find((a) => a.personId === "p_0000")
    const bob = authors.find((a) => a.personId === "p_0001")
    assert.equal(alice?.lines, 60)
    assert.equal(alice?.linesPercent, 75)
    assert.equal(bob?.lines, 20)
    assert.equal(bob?.linesPercent, 25)

    const file = files[0]
    assert.equal(file.lines, 80)
    assert.equal(file.authorBreakdown.get("p_0000")?.lines, 60)
    assert.equal(file.authorBreakdown.get("p_0001")?.lines, 20)
  })

  it("does not mutate source file stats while merging blame summaries", () => {
    const result = makeBaseResult()
    const sourceFiles = makeFileStatsWithBreakdown()
    const retainedFile = sourceFiles[0]
    const retainedBreakdown = retainedFile.authorBreakdown
    const retainedEntry = retainedBreakdown.get("p_0000")
    result.fileStats = sourceFiles

    const files = mergeFileStats({ result, blameResult: makeBlameResult() })

    assert.notEqual(files[0], retainedFile)
    assert.notEqual(files[0].authorBreakdown, retainedBreakdown)
    assert.notEqual(files[0].authorBreakdown.get("p_0000"), retainedEntry)
    assert.equal(retainedFile.lines, 0)
    assert.equal(retainedBreakdown.get("p_0000")?.lines, 0)
  })

  it("sums author lines across alias entries sharing one personId", () => {
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    const blameResult = {
      ...makeBlameResult(),
      authorSummaries: [
        {
          personId: "p_0000",
          canonicalName: "Alice",
          canonicalEmail: "alice@uni.edu",
          lines: 40,
          linesPercent: 50,
        },
        {
          personId: "p_0000",
          canonicalName: "Alice Smith",
          canonicalEmail: "alice@work.edu",
          lines: 20,
          linesPercent: 25,
        },
        {
          personId: "p_0001",
          canonicalName: "Bob",
          canonicalEmail: "bob@uni.edu",
          lines: 20,
          linesPercent: 25,
        },
      ],
    }

    const authors = mergeAuthorStats({
      result,
      blameResult,
      partialAuthorLines: new Map(),
    })
    const alice = authors.find((a) => a.personId === "p_0000")
    const bob = authors.find((a) => a.personId === "p_0001")
    assert.equal(alice?.lines, 60)
    assert.equal(bob?.lines, 20)
    assert.equal(alice?.linesPercent, 75)
  })

  it("keeps blame-only authors in merged author and file LOC views", () => {
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    const blameResult = {
      ...makeBlameResult(),
      authorSummaries: [
        {
          personId: "p_0000",
          canonicalName: "Alice",
          canonicalEmail: "alice@uni.edu",
          lines: 60,
          linesPercent: 60,
        },
        {
          personId: "p_0001",
          canonicalName: "Bob",
          canonicalEmail: "bob@uni.edu",
          lines: 20,
          linesPercent: 20,
        },
        {
          personId: "p_0002",
          canonicalName: "Carol",
          canonicalEmail: "carol@uni.edu",
          lines: 20,
          linesPercent: 20,
        },
      ],
      fileSummaries: [
        {
          path: "src/a.ts",
          lines: 100,
          authorLines: new Map([
            ["p_0000", 60],
            ["p_0001", 20],
            ["p_0002", 20],
          ]),
        },
      ],
      fileBlames: [
        {
          path: "src/a.ts",
          lines: [
            {
              sha: "sha-carol",
              authorName: "Carol",
              authorEmail: "carol@uni.edu",
              timestamp: 1_700_000_030,
              lineNumber: 3,
              content: "export const carol = true",
              message: "Carol line",
            },
          ],
        },
      ],
      personDbOverlay: {
        persons: [
          {
            id: "p_0002",
            canonicalName: "Carol",
            canonicalEmail: "carol@uni.edu",
            aliases: [],
            commitCount: 0,
          },
        ],
        identityIndex: new Map([
          [buildPersonDbIdentityKey("Carol", "carol@uni.edu"), "p_0002"],
        ]),
      },
    }

    const authors = mergeAuthorStats({
      result,
      blameResult,
      partialAuthorLines: new Map(),
    })
    const files = mergeFileStats({ result, blameResult })
    const carol = authors.find((author) => author.personId === "p_0002")
    const carolFileBreakdown = files[0].authorBreakdown.get("p_0002")

    assert.deepEqual(
      authors.map((author) => author.personId),
      ["p_0000", "p_0001", "p_0002"],
    )
    assert.equal(carol?.canonicalName, "Carol")
    assert.equal(carol?.commits, 0)
    assert.equal(carol?.lines, 20)
    assert.equal(carol?.linesPercent, 20)
    assert.equal(carol?.weightedActivityTimestamp, 1_700_000_030)
    assert.equal(carolFileBreakdown?.commits, 0)
    assert.equal(carolFileBreakdown?.lines, 20)
  })

  it("projects empty surviving author and file selections back to all", () => {
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()

    assert.deepEqual(
      filterAuthorStats(result.authorStats, new Set(["missing"])).map(
        (author) => author.personId,
      ),
      ["p_0000", "p_0001"],
    )
    assert.deepEqual(
      filterFileStats({
        merged: result.fileStats,
        fileSelectionMode: "subset",
        selectedFiles: new Set(["missing"]),
      }).map((file) => file.path),
      ["src/a.ts"],
    )
    assert.deepEqual(
      [
        ...selectEffectiveFileSelection({
          fileSelectionMode: "subset",
          selectedFiles: new Set(["missing"]),
          filePaths: result.fileStats.map((file) => file.path),
        }),
      ],
      ["src/a.ts"],
    )
  })

  it("projects stale blame visible authors back to all visible authors", () => {
    assert.equal(
      selectEffectiveBlameVisibleAuthors({
        storedVisibleAuthors: new Set(["missing"]),
        visibleAuthorIds: ["p_0000", "p_0001"],
      }),
      null,
    )
    assert.deepEqual(
      [
        ...(selectEffectiveBlameVisibleAuthors({
          storedVisibleAuthors: new Set(["p_0000", "missing"]),
          visibleAuthorIds: ["p_0000", "p_0001"],
        }) ?? []),
      ],
      ["p_0000"],
    )
  })

  it("projects active focus only when the file survives", () => {
    assert.equal(
      selectEffectiveFocusedFile({
        storedPath: "src/a.ts",
        filePaths: ["src/a.ts", "src/b.ts"],
      }),
      "src/a.ts",
    )
    assert.equal(
      selectEffectiveFocusedFile({
        storedPath: "deleted.ts",
        filePaths: ["src/a.ts"],
      }),
      "src/a.ts",
    )
  })

  it("indexes roster matches by personId", () => {
    const result = makeBaseResult()
    result.rosterMatches = {
      matches: [
        {
          personId: "p_0000",
          canonicalName: "Alice",
          canonicalEmail: "alice@uni.edu",
          memberId: "m_001",
          memberName: "Alice Smith",
          confidence: "exact-email",
        },
      ],
      unmatchedPersonIds: ["p_0001"],
      unmatchedMemberIds: [],
    }

    const map = buildRosterMatchByPersonId(result)
    assert.equal(map.size, 1)
    assert.equal(map.get("p_0000")?.memberName, "Alice Smith")
    assert.equal(map.has("p_0001"), false)
  })

  it("assigns author colors by merged LOC ranking", () => {
    const result = makeBaseResult()
    const colors = buildAuthorColorsByPersonId(result.authorStats)
    assert.equal(colors.get("p_0000"), authorColor(0))
    assert.equal(colors.get("p_0001"), authorColor(1))
  })

  it("builds author display identities with rename aliases", () => {
    const result = makeBaseResult()
    result.personDbBaseline.persons[0] = {
      ...result.personDbBaseline.persons[0],
      aliases: [
        {
          name: "Alice Smith",
          email: "alice.smith@uni.edu",
          evidence: "email-link",
        },
      ],
    }

    const display = buildAuthorDisplayByPersonId({
      result,
      showRenames: true,
    })
    assert.equal(display.get("p_0000")?.name, "Alice | Alice Smith")
    assert.equal(
      display.get("p_0000")?.email,
      "alice@uni.edu | alice.smith@uni.edu",
    )
  })
})

describe("course removal lifecycle", () => {
  it("removes examination sessions scoped to the deleted course", () => {
    const store = useExaminationStore.getState()
    const courseAKey = { kind: "course" as const, courseId: "course-a" }
    const courseBKey = { kind: "course" as const, courseId: "course-b" }
    const submissionAKey = {
      kind: "submission" as const,
      path: "/submission-a",
      courseId: "course-a",
    }
    const repositoryASessionKey = buildSourceSessionKey(
      repositoryIdentity,
      courseAKey,
    )
    const repositoryBSessionKey = buildSourceSessionKey(
      repositoryIdentity,
      courseBKey,
    )
    const submissionASessionKey = buildSourceSessionKey(
      submissionIdentity,
      submissionAKey,
    )

    for (const [sourceSessionKey, sourceIdentity] of [
      [repositoryASessionKey, repositoryIdentity],
      [repositoryBSessionKey, repositoryIdentity],
      [submissionASessionKey, submissionIdentity],
    ] as const) {
      store.activateSource({
        sourceSummaryKey: `${sourceSessionKey}-summary`,
        sourceSessionKey,
        sourceIdentity,
        subjectIds: ["p_1"],
        selectedSubjectId: "p_1",
        defaultPreferences: {
          questionCount: 4,
          activeConnectionId: "llm-1",
          modelCode: "22",
          effort: "medium",
        },
      })
    }

    publishCourseRemoval("course-a")

    const state = useExaminationStore.getState()
    assert.equal(state.sourceSessions.has(repositoryASessionKey), false)
    assert.equal(state.sourceSessions.has(submissionASessionKey), false)
    assert.equal(state.sourceSessions.has(repositoryBSessionKey), true)
  })
})
