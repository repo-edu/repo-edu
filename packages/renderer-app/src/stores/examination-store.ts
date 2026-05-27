import type {
  ExaminationGenerateQuestionsInput,
  ExaminationInProgressQuestion,
  ExaminationQuestion,
  ExaminationSourceReference,
  ExaminationStreamProgress,
  ExaminationUsage,
} from "@repo-edu/application-contract"
import type { LlmProviderKind } from "@repo-edu/domain/settings"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import { create } from "zustand"
import {
  buildArchiveKeyIdentityKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"

export type ExaminationEntryStatus = "idle" | "loading" | "loaded" | "error"

export type ExaminationEntry = {
  status: ExaminationEntryStatus
  questions: ExaminationQuestion[]
  usage: ExaminationUsage | null
  errorMessage: string | null
  generatedAt: string | null
  fromArchive: boolean
  sourceReferences: ExaminationSourceReference[]
  archivedQuestionCount: number | null
  archivedModel: string | null
  archivedEffort: LlmEffort | null
  partialQuestionCount: {
    requested: number
    accepted: number
  } | null
  generationProgressLabel: string | null
  streamedResponseCharacterCount: number
  streamedResponsePreview: string
  inProgressQuestion: ExaminationInProgressQuestion | null
  generationControlId: string | null
  stopRequested: boolean
}

export type AvailableArchiveEntry = {
  key: string
  questionCount: number
  model: string
  effort: LlmEffort
  entry: ExaminationEntry
}

export type ExaminationDisplayedEntryState =
  | { kind: "idle" }
  | { kind: "loading"; entryKey: string }
  | {
      kind: "archived"
      entryKey: string
      source: "lookup" | "pinned" | "just-generated"
    }
  | { kind: "error"; entryKey: string }

export type ExaminationLookupMetadata = {
  requestId: string
  archiveRevision: number
  archiveKeyIdentityKey: string
  entryKey: string
}

export type ExaminationLivePreferences = {
  questionCount: number
  activeConnectionId: string | null
  modelCode: string | null
  effort: LlmEffort | null
}

export type ExaminationSession = {
  sourceSessionKey: string
  sourceIdentity: SourceIdentity
  archiveKeyIdentity: SourceIdentity
  preferences: ExaminationLivePreferences
  showAnswers: boolean
  display: ExaminationDisplayedEntryState
  pinnedEntryKey: string | null
  archiveEntries: AvailableArchiveEntry[]
  lookupMetadata: ExaminationLookupMetadata | null
  pendingLookupRequestId: string | null
  pendingGenerationRequestId: string | null
  pendingGenerationEntryKey: string | null
}

export type ExaminationSourceSummary = {
  sourceSummaryKey: string
  subjectIds: string[]
  selectedSubjectId: string | null
  generatedQuestionCountBySubjectId: Map<string, number>
  archiveRevision: number
  pendingRequestId: string | null
}

type ExaminationSnapshot = {
  activeSourceSessionKey: string | null
  activeSourceSummaryKey: string | null
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  sourceSessions: Map<string, ExaminationSession>
  sourceSummaries: Map<string, ExaminationSourceSummary>
  entriesByKey: Map<string, ExaminationEntry>
  archiveRevision: number
}

export type ExaminationGenerationReplayInput = {
  sourceSummaryKey: string
  sourceSessionKey: string
  workflowInput: Omit<ExaminationGenerateQuestionsInput, "generationControlId">
  sourceReferences: ExaminationSourceReference[]
  requestedQuestionCount: number
}

export type ExaminationHistoryEffect = {
  kind: "replay-generation"
  input: ExaminationGenerationReplayInput
}

export type ExaminationHistoryEntry = {
  description: string
  before: ExaminationSnapshot
  after: ExaminationSnapshot
  generationRequestId: string | null
  generationReplayInput: ExaminationGenerationReplayInput | null
}

export type ExaminationHistoryTransition = {
  entry: ExaminationHistoryEntry
  effects: ExaminationHistoryEffect[]
}

export type ExaminationPreferencePersistenceEffect = {
  kind: "persist-preferences"
  activeConnectionId?: string | null
  providerModel?: {
    provider: LlmProviderKind
    modelCode: string
  }
}

type ActivateSourceInput = {
  sourceSummaryKey: string
  sourceSessionKey: string
  sourceIdentity: SourceIdentity
  subjectIds: string[]
  selectedSubjectId: string
  defaultPreferences: {
    questionCount: number
    activeConnectionId: string | null
    modelCode: string | null
    effort: LlmEffort | null
  }
}

type ActivateSourceSummaryInput = {
  sourceSummaryKey: string
  subjectIds: string[]
  selectedSubjectId: string
}

type LoadedArchiveResultPayload = {
  sourceSummaryKey?: string
  sourceSessionKey?: string
  requestId?: string
  loadingKey: string | null
  resultKey: string
  archiveEntry?: AvailableArchiveEntry
  entry: ExaminationEntry
}

type ExaminationState = {
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  activeSourceSessionKey: string | null
  activeSourceSummaryKey: string | null
  sourceSessions: Map<string, ExaminationSession>
  sourceSummaries: Map<string, ExaminationSourceSummary>
  entriesByKey: Map<string, ExaminationEntry>
  archiveRevision: number
  history: ExaminationHistoryEntry[]
  future: ExaminationHistoryEntry[]
}

type ExaminationActions = {
  activateSourceSummary: (input: ActivateSourceSummaryInput) => void
  activateSource: (input: ActivateSourceInput) => void
  selectRepositoryAnalysisSubject: (
    sourceSummaryKey: string,
    subjectId: string,
  ) => void
  setSelectedPersonId: (personId: string | null) => void
  setQuestionCount: (count: number) => void
  setSessionQuestionCount: (sourceSessionKey: string, count: number) => void
  setSessionConnection: (
    sourceSessionKey: string,
    connectionId: string | null,
  ) => ExaminationPreferencePersistenceEffect[]
  setSessionModel: (
    sourceSessionKey: string,
    provider: LlmProviderKind,
    code: string,
    effort: LlmEffort | null,
  ) => ExaminationPreferencePersistenceEffect[]
  setShowAnswers: (show: boolean) => void
  setSessionShowAnswers: (sourceSessionKey: string, show: boolean) => void
  selectArchiveEntry: (
    sourceSessionKey: string,
    archiveIdentity: SourceIdentity,
    archiveEntry: AvailableArchiveEntry,
    activeConnectionId: string | null,
    provider: LlmProviderKind,
  ) => ExaminationPreferencePersistenceEffect[]
  startLookup: (sourceSessionKey: string) => {
    requestId: string
    archiveRevision: number
  } | null
  applyLookupResult: (payload: {
    sourceSessionKey: string
    requestId: string
    archiveRevision: number
    requestedIdentity: SourceIdentity
    resolvedIdentity: SourceIdentity
    entryKey: string
    exactEntry: ExaminationEntry | null
    archiveEntries: AvailableArchiveEntry[]
  }) => void
  failLookup: (sourceSessionKey: string, requestId: string) => void
  startSourceSummaryLookup: (sourceSummaryKey: string) => {
    requestId: string
    archiveRevision: number
  } | null
  applySourceSummaryLookupResult: (payload: {
    sourceSummaryKey: string
    requestId: string
    archiveRevision: number
    counts: ReadonlyMap<string, number>
  }) => void
  failSourceSummaryLookup: (sourceSummaryKey: string, requestId: string) => void
  startGenerationSession: (payload: {
    sourceSessionKey: string
    entryKey: string
    generationControlId: string
    seedQuestions: ExaminationQuestion[]
    sourceReferences: ExaminationSourceReference[]
    requestedQuestionCount: number
    generationReplayInput: ExaminationGenerationReplayInput
  }) => { requestId: string } | null
  applyLoadedArchiveResult: (payload: LoadedArchiveResultPayload) => void
  applyGenerationError: (
    key: string,
    message: string,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  setEntry: (key: string, entry: ExaminationEntry) => void
  setPartialQuestions: (
    key: string,
    payload: {
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
      inProgressQuestion: ExaminationInProgressQuestion | null
    },
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  applyPartialQuestions: (
    key: string,
    payload: {
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
      inProgressQuestion: ExaminationInProgressQuestion | null
    },
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  setGenerationProgress: (
    key: string,
    label: string,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  applyGenerationProgress: (
    key: string,
    label: string,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  setStreamProgress: (
    key: string,
    progress: ExaminationStreamProgress,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  applyStreamProgress: (
    key: string,
    progress: ExaminationStreamProgress,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  requestGenerationStop: (sourceSessionKey: string) => string | null
  cancelGenerationSession: (sourceSessionKey: string) => void
  clearEntry: (key: string) => void
  archiveCatalogChanged: () => number
  invalidateRepositoryAnalysisSource: (repoPath: string | null) => void
  resetRepositoryAnalysis: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  nextUndoDescription: () => string | null
  nextRedoDescription: () => string | null
  undo: () => ExaminationHistoryTransition | null
  redo: () => ExaminationHistoryTransition | null
  reset: () => void
}

const HISTORY_LIMIT = 100

function createInitialState(): ExaminationState {
  return {
    selectedPersonId: null,
    questionCount: 4,
    showAnswers: true,
    activeSourceSessionKey: null,
    activeSourceSummaryKey: null,
    sourceSessions: new Map(),
    sourceSummaries: new Map(),
    entriesByKey: new Map(),
    archiveRevision: 0,
    history: [],
    future: [],
  }
}

function createSession(input: ActivateSourceInput): ExaminationSession {
  const preferences = {
    questionCount: clampQuestionCount(input.defaultPreferences.questionCount),
    activeConnectionId: input.defaultPreferences.activeConnectionId,
    modelCode: input.defaultPreferences.modelCode,
    effort: input.defaultPreferences.effort,
  }
  return {
    sourceSessionKey: input.sourceSessionKey,
    sourceIdentity: withPreferences(input.sourceIdentity, preferences),
    archiveKeyIdentity: withPreferences(input.sourceIdentity, preferences),
    preferences,
    showAnswers: true,
    display: { kind: "idle" },
    pinnedEntryKey: null,
    archiveEntries: [],
    lookupMetadata: null,
    pendingLookupRequestId: null,
    pendingGenerationRequestId: null,
    pendingGenerationEntryKey: null,
  }
}

function createSummary(
  input: ActivateSourceSummaryInput,
): ExaminationSourceSummary {
  return {
    sourceSummaryKey: input.sourceSummaryKey,
    subjectIds: input.subjectIds,
    selectedSubjectId: input.selectedSubjectId,
    generatedQuestionCountBySubjectId: new Map(),
    archiveRevision: 0,
    pendingRequestId: null,
  }
}

function createLoadingEntry(params: {
  generationControlId: string
  seedQuestions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  requestedQuestionCount: number
}): ExaminationEntry {
  return {
    status: "loading",
    questions: params.seedQuestions,
    usage: null,
    errorMessage: null,
    generatedAt: null,
    fromArchive: false,
    sourceReferences: params.sourceReferences,
    archivedQuestionCount: null,
    archivedModel: null,
    archivedEffort: null,
    partialQuestionCount: {
      requested: params.requestedQuestionCount,
      accepted: params.seedQuestions.length,
    },
    generationProgressLabel: "Preparing question generation.",
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: params.generationControlId,
    stopRequested: false,
  }
}

function createErrorEntry(message: string): ExaminationEntry {
  return {
    status: "error",
    questions: [],
    usage: null,
    errorMessage: message,
    generatedAt: null,
    fromArchive: false,
    sourceReferences: [],
    archivedQuestionCount: null,
    archivedModel: null,
    archivedEffort: null,
    partialQuestionCount: null,
    generationProgressLabel: null,
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: null,
    stopRequested: false,
  }
}

type RequestSidecarEntry = {
  controller: AbortController
  generationControlId?: string
}

function sidecarKey(ownerKey: string, requestId: string): string {
  return `${ownerKey}\n${requestId}`
}

const lookupRequestSidecar = new Map<string, RequestSidecarEntry>()
const summaryRequestSidecar = new Map<string, RequestSidecarEntry>()
const generationRequestSidecar = new Map<string, RequestSidecarEntry>()

let examinationHistoryEffectRunner:
  | ((effect: ExaminationHistoryEffect) => void)
  | null = null

export const examinationHistoryEffectDriver = {
  register(runner: (effect: ExaminationHistoryEffect) => void): () => void {
    examinationHistoryEffectRunner = runner
    return () => {
      if (examinationHistoryEffectRunner === runner) {
        examinationHistoryEffectRunner = null
      }
    }
  },
  run(effects: readonly ExaminationHistoryEffect[]): void {
    for (const effect of effects) {
      examinationHistoryEffectRunner?.(effect)
    }
  },
}

export const examinationRequestSidecar = {
  registerLookup(
    sourceSessionKey: string,
    requestId: string,
    controller: AbortController,
  ): void {
    replaceSidecarEntry(lookupRequestSidecar, sourceSessionKey, requestId, {
      controller,
    })
  },
  clearLookup(sourceSessionKey: string, requestId: string): void {
    lookupRequestSidecar.delete(sidecarKey(sourceSessionKey, requestId))
  },
  registerSummary(
    sourceSummaryKey: string,
    requestId: string,
    controller: AbortController,
  ): void {
    replaceSidecarEntry(summaryRequestSidecar, sourceSummaryKey, requestId, {
      controller,
    })
  },
  clearSummary(sourceSummaryKey: string, requestId: string): void {
    summaryRequestSidecar.delete(sidecarKey(sourceSummaryKey, requestId))
  },
  registerGeneration(
    sourceSessionKey: string,
    requestId: string,
    controller: AbortController,
    generationControlId: string,
  ): void {
    replaceSidecarEntry(generationRequestSidecar, sourceSessionKey, requestId, {
      controller,
      generationControlId,
    })
  },
  clearGeneration(sourceSessionKey: string, requestId: string): void {
    generationRequestSidecar.delete(sidecarKey(sourceSessionKey, requestId))
  },
  abortGeneration(sourceSessionKey: string, requestId: string): string | null {
    const key = sidecarKey(sourceSessionKey, requestId)
    const entry = generationRequestSidecar.get(key)
    if (entry === undefined) return null
    entry.controller.abort()
    generationRequestSidecar.delete(key)
    return entry.generationControlId ?? null
  },
  clearAll(): void {
    abortAndClearSidecar(lookupRequestSidecar)
    abortAndClearSidecar(summaryRequestSidecar)
    abortAndClearSidecar(generationRequestSidecar)
  },
}

function replaceSidecarEntry(
  sidecar: Map<string, RequestSidecarEntry>,
  ownerKey: string,
  requestId: string,
  entry: RequestSidecarEntry,
): void {
  for (const [key, current] of sidecar) {
    if (key.startsWith(`${ownerKey}\n`)) {
      current.controller.abort()
      sidecar.delete(key)
    }
  }
  sidecar.set(sidecarKey(ownerKey, requestId), entry)
}

function abortAndClearSidecar(sidecar: Map<string, RequestSidecarEntry>): void {
  for (const entry of sidecar.values()) {
    entry.controller.abort()
  }
  sidecar.clear()
}

export const useExaminationStore = create<
  ExaminationState & ExaminationActions
>((set, get) => {
  const updateLoadingEntry = (
    key: string,
    update: (entry: ExaminationEntry) => ExaminationEntry,
    sourceSessionKey?: string,
    requestId?: string,
  ): void => {
    set((state) => {
      if (
        sourceSessionKey !== undefined &&
        requestId !== undefined &&
        !acceptGenerationEvent(state, sourceSessionKey, requestId)
      ) {
        return state
      }
      const current = state.entriesByKey.get(key)
      if (current?.status !== "loading") return state
      const next = new Map(state.entriesByKey)
      next.set(key, update(current))
      return { entriesByKey: next }
    })
  }

  const recordHistory = (
    description: string,
    before: ExaminationSnapshot,
    after: ExaminationSnapshot,
    generationRequestId: string | null = null,
    generationReplayInput: ExaminationGenerationReplayInput | null = null,
  ): void => {
    if (snapshotsEqual(before, after)) return
    set((state) => {
      const history = [
        ...state.history,
        {
          description,
          before,
          after,
          generationRequestId,
          generationReplayInput,
        },
      ]
      if (history.length > HISTORY_LIMIT) {
        history.splice(0, history.length - HISTORY_LIMIT)
      }
      return { history, future: [] }
    })
  }

  const applyGenerationCompletionToCurrentState = (
    state: ExaminationState,
    payload: LoadedArchiveResultPayload,
  ): Partial<ExaminationState> | ExaminationState => {
    const entriesByKey = new Map(state.entriesByKey)
    const sourceSessions = new Map(state.sourceSessions)
    const sourceSummaries = new Map(state.sourceSummaries)
    if (
      payload.loadingKey !== null &&
      payload.loadingKey !== payload.resultKey
    ) {
      entriesByKey.delete(payload.loadingKey)
    }
    entriesByKey.set(payload.resultKey, completedEntry(payload.entry))

    if (
      payload.sourceSessionKey !== undefined &&
      payload.requestId !== undefined
    ) {
      const session = state.sourceSessions.get(payload.sourceSessionKey)
      if (
        session === undefined ||
        session.pendingGenerationRequestId !== payload.requestId
      ) {
        return state
      }
      sourceSessions.set(
        payload.sourceSessionKey,
        completeGenerationSession(session, payload),
      )
      const summary = sourceSummaries.get(payload.sourceSummaryKey ?? "")
      if (summary !== undefined) {
        sourceSummaries.set(
          summary.sourceSummaryKey,
          updateSummaryForGeneration(summary, session, payload.entry),
        )
      }
    }
    return { entriesByKey, sourceSessions, sourceSummaries }
  }

  const updateGenerationHistory = (
    payload: LoadedArchiveResultPayload,
  ): void => {
    set((state) => {
      const history = updateGenerationHistoryEntries(state.history, payload)
      const future = updateGenerationHistoryEntries(state.future, payload)
      if (history === state.history && future === state.future) return state
      return { history, future }
    })
  }

  const restoreSnapshot = (snapshot: ExaminationSnapshot) => {
    abortRequestsRemovedBySnapshot(snapshot)
    const sourceSessions = cloneSessions(snapshot.sourceSessions)
    const sourceSummaries = cloneSummaries(snapshot.sourceSummaries)
    const entriesByKey = new Map(snapshot.entriesByKey)
    dropOrphanedPendingRequests(sourceSessions, sourceSummaries, entriesByKey)
    return {
      activeSourceSessionKey: snapshot.activeSourceSessionKey,
      activeSourceSummaryKey: snapshot.activeSourceSummaryKey,
      selectedPersonId: snapshot.selectedPersonId,
      questionCount: snapshot.questionCount,
      showAnswers: snapshot.showAnswers,
      sourceSessions,
      sourceSummaries,
      entriesByKey,
      archiveRevision: snapshot.archiveRevision,
    }
  }

  return {
    ...createInitialState(),

    activateSourceSummary: (input) =>
      set((state) => {
        const sourceSummaries = new Map(state.sourceSummaries)
        const currentSummary = sourceSummaries.get(input.sourceSummaryKey)
        const selectedSubjectId = resolveSelectedSubjectId({
          current: currentSummary?.selectedSubjectId ?? null,
          fallback: input.selectedSubjectId,
          subjectIds: input.subjectIds,
        })
        sourceSummaries.set(
          input.sourceSummaryKey,
          currentSummary === undefined
            ? createSummary({ ...input, selectedSubjectId })
            : {
                ...currentSummary,
                subjectIds: input.subjectIds,
                selectedSubjectId,
              },
        )
        return {
          activeSourceSummaryKey: input.sourceSummaryKey,
          selectedPersonId: selectedSubjectId,
          sourceSummaries,
        }
      }),

    activateSource: (input) =>
      set((state) => {
        const sourceSummaries = new Map(state.sourceSummaries)
        const currentSummary = sourceSummaries.get(input.sourceSummaryKey)
        const selectedSubjectId = resolveSelectedSubjectId({
          current: currentSummary?.selectedSubjectId ?? null,
          fallback: input.selectedSubjectId,
          subjectIds: input.subjectIds,
        })
        sourceSummaries.set(
          input.sourceSummaryKey,
          currentSummary === undefined
            ? createSummary({ ...input, selectedSubjectId })
            : {
                ...currentSummary,
                subjectIds: input.subjectIds,
                selectedSubjectId,
              },
        )

        const sourceSessions = new Map(state.sourceSessions)
        const currentSession = sourceSessions.get(input.sourceSessionKey)
        const session =
          currentSession === undefined ? createSession(input) : currentSession
        sourceSessions.set(input.sourceSessionKey, {
          ...session,
          sourceIdentity: withPreferences(
            input.sourceIdentity,
            session.preferences,
          ),
          archiveKeyIdentity: withPreferences(
            input.sourceIdentity,
            session.preferences,
          ),
        })

        return {
          activeSourceSessionKey: input.sourceSessionKey,
          activeSourceSummaryKey: input.sourceSummaryKey,
          selectedPersonId: selectedSubjectId,
          questionCount: session.preferences.questionCount,
          showAnswers: session.showAnswers,
          sourceSummaries,
          sourceSessions,
        }
      }),

    selectRepositoryAnalysisSubject: (sourceSummaryKey, subjectId) => {
      const before = snapshotState(get())
      set((state) => {
        const current = state.sourceSummaries.get(sourceSummaryKey)
        if (current === undefined || !current.subjectIds.includes(subjectId)) {
          return state
        }
        const sourceSummaries = new Map(state.sourceSummaries)
        sourceSummaries.set(sourceSummaryKey, {
          ...current,
          selectedSubjectId: subjectId,
        })
        return {
          sourceSummaries,
          selectedPersonId: subjectId,
        }
      })
      recordHistory("Select examination subject", before, snapshotState(get()))
    },

    setSelectedPersonId: (selectedPersonId) => set({ selectedPersonId }),

    setQuestionCount: (questionCount) =>
      set({ questionCount: clampQuestionCount(questionCount) }),

    setSessionQuestionCount: (sourceSessionKey, count) => {
      const before = snapshotState(get())
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const questionCount = clampQuestionCount(count)
        const sourceSessions = new Map(state.sourceSessions)
        const preferences = { ...session.preferences, questionCount }
        sourceSessions.set(sourceSessionKey, {
          ...session,
          preferences,
          archiveKeyIdentity: withPreferences(
            session.archiveKeyIdentity,
            preferences,
          ),
        })
        return {
          sourceSessions,
          questionCount:
            state.activeSourceSessionKey === sourceSessionKey
              ? questionCount
              : state.questionCount,
        }
      })
      recordHistory(
        "Change examination question count",
        before,
        snapshotState(get()),
      )
    },

    setSessionConnection: (sourceSessionKey, activeConnectionId) => {
      const before = snapshotState(get())
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const preferences = { ...session.preferences, activeConnectionId }
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          preferences,
          archiveKeyIdentity: withPreferences(
            session.archiveKeyIdentity,
            preferences,
          ),
        })
        return { sourceSessions }
      })
      recordHistory(
        "Change examination connection",
        before,
        snapshotState(get()),
      )
      return [{ kind: "persist-preferences", activeConnectionId }]
    },

    setSessionModel: (sourceSessionKey, provider, code, effort) => {
      const before = snapshotState(get())
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const preferences = {
          ...session.preferences,
          modelCode: code,
          effort,
        }
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          preferences,
          archiveKeyIdentity: withPreferences(
            session.archiveKeyIdentity,
            preferences,
          ),
        })
        return { sourceSessions }
      })
      recordHistory("Change examination model", before, snapshotState(get()))
      return [
        {
          kind: "persist-preferences",
          providerModel: { provider, modelCode: code },
        },
      ]
    },

    setShowAnswers: (showAnswers) => set({ showAnswers }),

    setSessionShowAnswers: (sourceSessionKey, showAnswers) => {
      const before = snapshotState(get())
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, { ...session, showAnswers })
        return {
          sourceSessions,
          showAnswers:
            state.activeSourceSessionKey === sourceSessionKey
              ? showAnswers
              : state.showAnswers,
        }
      })
      recordHistory("Toggle examination answers", before, snapshotState(get()))
    },

    selectArchiveEntry: (
      sourceSessionKey,
      archiveIdentity,
      archiveEntry,
      activeConnectionId,
      provider,
    ) => {
      const before = snapshotState(get())
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const preferences: ExaminationLivePreferences = {
          questionCount: archiveEntry.questionCount,
          activeConnectionId,
          modelCode: archiveEntry.model,
          effort: archiveEntry.effort,
        }
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          archiveKeyIdentity: archiveIdentity,
          preferences,
          display: {
            kind: "archived",
            entryKey: archiveEntry.key,
            source: "pinned",
          },
          pinnedEntryKey: archiveEntry.key,
          archiveEntries: mergeAvailableArchiveEntries(session.archiveEntries, [
            archiveEntry,
          ]),
          lookupMetadata: null,
        })
        return {
          sourceSessions,
          questionCount:
            state.activeSourceSessionKey === sourceSessionKey
              ? archiveEntry.questionCount
              : state.questionCount,
        }
      })
      recordHistory(
        "Select archived examination set",
        before,
        snapshotState(get()),
      )
      return [
        { kind: "persist-preferences", activeConnectionId },
        {
          kind: "persist-preferences",
          providerModel: { provider, modelCode: archiveEntry.model },
        },
      ]
    },

    startLookup: (sourceSessionKey) => {
      const requestId = createRequestId()
      const archiveRevision = get().archiveRevision
      let started = false
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        started = true
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          pendingLookupRequestId: requestId,
        })
        return { sourceSessions }
      })
      return started ? { requestId, archiveRevision } : null
    },

    applyLookupResult: (payload) =>
      set((state) => {
        const session = state.sourceSessions.get(payload.sourceSessionKey)
        if (
          session === undefined ||
          session.pendingLookupRequestId !== payload.requestId ||
          payload.archiveRevision !== state.archiveRevision
        ) {
          return state
        }
        const sourceSessions = new Map(state.sourceSessions)
        const entriesByKey = new Map(state.entriesByKey)
        const archiveEntries = mergeAvailableArchiveEntries(
          session.archiveEntries,
          payload.archiveEntries,
        )
        if (payload.exactEntry === null) {
          const currentEntry = entriesByKey.get(payload.entryKey) ?? null
          if (currentEntry !== null && currentEntry.status !== "loading") {
            entriesByKey.delete(payload.entryKey)
          }
        } else {
          const currentEntry = entriesByKey.get(payload.entryKey) ?? null
          if (currentEntry?.status !== "loading") {
            entriesByKey.set(payload.entryKey, payload.exactEntry)
          }
        }

        const lookupMetadata: ExaminationLookupMetadata = {
          requestId: payload.requestId,
          archiveRevision: payload.archiveRevision,
          archiveKeyIdentityKey: buildArchiveKeyIdentityKey(
            payload.requestedIdentity,
          ),
          entryKey: payload.entryKey,
        }

        sourceSessions.set(payload.sourceSessionKey, {
          ...nextLookupDisplay(session, payload.entryKey, payload.exactEntry),
          sourceIdentity: withPreferences(
            payload.resolvedIdentity,
            session.preferences,
          ),
          archiveKeyIdentity: payload.resolvedIdentity,
          archiveEntries,
          lookupMetadata,
          pendingLookupRequestId: null,
        })
        return { sourceSessions, entriesByKey }
      }),

    failLookup: (sourceSessionKey, requestId) =>
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (
          session === undefined ||
          session.pendingLookupRequestId !== requestId
        ) {
          return state
        }
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          pendingLookupRequestId: null,
        })
        return { sourceSessions }
      }),

    startSourceSummaryLookup: (sourceSummaryKey) => {
      const requestId = createRequestId()
      const archiveRevision = get().archiveRevision
      let started = false
      set((state) => {
        const summary = state.sourceSummaries.get(sourceSummaryKey)
        if (summary === undefined) return state
        started = true
        const sourceSummaries = new Map(state.sourceSummaries)
        sourceSummaries.set(sourceSummaryKey, {
          ...summary,
          pendingRequestId: requestId,
        })
        return { sourceSummaries }
      })
      return started ? { requestId, archiveRevision } : null
    },

    applySourceSummaryLookupResult: (payload) =>
      set((state) => {
        const summary = state.sourceSummaries.get(payload.sourceSummaryKey)
        if (
          summary === undefined ||
          summary.pendingRequestId !== payload.requestId ||
          payload.archiveRevision !== state.archiveRevision
        ) {
          return state
        }
        const sourceSummaries = new Map(state.sourceSummaries)
        sourceSummaries.set(payload.sourceSummaryKey, {
          ...summary,
          generatedQuestionCountBySubjectId: new Map(payload.counts),
          archiveRevision: payload.archiveRevision,
          pendingRequestId: null,
        })
        return { sourceSummaries }
      }),

    failSourceSummaryLookup: (sourceSummaryKey, requestId) =>
      set((state) => {
        const summary = state.sourceSummaries.get(sourceSummaryKey)
        if (summary === undefined || summary.pendingRequestId !== requestId) {
          return state
        }
        const sourceSummaries = new Map(state.sourceSummaries)
        sourceSummaries.set(sourceSummaryKey, {
          ...summary,
          generatedQuestionCountBySubjectId: new Map(),
          pendingRequestId: null,
        })
        return { sourceSummaries }
      }),

    startGenerationSession: (payload) => {
      const requestId = createRequestId()
      const before = snapshotState(get())
      let started = false
      set((state) => {
        const session = state.sourceSessions.get(payload.sourceSessionKey)
        if (session === undefined) return state
        started = true
        const entriesByKey = new Map(state.entriesByKey)
        const sourceSessions = new Map(state.sourceSessions)
        entriesByKey.set(
          payload.entryKey,
          createLoadingEntry({
            generationControlId: payload.generationControlId,
            seedQuestions: payload.seedQuestions,
            sourceReferences: payload.sourceReferences,
            requestedQuestionCount: payload.requestedQuestionCount,
          }),
        )
        sourceSessions.set(payload.sourceSessionKey, {
          ...session,
          display: { kind: "loading", entryKey: payload.entryKey },
          pendingGenerationRequestId: requestId,
          pendingGenerationEntryKey: payload.entryKey,
        })
        return { entriesByKey, sourceSessions }
      })
      if (!started) return null
      recordHistory(
        "Generate examination questions",
        before,
        snapshotState(get()),
        requestId,
        payload.generationReplayInput,
      )
      return { requestId }
    },

    applyLoadedArchiveResult: (payload) => {
      let applied = false
      set((state) => {
        const next = applyGenerationCompletionToCurrentState(state, payload)
        if (next === state) return state
        applied = true
        return next
      })
      if (applied && payload.requestId !== undefined) {
        updateGenerationHistory(payload)
      }
    },

    applyGenerationError: (key, message, sourceSessionKey, requestId) =>
      set((state) => {
        if (
          sourceSessionKey !== undefined &&
          requestId !== undefined &&
          !acceptGenerationEvent(state, sourceSessionKey, requestId)
        ) {
          return state
        }
        const entriesByKey = new Map(state.entriesByKey)
        entriesByKey.set(key, createErrorEntry(message))
        if (sourceSessionKey === undefined || requestId === undefined) {
          return { entriesByKey }
        }
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return { entriesByKey }
        const sourceSessions = new Map(state.sourceSessions)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          display: { kind: "error", entryKey: key },
          pendingGenerationRequestId: null,
          pendingGenerationEntryKey: null,
        })
        return { entriesByKey, sourceSessions }
      }),

    setEntry: (key, entry) =>
      set((state) => {
        const next = new Map(state.entriesByKey)
        next.set(key, entry)
        return { entriesByKey: next }
      }),

    setPartialQuestions: (key, payload, sourceSessionKey, requestId) =>
      updateLoadingEntry(
        key,
        (current) => ({
          ...current,
          questions: payload.questions,
          sourceReferences: payload.sourceReferences,
          inProgressQuestion: payload.inProgressQuestion,
          partialQuestionCount:
            current.partialQuestionCount === null
              ? null
              : {
                  ...current.partialQuestionCount,
                  accepted: payload.questions.length,
                },
        }),
        sourceSessionKey,
        requestId,
      ),

    applyPartialQuestions: (key, payload, sourceSessionKey, requestId) =>
      get().setPartialQuestions(key, payload, sourceSessionKey, requestId),

    setGenerationProgress: (key, label, sourceSessionKey, requestId) =>
      updateLoadingEntry(
        key,
        (current) => ({
          ...current,
          generationProgressLabel: label,
        }),
        sourceSessionKey,
        requestId,
      ),

    applyGenerationProgress: (key, label, sourceSessionKey, requestId) =>
      get().setGenerationProgress(key, label, sourceSessionKey, requestId),

    setStreamProgress: (key, progress, sourceSessionKey, requestId) =>
      updateLoadingEntry(
        key,
        (current) => {
          if (
            progress.streamedCharacterCount <
            current.streamedResponseCharacterCount
          ) {
            return current
          }
          return {
            ...current,
            generationProgressLabel:
              progress.activityLabel ?? current.generationProgressLabel,
            streamedResponseCharacterCount: progress.streamedCharacterCount,
            streamedResponsePreview: progress.streamedTextPreview,
          }
        },
        sourceSessionKey,
        requestId,
      ),

    applyStreamProgress: (key, progress, sourceSessionKey, requestId) =>
      get().setStreamProgress(key, progress, sourceSessionKey, requestId),

    requestGenerationStop: (sourceSessionKey) => {
      const state = get()
      const session = state.sourceSessions.get(sourceSessionKey)
      const requestId = session?.pendingGenerationRequestId ?? null
      const entryKey = session?.pendingGenerationEntryKey ?? null
      if (session === undefined || requestId === null || entryKey === null) {
        return null
      }
      get().setGenerationProgress(
        entryKey,
        state.entriesByKey.get(entryKey)?.generationProgressLabel ??
          "Stopping generation.",
        sourceSessionKey,
        requestId,
      )
      set((current) => {
        const entry = current.entriesByKey.get(entryKey)
        if (entry?.status !== "loading") return current
        const entriesByKey = new Map(current.entriesByKey)
        entriesByKey.set(entryKey, {
          ...entry,
          stopRequested: true,
          generationProgressLabel:
            entry.generationProgressLabel ?? "Stopping generation.",
        })
        return { entriesByKey }
      })
      return state.entriesByKey.get(entryKey)?.generationControlId ?? null
    },

    cancelGenerationSession: (sourceSessionKey) =>
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        const requestId = session?.pendingGenerationRequestId ?? null
        const entryKey = session?.pendingGenerationEntryKey ?? null
        if (session === undefined || requestId === null) return state
        examinationRequestSidecar.abortGeneration(sourceSessionKey, requestId)
        const sourceSessions = new Map(state.sourceSessions)
        const entriesByKey = new Map(state.entriesByKey)
        if (entryKey !== null) entriesByKey.delete(entryKey)
        sourceSessions.set(sourceSessionKey, {
          ...session,
          display: { kind: "idle" },
          pendingGenerationRequestId: null,
          pendingGenerationEntryKey: null,
        })
        return { sourceSessions, entriesByKey }
      }),

    clearEntry: (key) =>
      set((state) => {
        if (!state.entriesByKey.has(key)) return state
        const next = new Map(state.entriesByKey)
        next.delete(key)
        return { entriesByKey: next }
      }),

    archiveCatalogChanged: () => {
      const nextRevision = get().archiveRevision + 1
      set((state) => {
        const sourceSessions = new Map<string, ExaminationSession>()
        for (const [key, session] of state.sourceSessions) {
          sourceSessions.set(key, {
            ...session,
            lookupMetadata: null,
            pendingLookupRequestId: null,
          })
        }
        const sourceSummaries = new Map<string, ExaminationSourceSummary>()
        for (const [key, summary] of state.sourceSummaries) {
          sourceSummaries.set(key, {
            ...summary,
            archiveRevision: -1,
            pendingRequestId: null,
          })
        }
        return {
          archiveRevision: nextRevision,
          sourceSessions,
          sourceSummaries,
        }
      })
      return nextRevision
    },

    invalidateRepositoryAnalysisSource: (repoPath) =>
      set((state) => {
        const sourceSessions = new Map(state.sourceSessions)
        for (const [key, session] of sourceSessions) {
          if (
            session.sourceIdentity.kind === "repository-analysis" &&
            (repoPath === null || session.sourceIdentity.repoPath === repoPath)
          ) {
            const requestId = session.pendingGenerationRequestId
            if (requestId !== null) {
              examinationRequestSidecar.abortGeneration(key, requestId)
            }
            sourceSessions.delete(key)
          }
        }
        const sourceSummaries = new Map(state.sourceSummaries)
        for (const key of sourceSummaries.keys()) {
          if (repositoryAnalysisSummaryMatchesRepoPath(key, repoPath)) {
            sourceSummaries.delete(key)
          }
        }
        return {
          sourceSessions,
          sourceSummaries,
          activeSourceSessionKey:
            state.activeSourceSessionKey !== null &&
            !sourceSessions.has(state.activeSourceSessionKey)
              ? null
              : state.activeSourceSessionKey,
          activeSourceSummaryKey:
            state.activeSourceSummaryKey !== null &&
            !sourceSummaries.has(state.activeSourceSummaryKey)
              ? null
              : state.activeSourceSummaryKey,
        }
      }),

    resetRepositoryAnalysis: () =>
      get().invalidateRepositoryAnalysisSource(null),

    canUndo: () => get().history.length > 0,
    canRedo: () => get().future.length > 0,
    nextUndoDescription: () => {
      const history = get().history
      return history.length > 0 ? history[history.length - 1].description : null
    },
    nextRedoDescription: () => {
      const future = get().future
      return future.length > 0 ? future[future.length - 1].description : null
    },

    undo: () => {
      const state = get()
      const entry = state.history[state.history.length - 1] ?? null
      if (entry === null) return null
      set((current) => ({
        ...restoreSnapshot(entry.before),
        history: current.history.slice(0, -1),
        future: [...current.future, entry],
      }))
      return { entry, effects: [] }
    },

    redo: () => {
      const state = get()
      const entry = state.future[state.future.length - 1] ?? null
      if (entry === null) return null
      const replayInput = pendingGenerationReplayInput(entry)
      if (replayInput !== null) {
        if (examinationHistoryEffectRunner === null) return null
        set((current) => ({
          future: current.future.slice(0, -1),
        }))
        return {
          entry,
          effects: [{ kind: "replay-generation", input: replayInput }],
        }
      }
      set((current) => ({
        ...restoreSnapshot(entry.after),
        history: [...current.history, entry],
        future: current.future.slice(0, -1),
      }))
      return { entry, effects: [] }
    },

    reset: () => {
      examinationRequestSidecar.clearAll()
      set(createInitialState())
    },
  }
})

