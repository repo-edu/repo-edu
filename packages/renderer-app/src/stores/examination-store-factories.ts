import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import {
  clampQuestionCount,
  withPreferences,
} from "./examination-store-helpers.js"
import type {
  ActivateSourceInput,
  ActivateSourceSummaryInput,
  ExaminationEntry,
  ExaminationSession,
  ExaminationSourceSummary,
  ExaminationState,
} from "./examination-store-types.js"

export function createInitialState(): ExaminationState {
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

export function createSession(input: ActivateSourceInput): ExaminationSession {
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

export function createSummary(
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

export function createLoadingEntry(params: {
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

export function createErrorEntry(message: string): ExaminationEntry {
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
