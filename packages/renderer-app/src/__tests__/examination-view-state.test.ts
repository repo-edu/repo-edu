import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { BlameResult, PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { buildMemberExcerpts } from "../components/tabs/examination/build-excerpts.js"
import { selectExaminationDisplay } from "../components/tabs/examination/display-selectors.js"
import {
  buildArchiveKeyIdentityKey,
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import type { AvailableArchiveEntry } from "../components/tabs/examination/types.js"
import {
  canShowExaminationView,
  resolveExaminationEmptyState,
  shouldShowUnmatchedRosterWarning,
} from "../components/tabs/examination/view-state.js"
import { useExaminationStore } from "../stores/examination-store.js"

const courseCommitOid = "a".repeat(40)

const courseIdentity: SourceIdentity = {
  kind: "repository-analysis",
  repoPath: "/repos/project",
  commitOid: courseCommitOid,
  subjectId: "p_1",
  excerptScopeId: "scope-a",
  redactionIdentityScopeId: "redaction-a",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

const sourceSessionKey = buildSourceSessionKey(courseIdentity)
const sourceSummaryKey = "summary-1"

beforeEach(() => {
  useExaminationStore.getState().reset()
})

function archiveEntry(params: {
  key: string
  questionCount?: number
  model?: string
}): AvailableArchiveEntry {
  const questionCount = params.questionCount ?? courseIdentity.questionCount
  const model = params.model ?? courseIdentity.model
  return {
    key: params.key,
    questionCount,
    model,
    effort: "medium",
    entry: {
      status: "loaded",
      questions: [
        {
          question: `${params.key}?`,
          answer: `${params.key}.`,
          anchor: { sourceId: null, lineRange: null },
        },
      ],
      usage: null,
      errorMessage: null,
      generatedAt: "2026-05-27T00:00:00.000Z",
      fromArchive: true,
      sourceReferences: [],
      archivedQuestionCount: questionCount,
      archivedModel: model,
      archivedEffort: "medium",
      partialQuestionCount: null,
      generationProgressLabel: null,
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
      generationControlId: null,
      stopRequested: false,
    },
  }
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

describe("examination session display state", () => {
  it("keeps loading visible over lookup hits", () => {
    const store = activateSession()
    store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "generation-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    const lookup = store.startLookup(sourceSessionKey)
    if (lookup === null) throw new Error("Lookup did not start.")

    store.applyLookupResult({
      sourceSessionKey,
      requestId: lookup.requestId,
      archiveRevision: lookup.archiveRevision,
      archiveKeyIdentityKey: buildArchiveKeyIdentityKey(courseIdentity),
      requestedIdentity: courseIdentity,
      resolvedIdentity: courseIdentity,
      entryKey: "archive-1",
      exactEntry: archiveEntry({ key: "archive-1" }).entry,
      archiveEntries: [archiveEntry({ key: "archive-1" })],
    })

    assert.deepEqual(
      useExaminationStore.getState().sourceSessions.get(sourceSessionKey)
        ?.display,
      {
        kind: "loading",
        entryKey: "session-1",
      },
    )
  })

  it("preserves pins across lookup misses for the same identity", () => {
    const store = activateSession()
    const selected = archiveEntry({ key: "archive-selected" })
    store.selectArchiveEntry(
      sourceSessionKey,
      courseIdentity,
      selected,
      "llm-1",
      "claude",
    )
    const lookup = store.startLookup(sourceSessionKey)
    if (lookup === null) throw new Error("Lookup did not start.")

    store.applyLookupResult({
      sourceSessionKey,
      requestId: lookup.requestId,
      archiveRevision: lookup.archiveRevision,
      archiveKeyIdentityKey: buildArchiveKeyIdentityKey(courseIdentity),
      requestedIdentity: courseIdentity,
      resolvedIdentity: courseIdentity,
      entryKey: "archive-requested",
      exactEntry: null,
      archiveEntries: [],
    })

    const session = useExaminationStore
      .getState()
      .sourceSessions.get(sourceSessionKey)
    assert.deepEqual(session?.display, {
      kind: "archived",
      entryKey: "archive-selected",
      source: "pinned",
    })
    assert.equal(session?.archiveEntries[0], selected)
  })

  it("clears pins when the source identity changes", () => {
    const store = activateSession()
    store.selectArchiveEntry(
      sourceSessionKey,
      courseIdentity,
      archiveEntry({ key: "archive-selected" }),
      "llm-1",
      "claude",
    )
    const changedIdentity = { ...courseIdentity, subjectId: "p_2" }
    const changedKey = buildSourceSessionKey(changedIdentity)
    store.activateSource({
      sourceSummaryKey,
      sourceSessionKey: changedKey,
      sourceIdentity: changedIdentity,
      subjectIds: ["p_1", "p_2"],
      selectedSubjectId: "p_2",
      defaultPreferences: {
        questionCount: 4,
        activeConnectionId: "llm-1",
        modelCode: "22",
        effort: "medium",
      },
    })

    const changed = useExaminationStore
      .getState()
      .sourceSessions.get(changedKey)
    assert.deepEqual(changed?.display, { kind: "idle" })
    assert.equal(changed?.pinnedEntryKey, null)
    assert.deepEqual(changed?.archiveEntries, [])
  })

  it("keeps the selected archive entry through control alignment", () => {
    const store = activateSession()
    const selected = archiveEntry({
      key: "archive-selected",
      questionCount: 6,
      model: "33",
    })
    const selectedIdentity = {
      ...courseIdentity,
      questionCount: 6,
      model: "33",
    } satisfies SourceIdentity
    store.selectArchiveEntry(
      sourceSessionKey,
      selectedIdentity,
      selected,
      "llm-1",
      "claude",
    )
    store.setSessionModel(
      sourceSessionKey,
      "claude",
      courseIdentity.model,
      "medium",
    )

    const session = useExaminationStore
      .getState()
      .sourceSessions.get(sourceSessionKey)
    if (session === undefined) throw new Error("Session was not activated.")
    const display = selectExaminationDisplay({
      displayedState: session.display,
      entriesByKey: new Map(),
      archiveEntries: session.archiveEntries,
      blocker: null,
    })

    assert.equal(display.archiveEntry, selected)
    assert.equal(display.displayEntry, selected.entry)
  })

  it("lets just-generated entries outrank later lookup hits", () => {
    const store = activateSession()
    const generation = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "generation-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (generation === null) throw new Error("Generation did not start.")
    const fresh = archiveEntry({ key: "archive-fresh" })
    store.applyLoadedArchiveResult({
      sourceSessionKey,
      requestId: generation.requestId,
      loadingKey: "session-1",
      resultKey: "archive-fresh",
      entry: fresh.entry,
      archiveEntry: fresh,
    })
    const lookup = store.startLookup(sourceSessionKey)
    if (lookup === null) throw new Error("Lookup did not start.")

    store.applyLookupResult({
      sourceSessionKey,
      requestId: lookup.requestId,
      archiveRevision: lookup.archiveRevision,
      archiveKeyIdentityKey: buildArchiveKeyIdentityKey(courseIdentity),
      requestedIdentity: courseIdentity,
      resolvedIdentity: courseIdentity,
      entryKey: "archive-old",
      exactEntry: archiveEntry({ key: "archive-old" }).entry,
      archiveEntries: [archiveEntry({ key: "archive-old" })],
    })

    assert.deepEqual(
      useExaminationStore.getState().sourceSessions.get(sourceSessionKey)
        ?.display,
      {
        kind: "archived",
        entryKey: "archive-fresh",
        source: "just-generated",
      },
    )
  })
})

function activateSession() {
  const store = useExaminationStore.getState()
  store.activateSource({
    sourceSummaryKey,
    sourceSessionKey,
    sourceIdentity: courseIdentity,
    subjectIds: ["p_1"],
    selectedSubjectId: "p_1",
    defaultPreferences: {
      questionCount: 4,
      activeConnectionId: "llm-1",
      modelCode: "22",
      effort: "medium",
    },
  })
  return store
}

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
