import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type {
  AnalysisResult,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  analysisStoreInternals,
  buildEffectiveBlameWorkflowConfig,
  selectAuthorColorsByPersonId,
  selectAuthorDisplayByPersonId,
  selectBlameMergedAuthorStats,
  selectBlameMergedFileStats,
  selectFilteredAuthorStats,
  selectFilteredFileStats,
  selectRosterMatchByPersonId,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import { authorColor } from "../utils/author-colors.js"

function makeCourse(
  inputs: PersistedCourse["analysisInputs"],
): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    courseKind: "lms",
    revision: 0,
    id: "c1",
    displayName: "Course",
    lmsConnectionName: null,
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
  analysisStoreInternals.analysisAborts.clear()
  analysisStoreInternals.discoveryAbort = null
})

describe("analysis store", () => {
  it("builds blame workflow config from course inputs + blame-specific fields", () => {
    const store = useAnalysisStore.getState()
    store.setBlameConfig({
      copyMove: 3,
    })

    const course = makeCourse({
      subfolder: "src",
      extensions: ["ts", "tsx"],
      includeFiles: ["*.ts"],
      excludeFiles: ["*.spec.ts"],
      excludeAuthors: ["bot*"],
      excludeEmails: ["noreply@*"],
      whitespace: true,
    })

    const state = useAnalysisStore.getState()
    const merged = buildEffectiveBlameWorkflowConfig(
      course,
      state.blameConfig,
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

  it("sources blame extensions from the app default when the course leaves it unset", () => {
    const store = useAnalysisStore.getState()
    const course = makeCourse({})
    const merged = buildEffectiveBlameWorkflowConfig(
      course,
      store.blameConfig,
      ["py", "rb"],
      1,
    )
    assert.deepEqual(merged.extensions, ["py", "rb"])
  })

  it("sources blame extensions from the course when it is set", () => {
    const store = useAnalysisStore.getState()
    const course = makeCourse({ extensions: ["java"] })
    const merged = buildEffectiveBlameWorkflowConfig(
      course,
      store.blameConfig,
      ["py"],
      1,
    )
    assert.deepEqual(merged.extensions, ["java"])
  })

  it("seeds blame queue from result and focuses active file on click", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = [
      {
        path: "src/a.ts",
        bytes: 0,
        commits: 1,
        insertions: 10,
        deletions: 2,
        lines: 8,
        lastModified: 1_700_000_000,
        commitShas: new Set(["sha-a"]),
        authorBreakdown: new Map(),
      },
      {
        path: "src/b.ts",
        bytes: 0,
        commits: 1,
        insertions: 12,
        deletions: 3,
        lines: 9,
        lastModified: 1_700_000_100,
        commitShas: new Set(["sha-b"]),
        authorBreakdown: new Map(),
      },
    ]
    store.setResult(result)

    let state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, ["src/a.ts", "src/b.ts"])
    assert.equal(state.activeBlameFile, null)

    store.openFileForBlame("src/a.ts")
    store.setBlameFileResult("src/a.ts", {
      status: "loaded",
      fileBlame: { path: "src/a.ts", lines: [] },
      errorMessage: null,
    })
    store.openFileForBlame("src/b.ts")
    store.setBlameFileResult("src/b.ts", {
      status: "loaded",
      fileBlame: { path: "src/b.ts", lines: [] },
      errorMessage: null,
    })

    state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, ["src/a.ts", "src/b.ts"])
    assert.equal(state.activeBlameFile, "src/b.ts")
    assert.equal(state.blameFileResults.has("src/a.ts"), true)
    assert.equal(state.blameFileResults.has("src/b.ts"), true)
  })

  it("resetAnalysisContext clears runtime state while preserving display toggles", () => {
    const store = useAnalysisStore.getState()
    store.setSelectedRepoPath("/repo")
    store.openFileForBlame("src/a.ts")
    store.setBlameShowMetadata(false)
    store.setBlameColorize(false)

    store.resetAnalysisContext()

    const state = useAnalysisStore.getState()
    assert.equal(state.selectedRepoPath, null)
    assert.equal(state.activeBlameFile, null)
    assert.equal(state.focusedFilePath, null)
    assert.equal(state.blameShowMetadata, false)
    assert.equal(state.blameColorize, false)
  })

  it("cancelAll aborts every active run without dropping handles eagerly", () => {
    const acA = new AbortController()
    const acB = new AbortController()
    analysisStoreInternals.analysisAborts.set("/repo-a", acA)
    analysisStoreInternals.analysisAborts.set("/repo-b", acB)

    analysisStoreInternals.cancelAll()

    assert.equal(acA.signal.aborted, true)
    assert.equal(acB.signal.aborted, true)
    assert.equal(analysisStoreInternals.analysisAborts.get("/repo-a"), acA)
    assert.equal(analysisStoreInternals.analysisAborts.get("/repo-b"), acB)
  })

  it("tracks file filtering mode separately from selected file paths", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = [
      {
        path: "src/a.ts",
        bytes: 0,
        commits: 1,
        insertions: 10,
        deletions: 2,
        lines: 8,
        lastModified: 1_700_000_000,
        commitShas: new Set(["sha-a"]),
        authorBreakdown: new Map(),
      },
      {
        path: "src/b.ts",
        bytes: 0,
        commits: 1,
        insertions: 12,
        deletions: 3,
        lines: 9,
        lastModified: 1_700_000_100,
        commitShas: new Set(["sha-b"]),
        authorBreakdown: new Map(),
      },
    ]

    store.setResult(result)
    let state = useAnalysisStore.getState()
    assert.equal(state.fileSelectionMode, "all")
    assert.deepEqual(
      selectFilteredFileStats(state).map((f) => f.path),
      ["src/a.ts", "src/b.ts"],
    )

    store.setSelectedFiles(new Set(["src/a.ts"]))
    state = useAnalysisStore.getState()
    assert.equal(state.fileSelectionMode, "subset")
    assert.deepEqual(
      selectFilteredFileStats(state).map((f) => f.path),
      ["src/a.ts"],
    )

    store.setSelectedFiles(new Set())
    state = useAnalysisStore.getState()
    assert.equal(state.fileSelectionMode, "subset")
    assert.deepEqual(
      selectFilteredFileStats(state).map((f) => f.path),
      [],
    )

    store.clearFileSelection()
    state = useAnalysisStore.getState()
    assert.equal(state.fileSelectionMode, "all")
    assert.deepEqual(
      selectFilteredFileStats(state).map((f) => f.path),
      ["src/a.ts", "src/b.ts"],
    )
  })

  it("preserves selected repo when fingerprint pruning removes the active entry", () => {
    // The user's selection persists across config changes so an auto-rerun
    // (kicked off by sidebar config edits) can mirror its result back into the
    // flat fields via setResultForRepo. Per-repo workflow state for the
    // in-flight run is left intact for the same reason.
    const store = useAnalysisStore.getState()
    const repoPath = "/tmp/repo-a"
    store.setSelectedRepoPath(repoPath)
    store.setResultForRepo(repoPath, makeBaseResult(), "fingerprint-old")
    store.setWorkflowStatusForRepo(repoPath, "running")
    store.setProgressForRepo(repoPath, {
      phase: "log",
      label: "Collecting",
      processedFiles: 1,
      totalFiles: 2,
    })

    store.pruneStaleResultsByFingerprint("fingerprint-new")

    const state = useAnalysisStore.getState()
    assert.equal(state.selectedRepoPath, repoPath)
    assert.equal(state.repoStates.has(repoPath), false)
    assert.equal(state.repoWorkflowStatus.get(repoPath), "running")
    assert.equal(state.repoProgress.get(repoPath)?.phase, "log")
    assert.equal(state.result, null)
    assert.equal(state.blameResult, null)
  })
})

