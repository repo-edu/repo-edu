import { create } from "zustand"
import { subscribeCourseRemoval } from "../session/source-lifecycle-events.js"
import { mergeAvailableArchiveEntries } from "./examination-archive-entries.js"
import {
  examinationKeyMatchesCourseScope,
  examinationKeyMatchesSourceScope,
  repositoryAnalysisSummaryMatchesRepoPath,
  submissionSummaryMatchesFolderPath,
} from "./examination-key-scope.js"
import { examinationRequestSidecar } from "./examination-request-sidecar.js"
import {
  createErrorEntry,
  createInitialState,
  createLoadingEntry,
  createSession,
  createSummary,
} from "./examination-store-factories.js"
import {
  acceptGenerationEvent,
  applyGenerationCompletionToCurrentState,
  clampQuestionCount,
  createRequestId,
  nextLookupDisplay,
  removeMatchingSourceState,
  resolveSelectedSubjectId,
  withPreferences,
} from "./examination-store-helpers.js"
import type {
  ExaminationActions,
  ExaminationEntry,
  ExaminationLivePreferences,
  ExaminationLookupMetadata,
  ExaminationSession,
  ExaminationSourceSummary,
  ExaminationState,
} from "./examination-store-types.js"

export * from "./examination-store-selectors.js"

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