function resolveSelectedSubjectId(params: {
  current: string | null
  fallback: string
  subjectIds: readonly string[]
}): string {
  if (params.current !== null && params.subjectIds.includes(params.current)) {
    return params.current
  }
  if (params.subjectIds.includes(params.fallback)) return params.fallback
  return params.subjectIds[0] ?? params.fallback
}

function withPreferences(
  identity: SourceIdentity,
  preferences: ExaminationLivePreferences,
): SourceIdentity {
  return {
    ...identity,
    questionCount: preferences.questionCount,
    model: preferences.modelCode ?? identity.model,
    effort: preferences.effort ?? identity.effort,
  }
}

function nextLookupDisplay(
  session: ExaminationSession,
  entryKey: string,
  exactEntry: ExaminationEntry | null,
): ExaminationSession {
  if (exactEntry === null) {
    if (
      session.display.kind === "archived" &&
      session.display.source === "lookup"
    ) {
      return { ...session, display: { kind: "idle" } }
    }
    return session
  }
  if (session.display.kind === "loading") return session
  if (
    session.display.kind === "archived" &&
    (session.display.source === "pinned" ||
      session.display.source === "just-generated")
  ) {
    return session
  }
  return {
    ...session,
    display: { kind: "archived", entryKey, source: "lookup" },
  }
}