// ---------------------------------------------------------------------------
// Roster match selector
// ---------------------------------------------------------------------------

function makeBaseResult(): AnalysisResult {
  return {
    resolvedAsOfOid: "abc123",
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
        age: 90,
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
        age: 60,
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

describe("blame-merged selectors", () => {
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

  it("passes raw stats through when blameResult is null", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    store.setResult(result)

    const state = useAnalysisStore.getState()
    const authors = selectBlameMergedAuthorStats(state)
    const files = selectBlameMergedFileStats(state)

    assert.equal(authors, result.authorStats)
    assert.equal(files, result.fileStats)
  })

  it("fills author and file LOC from blame summaries", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    store.setResult(result)
    store.setBlameResult(makeBlameResult())

    const state = useAnalysisStore.getState()
    const authors = selectBlameMergedAuthorStats(state)
    const files = selectBlameMergedFileStats(state)

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

  it("does not mutate source FileStats or its authorBreakdown map", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    const sourceFiles = makeFileStatsWithBreakdown()
    const retainedFile = sourceFiles[0]
    const retainedBreakdown = retainedFile.authorBreakdown
    const retainedEntry = retainedBreakdown.get("p_0000")
    result.fileStats = sourceFiles
    store.setResult(result)
    store.setBlameResult(makeBlameResult())

    const files = selectBlameMergedFileStats(useAnalysisStore.getState())
    assert.notEqual(files[0], retainedFile)
    assert.notEqual(files[0].authorBreakdown, retainedBreakdown)
    assert.notEqual(files[0].authorBreakdown.get("p_0000"), retainedEntry)
    assert.equal(retainedFile.lines, 0)
    assert.equal(retainedBreakdown.get("p_0000")?.lines, 0)
  })

  it("sums author lines across alias entries sharing one personId", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    store.setResult(result)
    store.setBlameResult({
      fileBlames: [],
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
      fileSummaries: [],
      personDbOverlay: { persons: [], identityIndex: new Map() },
      delta: { newPersons: [], newAliases: [], relinkedIdentities: [] },
    })

    const authors = selectBlameMergedAuthorStats(useAnalysisStore.getState())
    const alice = authors.find((a) => a.personId === "p_0000")
    const bob = authors.find((a) => a.personId === "p_0001")
    assert.equal(alice?.lines, 60)
    assert.equal(bob?.lines, 20)
    assert.equal(alice?.linesPercent, 75)
  })

  it("memoizes on (result, blameResult) and invalidates when blame changes", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = makeFileStatsWithBreakdown()
    store.setResult(result)
    store.setBlameResult(makeBlameResult())

    const first = selectBlameMergedFileStats(useAnalysisStore.getState())
    const firstAuthors = selectBlameMergedAuthorStats(
      useAnalysisStore.getState(),
    )
    const second = selectBlameMergedFileStats(useAnalysisStore.getState())
    const secondAuthors = selectBlameMergedAuthorStats(
      useAnalysisStore.getState(),
    )
    assert.equal(first, second)
    assert.equal(firstAuthors, secondAuthors)

    store.setBlameResult(makeBlameResult())
    const third = selectBlameMergedFileStats(useAnalysisStore.getState())
    const thirdAuthors = selectBlameMergedAuthorStats(
      useAnalysisStore.getState(),
    )
    assert.notEqual(first, third)
    assert.notEqual(firstAuthors, thirdAuthors)
  })
})

