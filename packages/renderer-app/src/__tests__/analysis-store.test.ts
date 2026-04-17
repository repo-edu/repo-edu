import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type {
  AnalysisResult,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import {
  buildEffectiveBlameWorkflowConfig,
  selectAuthorDisplayByPersonId,
  selectBlameMergedAuthorStats,
  selectBlameMergedFileStats,
  selectFilteredAuthorStats,
  selectFilteredFileStats,
  selectRosterMatchByPersonId,
  useAnalysisStore,
} from "../stores/analysis-store.js"

beforeEach(() => {
  useAnalysisStore.getState().reset()
})

describe("analysis store", () => {
  it("builds blame workflow config from shared + blame-specific fields", () => {
    const store = useAnalysisStore.getState()
    store.setConfig({
      subfolder: "src",
      extensions: ["ts", "tsx"],
      includeFiles: ["*.ts"],
      excludeFiles: ["*.spec.ts"],
      excludeAuthors: ["bot*"],
      excludeEmails: ["noreply@*"],
      whitespace: true,
      maxConcurrency: 4,
    })
    store.setBlameConfig({
      copyMove: 3,
      includeComments: true,
      includeEmptyLines: true,
      blameExclusions: "show",
      ignoreRevsFile: false,
    })

    const state = useAnalysisStore.getState()
    const merged = buildEffectiveBlameWorkflowConfig(
      state.config,
      state.blameConfig,
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
    assert.equal(merged.includeComments, true)
    assert.equal(merged.includeEmptyLines, true)
    assert.equal(merged.blameExclusions, "show")
    assert.equal(merged.ignoreRevsFile, false)
  })

  it("seeds blame queue from result and focuses active file on click", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = [
      {
        path: "src/a.ts",
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

  it("seeds blame queue when blameSkip is disabled after a result", () => {
    const store = useAnalysisStore.getState()
    store.setConfig({ blameSkip: true })
    const result = makeBaseResult()
    result.fileStats = [
      {
        path: "src/a.ts",
        commits: 1,
        insertions: 10,
        deletions: 2,
        lines: 8,
        lastModified: 1_700_000_000,
        commitShas: new Set(["sha-a"]),
        authorBreakdown: new Map(),
      },
    ]
    store.setResult(result)

    let state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, [])

    store.setConfig({ blameSkip: false })
    state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, ["src/a.ts"])
  })

  it("clears blame state when blameSkip is enabled", () => {
    const store = useAnalysisStore.getState()
    store.openFileForBlame("src/a.ts")
    store.setBlameWorkflowStatus("running")
    store.setBlameProgress({
      phase: "blame",
      label: "Running per-file blame.",
      processedFiles: 0,
      totalFiles: 1,
      currentFile: "src/a.ts",
    })
    store.setBlameErrorMessage("x")
    store.setActiveView("blame")

    store.setConfig({ blameSkip: true })

    const state = useAnalysisStore.getState()
    assert.equal(state.config.blameSkip, true)
    assert.deepEqual(state.blameTargetFiles, [])
    assert.equal(state.activeBlameFile, null)
    assert.equal(state.blameWorkflowStatus, "idle")
    assert.equal(state.blameProgress, null)
    assert.equal(state.blameErrorMessage, null)
    assert.equal(state.activeView, "authors")
  })

  it("tracks file filtering mode separately from selected file paths", () => {
    const store = useAnalysisStore.getState()
    const result = makeBaseResult()
    result.fileStats = [
      {
        path: "src/a.ts",
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
  })
})