function completedEntry(entry: ExaminationEntry): ExaminationEntry {
  return {
    ...entry,
    generationControlId: null,
    stopRequested: false,
  }
}

function completeGenerationSession(
  session: ExaminationSession,
  payload: LoadedArchiveResultPayload,
): ExaminationSession {
  return {
    ...session,
    display: {
      kind: "archived",
      entryKey: payload.resultKey,
      source: "just-generated",
    },
    pinnedEntryKey: payload.resultKey,
    archiveEntries:
      payload.archiveEntry === undefined
        ? session.archiveEntries
        : mergeAvailableArchiveEntries(session.archiveEntries, [
            payload.archiveEntry,
          ]),
    pendingGenerationRequestId: null,
    pendingGenerationEntryKey: null,
  }
}

function updateSummaryForGeneration(
  summary: ExaminationSourceSummary,
  session: ExaminationSession,
  entry: ExaminationEntry,
): ExaminationSourceSummary {
  const counts = new Map(summary.generatedQuestionCountBySubjectId)
  counts.set(
    session.sourceIdentity.subjectId,
    Math.max(
      counts.get(session.sourceIdentity.subjectId) ?? 0,
      entry.archivedQuestionCount ?? 0,
    ),
  )
  return {
    ...summary,
    generatedQuestionCountBySubjectId: counts,
  }
}