describe("selectRosterMatchByPersonId", () => {
  it("returns empty map when no result", () => {
    const map = selectRosterMatchByPersonId(useAnalysisStore.getState())
    assert.equal(map.size, 0)
  })

  it("returns empty map when result has no rosterMatches", () => {
    useAnalysisStore.getState().setResult(makeBaseResult())
    const map = selectRosterMatchByPersonId(useAnalysisStore.getState())
    assert.equal(map.size, 0)
  })

  it("indexes matches by personId", () => {
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
        {
          personId: "p_0001",
          canonicalName: "Bob",
          canonicalEmail: "bob@uni.edu",
          memberId: "m_002",
          memberName: "Robert Jones",
          confidence: "fuzzy-name",
        },
      ],
      unmatchedPersonIds: [],
      unmatchedMemberIds: [],
    }
    useAnalysisStore.getState().setResult(result)

    const map = selectRosterMatchByPersonId(useAnalysisStore.getState())
    assert.equal(map.size, 2)

    const alice = map.get("p_0000")
    assert.equal(alice?.memberName, "Alice Smith")
    assert.equal(alice?.confidence, "exact-email")

    const bob = map.get("p_0001")
    assert.equal(bob?.memberName, "Robert Jones")
    assert.equal(bob?.confidence, "fuzzy-name")
  })

  it("omits unmatched persons from the map", () => {
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
    useAnalysisStore.getState().setResult(result)

    const map = selectRosterMatchByPersonId(useAnalysisStore.getState())
    assert.equal(map.size, 1)
    assert.equal(map.has("p_0000"), true)
    assert.equal(map.has("p_0001"), false)
  })
})

