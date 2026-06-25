import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildPersonDbIdentityKey } from "@repo-edu/domain/analysis"
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
import { authorColor } from "../utils/author-colors.js"
import {
  makeBaseResult,
  makeBlameResult,
  makeFileStatsWithBreakdown,
} from "./analysis.test-support.js"

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