function completeGenerationSnapshot(
  snapshot: ExaminationSnapshot,
  payload: LoadedArchiveResultPayload,
): ExaminationSnapshot {
  const sourceSessionKey = payload.sourceSessionKey
  const requestId = payload.requestId
  if (sourceSessionKey === undefined || requestId === undefined) {
    return snapshot
  }
  const session = snapshot.sourceSessions.get(sourceSessionKey)
  if (session?.pendingGenerationRequestId !== requestId) return snapshot

  const entriesByKey = new Map(snapshot.entriesByKey)
  const sourceSessions = cloneSessions(snapshot.sourceSessions)
  const sourceSummaries = cloneSummaries(snapshot.sourceSummaries)
  if (payload.loadingKey !== null && payload.loadingKey !== payload.resultKey) {
    entriesByKey.delete(payload.loadingKey)
  }
  entriesByKey.set(payload.resultKey, completedEntry(payload.entry))
  sourceSessions.set(
    sourceSessionKey,
    completeGenerationSession(session, payload),
  )

  const summary = sourceSummaries.get(payload.sourceSummaryKey ?? "")
  if (summary !== undefined) {
    sourceSummaries.set(
      summary.sourceSummaryKey,
      updateSummaryForGeneration(summary, session, payload.entry),
    )
  }

  return {
    ...snapshot,
    sourceSessions,
    sourceSummaries,
    entriesByKey,
  }
}

