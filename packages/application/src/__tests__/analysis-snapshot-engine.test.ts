import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyCommitExclusions,
  buildCommitGroups,
  buildRepoWideLogArgs,
  type CommitGroup,
  filterCommitsByPathScope,
  filterFileCandidates,
  reduceCommitGroupOverlap,
} from "../analysis-workflows/snapshot-engine.js"

type AnalysisCommit = {
  sha: string
  authorName: string
  authorEmail: string
  timestamp: number
  message: string
  files: { path: string; insertions: number; deletions: number }[]
}

describe("snapshot-engine filterFileCandidates", () => {
  const entries = [
    { path: "src/main.ts", size: 500 },
    { path: "src/utils.ts", size: 300 },
    { path: "src/index.js", size: 200 },
    { path: "lib/helper.py", size: 400 },
    { path: "README.md", size: 100 },
    { path: "src/deep/nested.ts", size: 150 },
  ]

  it("filters by subfolder", () => {
    const result = filterFileCandidates(entries, {
      subfolder: "src",
    })
    assert.ok(result.every((p) => p.startsWith("src/")))
    assert.ok(!result.includes("lib/helper.py"))
  })

  it("filters by extensions", () => {
    const result = filterFileCandidates(entries, {
      extensions: ["ts"],
    })
    assert.ok(result.every((p) => p.endsWith(".ts")))
  })

  it("applies nFiles truncation by blob size", () => {
    const result = filterFileCandidates(entries, { nFiles: 3 })
    assert.equal(result.length, 3)
  })

  it("omitted nFiles returns all files", () => {
    const result = filterFileCandidates(entries, {})
    assert.equal(result.length, entries.length)
  })

  it("returns deterministic sorted order", () => {
    const result = filterFileCandidates(entries, {})
    const sorted = [...result].sort()
    assert.deepEqual(result, sorted)
  })

  it("excludeFiles removes matching paths", () => {
    const result = filterFileCandidates(entries, {
      excludeFiles: ["*.md"],
    })
    assert.ok(!result.includes("README.md"))
  })

  it("includeFiles selects only matching paths", () => {
    const result = filterFileCandidates(entries, {
      includeFiles: ["*.py"],
    })
    assert.deepEqual(result, ["lib/helper.py"])
  })
})

describe("snapshot-engine applyCommitExclusions", () => {
  const commits: AnalysisCommit[] = [
    {
      sha: "abc123",
      authorName: "Alice",
      authorEmail: "alice@example.com",
      timestamp: 1700000000,
      message: "Fix bug",
      files: [],
    },
    {
      sha: "def456",
      authorName: "Bob",
      authorEmail: "bob@example.com",
      timestamp: 1700000100,
      message: "WIP: temp changes",
      files: [],
    },
    {
      sha: "ghi789",
      authorName: "Carol",
      authorEmail: "carol@example.com",
      timestamp: 1700000200,
      message: "Add feature",
      files: [],
    },
  ]

  it("excludes by SHA prefix", () => {
    const result = applyCommitExclusions(commits, {
      excludeRevisions: ["abc"],
    })
    assert.equal(result.length, 2)
    assert.ok(!result.some((c) => c.sha === "abc123"))
  })

  it("excludes by message pattern", () => {
    const result = applyCommitExclusions(commits, {
      excludeMessages: ["WIP*"],
    })
    assert.equal(result.length, 2)
    assert.ok(!result.some((c) => c.sha === "def456"))
  })

  it("returns all commits when no exclusions configured", () => {
    const result = applyCommitExclusions(commits, {})
    assert.equal(result.length, 3)
  })
})

describe("snapshot-engine buildCommitGroups", () => {
  it("groups consecutive commits by same author", () => {
    const commits: AnalysisCommit[] = [
      {
        sha: "a1",
        authorName: "Alice",
        authorEmail: "alice@example.com",
        timestamp: 100,
        message: "One",
        files: [{ path: "file.ts", insertions: 10, deletions: 2 }],
      },
      {
        sha: "a2",
        authorName: "Alice",
        authorEmail: "alice@example.com",
        timestamp: 200,
        message: "Two",
        files: [{ path: "file.ts", insertions: 5, deletions: 1 }],
      },
    ]

    const groups = buildCommitGroups(commits, "file.ts")
    assert.equal(groups.length, 1)
    assert.equal(groups[0].insertions, 15)
    assert.equal(groups[0].deletions, 3)
    assert.equal(groups[0].shas.size, 2)
  })

  it("separates commits by different authors", () => {
    const commits: AnalysisCommit[] = [
      {
        sha: "a1",
        authorName: "Alice",
        authorEmail: "alice@example.com",
        timestamp: 100,
        message: "One",
        files: [{ path: "file.ts", insertions: 10, deletions: 0 }],
      },
      {
        sha: "b1",
        authorName: "Bob",
        authorEmail: "bob@example.com",
        timestamp: 200,
        message: "Two",
        files: [{ path: "file.ts", insertions: 5, deletions: 0 }],
      },
    ]

    const groups = buildCommitGroups(commits, "file.ts")
    assert.equal(groups.length, 2)
  })
})

