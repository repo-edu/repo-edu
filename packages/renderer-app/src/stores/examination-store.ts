import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import { create } from "zustand"
import type { SourceIdentity } from "../components/tabs/examination/source.js"
import { subscribeCourseRemoval } from "../session/source-lifecycle-events.js"
import {
  mergeAvailableArchiveEntries,
  mergeSupersedingAvailableArchiveEntries,
  supersededAvailableArchiveEntryKeys,
} from "./examination-archive-entries.js"
import {
  examinationKeyMatchesCourseScope,
  examinationKeyMatchesSourceScope,
  repositoryAnalysisSummaryMatchesRepoPath,
  submissionSummaryMatchesFolderPath,
} from "./examination-key-scope.js"
import { examinationRequestSidecar } from "./examination-request-sidecar.js"
import type {
  ActivateSourceInput,
  ActivateSourceSummaryInput,
  ExaminationActions,
  ExaminationEntry,
  ExaminationLivePreferences,
  ExaminationLookupMetadata,
  ExaminationSession,
  ExaminationSourceSummary,
  ExaminationState,
  LoadedArchiveResultPayload,
} from "./examination-store-types.js"

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
      const supersededKeys =
        payload.archiveEntry === undefined
          ? new Set<string>()
          : supersededAvailableArchiveEntryKeys(session.archiveEntries, [
              payload.archiveEntry,
            ])
      for (const key of supersededKeys) {
        if (key !== payload.loadingKey && key !== payload.resultKey) {
          entriesByKey.delete(key)
        }
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

    selectRepositoryAnalysisSubject: (sourceSummaryKey, subjectId) =>
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
      }),

    setSelectedPersonId: (selectedPersonId) => set({ selectedPersonId }),

    setQuestionCount: (questionCount) =>
      set({ questionCount: clampQuestionCount(questionCount) }),

    setSessionQuestionCount: (sourceSessionKey, count) => {
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
    },

    setSessionConnection: (
      sourceSessionKey,
      activeConnectionId,
      modelCode,
      effort,
    ) => {
      set((state) => {
        const session = state.sourceSessions.get(sourceSessionKey)
        if (session === undefined) return state
        const preferences = {
          ...session.preferences,
          activeConnectionId,
          modelCode,
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
      return [{ kind: "persist-preferences", activeConnectionId }]
    },

    setSessionModel: (sourceSessionKey, provider, code, effort) => {
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
      return [
        {
          kind: "persist-preferences",
          providerModel: { provider, modelCode: code },
        },
      ]
    },

    setShowAnswers: (showAnswers) => set({ showAnswers }),

    setSessionShowAnswers: (sourceSessionKey, showAnswers) => {
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
    },

    selectArchiveEntry: (
      sourceSessionKey,
      archiveIdentity,
      archiveEntry,
      activeConnectionId,
      provider,
    ) => {
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
          archiveKeyIdentityKey: payload.archiveKeyIdentityKey,
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
      return started ? { requestId } : null
    },

    applyLoadedArchiveResult: (payload) =>
      set((state) => {
        const next = applyGenerationCompletionToCurrentState(state, payload)
        if (next === state) return state
        return next
      }),

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

    applyPartialQuestions: (key, payload, sourceSessionKey, requestId) =>
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

    applyGenerationProgress: (key, label, sourceSessionKey, requestId) =>
      updateLoadingEntry(
        key,
        (current) => ({
          ...current,
          generationProgressLabel: label,
        }),
        sourceSessionKey,
        requestId,
      ),

    applyStreamProgress: (key, progress, sourceSessionKey, requestId) =>
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

    requestGenerationStop: (sourceSessionKey) => {
      const state = get()
      const session = state.sourceSessions.get(sourceSessionKey)
      const requestId = session?.pendingGenerationRequestId ?? null
      const entryKey = session?.pendingGenerationEntryKey ?? null
      if (session === undefined || requestId === null || entryKey === null) {
        return null
      }
      get().applyGenerationProgress(
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

    invalidateRepositoryAnalysisSource: (repoPath, analysisSourceKey) =>
      set((state) =>
        removeMatchingSourceState(
          state,
          (key, session) =>
            session.sourceIdentity.kind === "repository-analysis" &&
            examinationKeyMatchesSourceScope(key, analysisSourceKey) &&
            (repoPath === null || session.sourceIdentity.repoPath === repoPath),
          (key) =>
            repositoryAnalysisSummaryMatchesRepoPath(
              key,
              repoPath,
              analysisSourceKey,
            ),
        ),
      ),

    invalidateSubmissionSource: (folderPath, analysisSourceKey) =>
      set((state) =>
        removeMatchingSourceState(
          state,
          (key, session) =>
            session.sourceIdentity.kind === "submission" &&
            examinationKeyMatchesSourceScope(key, analysisSourceKey) &&
            session.sourceIdentity.folderPath === folderPath,
          (key) =>
            submissionSummaryMatchesFolderPath(
              key,
              folderPath,
              analysisSourceKey,
            ),
        ),
      ),

    invalidateAnalysisSource: (analysisSourceKey) =>
      set((state) =>
        removeMatchingSourceState(
          state,
          (key) => examinationKeyMatchesSourceScope(key, analysisSourceKey),
          (key) => examinationKeyMatchesSourceScope(key, analysisSourceKey),
        ),
      ),

    invalidateCourseAnalysisSources: (courseId) =>
      set((state) =>
        removeMatchingSourceState(
          state,
          (key) => examinationKeyMatchesCourseScope(key, courseId),
          (key) => examinationKeyMatchesCourseScope(key, courseId),
        ),
      ),

    resetRepositoryAnalysis: () =>
      get().invalidateRepositoryAnalysisSource(null),

    reset: () => {
      examinationRequestSidecar.clearAll()
      set(createInitialState())
    },
  }
})

subscribeCourseRemoval((courseId) => {
  useExaminationStore.getState().invalidateCourseAnalysisSources(courseId)
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
        : mergeSupersedingAvailableArchiveEntries(session.archiveEntries, [
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

function removeMatchingSourceState(
  state: ExaminationState,
  matchesSession: (key: string, session: ExaminationSession) => boolean,
  matchesSummary: (key: string, summary: ExaminationSourceSummary) => boolean,
): Pick<
  ExaminationState,
  | "sourceSessions"
  | "sourceSummaries"
  | "activeSourceSessionKey"
  | "activeSourceSummaryKey"
> {
  const sourceSessions = new Map(state.sourceSessions)
  for (const [key, session] of sourceSessions) {
    if (matchesSession(key, session)) {
      const lookupRequestId = session.pendingLookupRequestId
      if (lookupRequestId !== null) {
        examinationRequestSidecar.abortLookup(key, lookupRequestId)
      }
      const requestId = session.pendingGenerationRequestId
      if (requestId !== null) {
        examinationRequestSidecar.abortGeneration(key, requestId)
      }
      sourceSessions.delete(key)
    }
  }

  const sourceSummaries = new Map(state.sourceSummaries)
  for (const [key, summary] of sourceSummaries) {
    if (matchesSummary(key, summary)) {
      const requestId = summary.pendingRequestId
      if (requestId !== null) {
        examinationRequestSidecar.abortSummary(key, requestId)
      }
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
}

function acceptGenerationEvent(
  state: ExaminationState,
  sourceSessionKey: string,
  requestId: string,
): boolean {
  const session = state.sourceSessions.get(sourceSessionKey)
  return session?.pendingGenerationRequestId === requestId
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
