import type {
  ExaminationInProgressQuestion,
  ExaminationQuestion,
  ExaminationSourceReference,
  ExaminationStreamProgress,
  ExaminationUsage,
} from "@repo-edu/application-contract"
import type { LlmProviderKind } from "@repo-edu/domain/settings"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import type { SourceIdentity } from "../components/tabs/examination/source.js"
import type { AnalysisSourceKey } from "../session/session-reducer.js"

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

export type ExaminationPreferencePersistenceEffect = {
  kind: "persist-preferences"
  activeConnectionId?: string | null
  providerModel?: {
    provider: LlmProviderKind
    modelCode: string
  }
}

export type ActivateSourceInput = {
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

export type ActivateSourceSummaryInput = {
  sourceSummaryKey: string
  subjectIds: string[]
  selectedSubjectId: string
}

export type LoadedArchiveResultPayload = {
  sourceSummaryKey?: string
  sourceSessionKey?: string
  requestId?: string
  loadingKey: string | null
  resultKey: string
  archiveEntry?: AvailableArchiveEntry
  entry: ExaminationEntry
}

export type ExaminationState = {
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  activeSourceSessionKey: string | null
  activeSourceSummaryKey: string | null
  sourceSessions: Map<string, ExaminationSession>
  sourceSummaries: Map<string, ExaminationSourceSummary>
  entriesByKey: Map<string, ExaminationEntry>
  archiveRevision: number
}

export type ExaminationActions = {
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
    modelCode: string | null,
    effort: LlmEffort | null,
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
    archiveKeyIdentityKey: string
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
  }) => { requestId: string } | null
  applyLoadedArchiveResult: (payload: LoadedArchiveResultPayload) => void
  applyGenerationError: (
    key: string,
    message: string,
    sourceSessionKey?: string,
    requestId?: string,
  ) => void
  setEntry: (key: string, entry: ExaminationEntry) => void
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
  applyGenerationProgress: (
    key: string,
    label: string,
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
  invalidateRepositoryAnalysisSource: (
    repoPath: string | null,
    analysisSourceKey?: AnalysisSourceKey | null,
  ) => void
  invalidateSubmissionSource: (
    folderPath: string,
    analysisSourceKey?: AnalysisSourceKey | null,
  ) => void
  invalidateAnalysisSource: (
    analysisSourceKey: AnalysisSourceKey | null,
  ) => void
  resetRepositoryAnalysis: () => void
  reset: () => void
}