describe("snapshot-engine reduceCommitGroupOverlap", () => {
  it("removes trailing duplicate groups from shorter lists", () => {
    const sharedGroup: CommitGroup = {
      author: "Alice\0alice@example.com",
      path: "file.ts",
      insertions: 10,
      deletions: 0,
      dateSum: 1000,
      shas: new Set(["shared1"]),
    }

    const uniqueGroup: CommitGroup = {
      author: "Bob\0bob@example.com",
      path: "file.ts",
      insertions: 5,
      deletions: 0,
      dateSum: 500,
      shas: new Set(["unique1"]),
    }

    const fileGroupsMap = new Map<string, CommitGroup[]>()
    // Longer file has unique + shared
    fileGroupsMap.set("long.ts", [
      uniqueGroup,
      { ...sharedGroup, shas: new Set(sharedGroup.shas) },
    ])
    // Shorter file has only the shared tail
    fileGroupsMap.set("short.ts", [
      { ...sharedGroup, shas: new Set(sharedGroup.shas) },
    ])

    reduceCommitGroupOverlap(fileGroupsMap)

    assert.equal(fileGroupsMap.get("long.ts")?.length, 2)
    assert.equal(fileGroupsMap.get("short.ts")?.length, 0)
  })

  it("preserves groups when tails differ", () => {
    const group1: CommitGroup = {
      author: "Alice\0alice@example.com",
      path: "a.ts",
      insertions: 10,
      deletions: 0,
      dateSum: 1000,
      shas: new Set(["sha1"]),
    }

    const group2: CommitGroup = {
      author: "Bob\0bob@example.com",
      path: "b.ts",
      insertions: 5,
      deletions: 0,
      dateSum: 500,
      shas: new Set(["sha2"]),
    }

    const map = new Map<string, CommitGroup[]>()
    map.set("a.ts", [group1])
    map.set("b.ts", [group2])

    reduceCommitGroupOverlap(map)

    assert.equal(map.get("a.ts")?.length, 1)
    assert.equal(map.get("b.ts")?.length, 1)
  })
})

describe("snapshot-engine buildRepoWideLogArgs", () => {
  it("emits log args without --follow or path scope", () => {
    const args = buildRepoWideLogArgs("abc123", { whitespace: false })
    assert.ok(args.includes("log"))
    assert.ok(args.includes("--numstat"))
    assert.ok(args.includes("abc123"))
    assert.equal(
      args.includes("--follow"),
      false,
      "repo-wide log must not use --follow",
    )
    assert.equal(
      args.includes("--"),
      false,
      "repo-wide log must not pass a pathspec separator",
    )
  })

  it("includes -w only when whitespace is not preserved", () => {
    assert.ok(buildRepoWideLogArgs("oid", {}).includes("-w"))
    assert.equal(
      buildRepoWideLogArgs("oid", { whitespace: true }).includes("-w"),
      false,
    )
  })

  it("propagates since/until when set", () => {
    const args = buildRepoWideLogArgs("oid", {
      since: "2024-01-01",
      until: "2024-06-30",
    })
    assert.ok(args.includes("--since=2024-01-01"))
    assert.ok(args.includes("--until=2024-06-30"))
  })
})

describe("snapshot-engine filterCommitsByPathScope", () => {
  const baseCommit = {
    sha: "c1",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    timestamp: 100,
    message: "msg",
  }

  it("drops commits whose files are outside the subfolder", () => {
    const commits: AnalysisCommit[] = [
      {
        ...baseCommit,
        files: [{ path: "doc/README.md", insertions: 1, deletions: 0 }],
      },
      {
        ...baseCommit,
        sha: "c2",
        files: [{ path: "src/a.ts", insertions: 5, deletions: 0 }],
      },
    ]
    const filtered = filterCommitsByPathScope(commits, { subfolder: "src" })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].sha, "c2")
  })

  it("filters file entries by extension allowlist", () => {
    const commits: AnalysisCommit[] = [
      {
        ...baseCommit,
        files: [
          { path: "a.ts", insertions: 5, deletions: 0 },
          { path: "a.md", insertions: 9, deletions: 0 },
        ],
      },
    ]
    const filtered = filterCommitsByPathScope(commits, { extensions: ["ts"] })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].files.length, 1)
    assert.equal(filtered[0].files[0].path, "a.ts")
  })

  it("does not apply the nFiles cap", () => {
    const commits: AnalysisCommit[] = [
      {
        ...baseCommit,
        files: [
          { path: "a.ts", insertions: 1, deletions: 0 },
          { path: "b.ts", insertions: 1, deletions: 0 },
          { path: "c.ts", insertions: 1, deletions: 0 },
        ],
      },
    ]
    // nFiles=1 would prune to top-N in filterFileCandidates, but the
    // repo-wide path scope must keep every matching numstat entry so the
    // author totals stay correct regardless of the cap.
    const filtered = filterCommitsByPathScope(commits, { nFiles: 1 })
    assert.equal(filtered[0].files.length, 3)
  })
})
