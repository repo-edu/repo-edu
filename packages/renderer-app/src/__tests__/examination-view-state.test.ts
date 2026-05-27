import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { BlameResult, PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { buildMemberExcerpts } from "../components/tabs/examination/build-excerpts.js"
import {
  displayedEntryReducer,
  initialDisplayedEntryReducerState,
} from "../components/tabs/examination/displayed-entry-reducer.js"
import type { SourceIdentity } from "../components/tabs/examination/source.js"
import {
  canShowExaminationView,
  resolveExaminationEmptyState,
  shouldShowUnmatchedRosterWarning,
} from "../components/tabs/examination/view-state.js"

const courseIdentity: SourceIdentity = {
  kind: "course",
  repoPath: "/repos/project",
  commitOid: "a".repeat(40),
  subjectId: "p_1",
  excerptScopeId: "scope-a",
  redactionIdentityScopeId: "redaction-a",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

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
  })
})

describe("displayed entry reducer", () => {
  it("keeps loading visible over lookup hits", () => {
    const loading = displayedEntryReducer(initialDisplayedEntryReducerState, {
      type: "GENERATION_STARTED",
      identity: courseIdentity,
      entryKey: "session-1",
    })

    const afterLookup = displayedEntryReducer(loading, {
      type: "LOOKUP_SUCCESS",
      identity: courseIdentity,
      exactEntryKey: "archive-1",
    })

    assert.deepEqual(afterLookup.display, {
      kind: "loading",
      entryKey: "session-1",
    })
  })

  it("preserves pins across lookup misses for the same identity", () => {
    const pinned = displayedEntryReducer(initialDisplayedEntryReducerState, {
      type: "ARCHIVE_SELECTED",
      identity: courseIdentity,
      entryKey: "archive-selected",
    })

    const afterMiss = displayedEntryReducer(pinned, {
      type: "LOOKUP_MISS",
      identity: courseIdentity,
    })

    assert.deepEqual(afterMiss.display, {
      kind: "archived",
      entryKey: "archive-selected",
      source: "pinned",
    })
  })

  it("clears pins when the source identity changes", () => {
    const pinned = displayedEntryReducer(initialDisplayedEntryReducerState, {
      type: "ARCHIVE_SELECTED",
      identity: courseIdentity,
      entryKey: "archive-selected",
    })

    const changed = displayedEntryReducer(pinned, {
      type: "IDENTITY_CHANGED",
      identity: { ...courseIdentity, subjectId: "p_2" },
    })

    assert.deepEqual(changed.display, { kind: "idle" })
    assert.equal(changed.pinnedEntryKey, null)
  })

  it("promotes a provisional course excerpt scope without clearing the pin", () => {
    const pinned = displayedEntryReducer(initialDisplayedEntryReducerState, {
      type: "ARCHIVE_SELECTED",
      identity: courseIdentity,
      entryKey: "archive-selected",
    })

    const promoted = displayedEntryReducer(pinned, {
      type: "EXCERPT_SCOPE_RESOLVED",
      provisionalIdentity: courseIdentity,
      resolvedExcerptScopeId: "provider-payload",
    })

    assert.equal(promoted.identity?.kind, "course")
    assert.equal(
      promoted.identity?.kind === "course"
        ? promoted.identity.excerptScopeId
        : null,
      "provider-payload",
    )
    assert.deepEqual(promoted.display, pinned.display)
  })

  it("lets just-generated entries outrank later lookup hits", () => {
    const ready = displayedEntryReducer(initialDisplayedEntryReducerState, {
      type: "IDENTITY_CHANGED",
      identity: courseIdentity,
    })
    const generated = displayedEntryReducer(ready, {
      type: "GENERATION_SUCCEEDED",
      identity: courseIdentity,
      entryKey: "archive-fresh",
    })

    const afterLookup = displayedEntryReducer(generated, {
      type: "LOOKUP_SUCCESS",
      identity: courseIdentity,
      exactEntryKey: "archive-old",
    })

    assert.deepEqual(afterLookup.display, {
      kind: "archived",
      entryKey: "archive-fresh",
      source: "just-generated",
    })
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

    assert.deepStrictEqual(excerpts, [
      {
        filePath: "src/a.ts",
        startLine: 1,
        lines: ["const one = 1", "const two = 2"],
      },
    ])
  })
})