function updateGenerationHistoryEntries(
  entries: readonly ExaminationHistoryEntry[],
  payload: LoadedArchiveResultPayload,
): ExaminationHistoryEntry[] {
  let changed = false
  const next = entries.map((entry) => {
    const before = completeGenerationSnapshot(entry.before, payload)
    const after = completeGenerationSnapshot(entry.after, payload)
    if (before === entry.before && after === entry.after) return entry
    changed = true
    return { ...entry, before, after }
  })
  return changed ? next : (entries as ExaminationHistoryEntry[])
}

function pendingGenerationReplayInput(
  entry: ExaminationHistoryEntry,
): ExaminationGenerationReplayInput | null {
  if (
    entry.generationRequestId === null ||
    entry.generationReplayInput === null
  ) {
    return null
  }
  const session = entry.after.sourceSessions.get(
    entry.generationReplayInput.sourceSessionKey,
  )
  return session?.pendingGenerationRequestId === entry.generationRequestId
    ? entry.generationReplayInput
    : null
}

function repositoryAnalysisSummaryMatchesRepoPath(
  sourceSummaryKey: string,
  repoPath: string | null,
): boolean {
  try {
    const parsed = JSON.parse(sourceSummaryKey) as unknown
    if (!Array.isArray(parsed)) return false
    if (parsed[0] !== "repository-analysis-summary") return false
    return repoPath === null || parsed[1] === repoPath
  } catch (_error) {
    return false
  }
}

