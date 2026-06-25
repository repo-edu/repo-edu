import type {
  AnalysisResult,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"

export function makeBaseResult(): AnalysisResult {
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

export function makeFileStatsWithBreakdown(): FileStats[] {
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

export function makeBlameResult(): BlameResult {
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