describe("analysis selectors", () => {
  it("assigns author colors by merged LOC ranking", () => {
    const result = makeBaseResult()
    useAnalysisStore.getState().setResult(result)

    let colors = selectAuthorColorsByPersonId(useAnalysisStore.getState())
    assert.equal(colors.get("p_0000"), authorColor(0))
    assert.equal(colors.get("p_0001"), authorColor(1))

    useAnalysisStore.getState().setBlameResult({
      fileBlames: [],
      authorSummaries: [
        {
          personId: "p_0000",
          canonicalName: "Alice",
          canonicalEmail: "alice@uni.edu",
          lines: 25,
          linesPercent: 20,
        },
        {
          personId: "p_0001",
          canonicalName: "Bob",
          canonicalEmail: "bob@uni.edu",
          lines: 100,
          linesPercent: 80,
        },
      ],
      fileSummaries: [],
      personDbOverlay: { persons: [], identityIndex: new Map() },
      delta: { newPersons: [], newAliases: [], relinkedIdentities: [] },
    })

    colors = selectAuthorColorsByPersonId(useAnalysisStore.getState())
    assert.equal(colors.get("p_0001"), authorColor(0))
    assert.equal(colors.get("p_0000"), authorColor(1))
  })

  it("keeps author color ranking based on unfiltered authors", () => {
    const result = makeBaseResult()
    useAnalysisStore.getState().setResult(result)
    useAnalysisStore.getState().setSelectedAuthors(new Set(["p_0001"]))

    const colors = selectAuthorColorsByPersonId(useAnalysisStore.getState())
    assert.equal(colors.get("p_0000"), authorColor(0))
    assert.equal(colors.get("p_0001"), authorColor(1))
  })

  it("returns stable references for unchanged empty snapshots", () => {
    const state = useAnalysisStore.getState()

    assert.equal(
      selectFilteredAuthorStats(state),
      selectFilteredAuthorStats(state),
    )
    assert.equal(selectFilteredFileStats(state), selectFilteredFileStats(state))
    assert.equal(
      selectAuthorDisplayByPersonId(state),
      selectAuthorDisplayByPersonId(state),
    )
    assert.equal(
      selectRosterMatchByPersonId(state),
      selectRosterMatchByPersonId(state),
    )
    assert.equal(
      selectAuthorColorsByPersonId(state),
      selectAuthorColorsByPersonId(state),
    )
  })

  it("returns stable references for unchanged populated snapshots", () => {
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
    useAnalysisStore.getState().setResult(result)

    const state = useAnalysisStore.getState()
    assert.equal(
      selectFilteredAuthorStats(state),
      selectFilteredAuthorStats(state),
    )
    assert.equal(selectFilteredFileStats(state), selectFilteredFileStats(state))
    assert.equal(
      selectAuthorDisplayByPersonId(state),
      selectAuthorDisplayByPersonId(state),
    )
    assert.equal(
      selectRosterMatchByPersonId(state),
      selectRosterMatchByPersonId(state),
    )
    assert.equal(
      selectAuthorColorsByPersonId(state),
      selectAuthorColorsByPersonId(state),
    )
  })
})