function acceptGenerationEvent(
  state: ExaminationState,
  sourceSessionKey: string,
  requestId: string,
): boolean {
  const session = state.sourceSessions.get(sourceSessionKey)
  return session?.pendingGenerationRequestId === requestId
}

function snapshotState(state: ExaminationState): ExaminationSnapshot {
  return {
    activeSourceSessionKey: state.activeSourceSessionKey,
    activeSourceSummaryKey: state.activeSourceSummaryKey,
    selectedPersonId: state.selectedPersonId,
    questionCount: state.questionCount,
    showAnswers: state.showAnswers,
    sourceSessions: cloneSessions(state.sourceSessions),
    sourceSummaries: cloneSummaries(state.sourceSummaries),
    entriesByKey: new Map(state.entriesByKey),
    archiveRevision: state.archiveRevision,
  }
}

function cloneSessions(
  sessions: ReadonlyMap<string, ExaminationSession>,
): Map<string, ExaminationSession> {
  return new Map(
    [...sessions].map(([key, session]) => [
      key,
      {
        ...session,
        preferences: { ...session.preferences },
        archiveEntries: [...session.archiveEntries],
      },
    ]),
  )
}

function cloneSummaries(
  summaries: ReadonlyMap<string, ExaminationSourceSummary>,
): Map<string, ExaminationSourceSummary> {
  return new Map(
    [...summaries].map(([key, summary]) => [
      key,
      {
        ...summary,
        subjectIds: [...summary.subjectIds],
        generatedQuestionCountBySubjectId: new Map(
          summary.generatedQuestionCountBySubjectId,
        ),
      },
    ]),
  )
}

