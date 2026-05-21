import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { BlameResult, PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { buildMemberExcerpts } from "../components/tabs/examination/build-excerpts.js"
import {
  buildExaminationRendererEntryKey,
  canShowExaminationView,
  resolveExaminationEmptyState,
  shouldShowUnmatchedRosterWarning,
} from "../components/tabs/examination/view-state.js"

describe("examination view state", () => {
  it("makes Examination available whenever blame is enabled", () => {
    assert.equal(canShowExaminationView(false), true)
    assert.equal(canShowExaminationView(true), false)
  })

  it("asks folder-mode users to select a repository before choosing an author", () => {
    assert.equal(
      resolveExaminationEmptyState({
        selectedRepositoryPath: null,
        hasBlameResult: false,
        authorCount: 0,
        selectedPersonId: null,
      }),
      "Select a repository to choose an author for examination questions.",
    )
  })

  it("asks for an author or contributor when folder blame is available", () => {
    const message = resolveExaminationEmptyState({
      selectedRepositoryPath: "/repos/project",
      hasBlameResult: true,
      authorCount: 2,
      selectedPersonId: null,
    })

    assert.match(message ?? "", /author or contributor/)
    assert.doesNotMatch(message ?? "", /student/i)
  })

  it("shows unmatched-roster warnings only for populated course rosters", () => {
    assert.equal(
      shouldShowUnmatchedRosterWarning({
        analysisKind: "course",
        rosterPopulated: true,
        rosterMemberId: null,
      }),
      true,
    )
    assert.equal(
      shouldShowUnmatchedRosterWarning({
        analysisKind: "folder",
        rosterPopulated: true,
        rosterMemberId: null,
      }),
      false,
    )
    assert.equal(
      shouldShowUnmatchedRosterWarning({
        analysisKind: "course",
        rosterPopulated: true,
        rosterMemberId: "m_1",
      }),
      false,
    )
  })

  it("invalidates renderer entry keys when generation-affecting inputs change", () => {
    const base = buildExaminationRendererEntryKey({
      repositoryPath: "/repos/project",
      commitOid: "abc123",
      personId: "p_1",
      questionCount: 8,
      excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["alpha"] }],
      assignmentContext: null,
      model: "22",
      effort: "medium",
    })

    assert.notEqual(
      base,
      buildExaminationRendererEntryKey({
        repositoryPath: "/repos/project",
        commitOid: "abc123",
        personId: "p_1",
        questionCount: 9,
        excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["alpha"] }],
        assignmentContext: null,
        model: "22",
        effort: "medium",
      }),
    )
    assert.notEqual(
      base,
      buildExaminationRendererEntryKey({
        repositoryPath: "/repos/project",
        commitOid: "abc123",
        personId: "p_1",
        questionCount: 8,
        excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["alpha"] }],
        assignmentContext: null,
        model: "33",
        effort: "high",
      }),
    )
    assert.notEqual(
      base,
      buildExaminationRendererEntryKey({
        repositoryPath: "/repos/project",
        commitOid: "abc123",
        personId: "p_1",
        questionCount: 8,
        excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["alpha"] }],
        assignmentContext: "A1",
        model: "22",
        effort: "medium",
      }),
    )
    assert.notEqual(
      base,
      buildExaminationRendererEntryKey({
        repositoryPath: "/repos/project",
        commitOid: "abc123",
        personId: "p_1",
        questionCount: 8,
        excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["beta"] }],
        assignmentContext: null,
        model: "22",
        effort: "medium",
      }),
    )
  })
})

describe("examination excerpt selection", () => {
  it("includes blame lines from all aliases of a merged author", () => {
    const personDb: PersonDbSnapshot = {
      persons: [
        {
          id: "p_1",
          canonicalName: "Alice",
          canonicalEmail: "alice@example.com",
          aliases: [
            {
              name: "Alice S.",
              email: "alice@example.com",
              evidence: "email-link",
            },
          ],
          commitCount: 0,
        },
      ],
      identityIndex: new Map([
        ["alice@example.com\0alice", "p_1"],
        ["alice@example.com\0alice s.", "p_1"],
      ]),
    }
    const blameResult: BlameResult = {
      personDbOverlay: personDb,
      delta: { newPersons: [], newAliases: [], relinkedIdentities: [] },
      authorSummaries: [],
      fileSummaries: [],
      fileBlames: [
        {
          path: "src/a.ts",
          lines: [
            {
              sha: "a",
              authorName: "Alice",
              authorEmail: "alice@example.com",
              timestamp: 1,
              lineNumber: 1,
              content: "const one = 1",
              message: "one",
            },
            {
              sha: "b",
              authorName: "Alice S.",
              authorEmail: "alice@example.com",
              timestamp: 2,
              lineNumber: 2,
              content: "const two = 2",
              message: "two",
            },
          ],
        },
      ],
    }

    const excerpts = buildMemberExcerpts(blameResult, personDb, "p_1")

    assert.deepEqual(excerpts, [
      {
        filePath: "src/a.ts",
        startLine: 1,
        lines: ["const one = 1", "const two = 2"],
      },
    ])
  })
})
