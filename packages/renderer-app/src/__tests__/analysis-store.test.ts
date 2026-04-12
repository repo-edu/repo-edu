import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { AnalysisResult } from "@repo-edu/domain/analysis"
import {
  buildEffectiveBlameWorkflowConfig,
  selectAuthorDisplayByPersonId,
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

  it("keeps a single active blame target while retaining cached results", () => {
    const store = useAnalysisStore.getState()
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

    const state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, ["src/b.ts"])
    assert.equal(state.activeBlameFile, "src/b.ts")
    assert.equal(state.blameFileResults.has("src/a.ts"), true)
    assert.equal(state.blameFileResults.has("src/b.ts"), true)
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
        stability: 75,
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
        stability: 70,
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
        stability: 80,
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
        stability: 90,
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