function snapshotsEqual(
  left: ExaminationSnapshot,
  right: ExaminationSnapshot,
): boolean {
  return (
    JSON.stringify(snapshotComparable(left)) ===
    JSON.stringify(snapshotComparable(right))
  )
}

function snapshotComparable(snapshot: ExaminationSnapshot) {
  return {
    ...snapshot,
    sourceSessions: [...snapshot.sourceSessions],
    sourceSummaries: [...snapshot.sourceSummaries].map(([key, summary]) => [
      key,
      {
        ...summary,
        generatedQuestionCountBySubjectId: [
          ...summary.generatedQuestionCountBySubjectId,
        ],
      },
    ]),
    entriesByKey: [...snapshot.entriesByKey],
  }
}

function abortRequestsRemovedBySnapshot(snapshot: ExaminationSnapshot): void {
  for (const key of generationRequestSidecar.keys()) {
    const [sourceSessionKey, requestId] = key.split("\n")
    if (sourceSessionKey === undefined || requestId === undefined) continue
    const session = snapshot.sourceSessions.get(sourceSessionKey)
    if (session?.pendingGenerationRequestId !== requestId) {
      generationRequestSidecar.get(key)?.controller.abort()
      generationRequestSidecar.delete(key)
    }
  }
  for (const key of lookupRequestSidecar.keys()) {
    const [sourceSessionKey, requestId] = key.split("\n")
    if (sourceSessionKey === undefined || requestId === undefined) continue
    const session = snapshot.sourceSessions.get(sourceSessionKey)
    if (session?.pendingLookupRequestId !== requestId) {
      lookupRequestSidecar.get(key)?.controller.abort()
      lookupRequestSidecar.delete(key)
    }
  }
  for (const key of summaryRequestSidecar.keys()) {
    const [sourceSummaryKey, requestId] = key.split("\n")
    if (sourceSummaryKey === undefined || requestId === undefined) continue
    const summary = snapshot.sourceSummaries.get(sourceSummaryKey)
    if (summary?.pendingRequestId !== requestId) {
      summaryRequestSidecar.get(key)?.controller.abort()
      summaryRequestSidecar.delete(key)
    }
  }
}

function dropOrphanedPendingRequests(
  sessions: Map<string, ExaminationSession>,
  summaries: Map<string, ExaminationSourceSummary>,
  entriesByKey: Map<string, ExaminationEntry>,
): void {
  for (const [sourceSessionKey, session] of sessions) {
    const lookupRequestId = session.pendingLookupRequestId
    const generationRequestId = session.pendingGenerationRequestId
    const hasLookupSidecar =
      lookupRequestId !== null &&
      lookupRequestSidecar.has(sidecarKey(sourceSessionKey, lookupRequestId))
    const hasGenerationSidecar =
      generationRequestId !== null &&
      generationRequestSidecar.has(
        sidecarKey(sourceSessionKey, generationRequestId),
      )
    if (
      (lookupRequestId === null || hasLookupSidecar) &&
      (generationRequestId === null || hasGenerationSidecar)
    ) {
      continue
    }
    const entryKey = session.pendingGenerationEntryKey
    if (
      generationRequestId !== null &&
      !hasGenerationSidecar &&
      entryKey !== null
    ) {
      entriesByKey.delete(entryKey)
    }
    sessions.set(sourceSessionKey, {
      ...session,
      display:
        session.display.kind === "loading" && !hasGenerationSidecar
          ? { kind: "idle" }
          : session.display,
      pendingLookupRequestId: hasLookupSidecar ? lookupRequestId : null,
      pendingGenerationRequestId: hasGenerationSidecar
        ? generationRequestId
        : null,
      pendingGenerationEntryKey: hasGenerationSidecar
        ? session.pendingGenerationEntryKey
        : null,
    })
  }
  for (const [sourceSummaryKey, summary] of summaries) {
    const requestId = summary.pendingRequestId
    if (
      requestId === null ||
      summaryRequestSidecar.has(sidecarKey(sourceSummaryKey, requestId))
    ) {
      continue
    }
    summaries.set(sourceSummaryKey, { ...summary, pendingRequestId: null })
  }
}

function mergeAvailableArchiveEntries(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): AvailableArchiveEntry[] {
  const byKey = new Map<string, AvailableArchiveEntry>()
  for (const entry of current) {
    byKey.set(entry.key, entry)
  }
  for (const entry of incoming) {
    byKey.set(entry.key, entry)
  }
  return [...byKey.values()].sort(compareAvailableArchiveEntries)
}

function compareAvailableArchiveEntries(
  a: AvailableArchiveEntry,
  b: AvailableArchiveEntry,
): number {
  const aTime =
    a.entry.generatedAt === null ? 0 : Date.parse(a.entry.generatedAt)
  const bTime =
    b.entry.generatedAt === null ? 0 : Date.parse(b.entry.generatedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.questionCount - b.questionCount
}

function clampQuestionCount(count: number): number {
  if (!Number.isFinite(count)) return 4
  const integer = Math.round(count)
  if (integer < 1) return 1
  if (integer > 20) return 20
  return integer
}

function createRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  )
}

export function selectActiveExaminationSession(
  state: ExaminationState,
): ExaminationSession | null {
  return state.activeSourceSessionKey === null
    ? null
    : (state.sourceSessions.get(state.activeSourceSessionKey) ?? null)
}

export function selectExaminationSession(
  sourceSessionKey: string | null,
): (state: ExaminationState) => ExaminationSession | null {
  return (state) =>
    sourceSessionKey === null
      ? null
      : (state.sourceSessions.get(sourceSessionKey) ?? null)
}

export function selectExaminationSourceSummary(
  sourceSummaryKey: string | null,
): (state: ExaminationState) => ExaminationSourceSummary | null {
  return (state) =>
    sourceSummaryKey === null
      ? null
      : (state.sourceSummaries.get(sourceSummaryKey) ?? null)
}
