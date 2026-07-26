import type {
  ExaminationModelsByProvider,
  PersistedLlmConnection,
} from "@repo-edu/domain/settings"
import type {
  ExaminationArchiveImportSummary as HostExaminationArchiveImportSummary,
  UserSaveTargetRef,
} from "@repo-edu/host-runtime-contract"
import type { LlmEffort, LlmUsage } from "@repo-edu/integrations-llm-contract"
import type { SUBMISSION_FOLDER_PERSON_ID } from "../workflow-types.js"
import type { ExaminationArchiveKey } from "./archive-key.js"
import type { ExaminationLocalIdentityContext } from "./local-identity.js"

export type ExaminationCodeExcerpt = {
  filePath: string
  startLine: number
  lines: string[]
}

export type ExaminationLlmSettings = {
  llmConnections: PersistedLlmConnection[]
  activeLlmConnectionId: string | null
  examinationModelsByProvider: ExaminationModelsByProvider
}

export type ExaminationGenerateQuestionsBaseInput = {
  /** Stable identity of the author the excerpts belong to. */
  personId: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
  /** Target size of the returned and archived question set. */
  questionCount: number
  llmSettings: ExaminationLlmSettings
}

export type ExaminationGenerateQuestionsInput =
  ExaminationGenerateQuestionsBaseInput & {
    /**
     * Accepted questions retained while extending a set. The workflow generates
     * only enough additional questions to reach `questionCount`.
     */
    seedQuestions?: ExaminationQuestion[]
    /** Process-local handle used to stop this generation request. */
    generationControlId: string
    /** Skip the matching archive read and request a fresh generated set. */
    regenerate?: boolean
  }

export type ExaminationLookupQuestionsInput =
  ExaminationGenerateQuestionsBaseInput

export type ExaminationAttachedRosterIdentityInput = {
  name: string | null
  email: string | null
  id: string | null
  lmsUserId: string | null
  studentNumber: string | null
  gitUsername: string | null
}

export type ExaminationPrepareSubmissionSourceInput = {
  folderPath: string
  selectedRelativePaths: string[]
  configuredExtensions: string[]
  attachedRosterIdentities?: ExaminationAttachedRosterIdentityInput[]
}

export type ExaminationPreparedSubmissionSource = {
  folderPath: string
  personId: typeof SUBMISSION_FOLDER_PERSON_ID
  displayTitle: string
  displaySubtitle: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type ExaminationQuestionSummarySubjectInput = {
  subjectId: string
  personId: string
  contentScopeId: string
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type ExaminationLookupQuestionSummariesInput = {
  subjects: ExaminationQuestionSummarySubjectInput[]
}

export type ExaminationArchivedQuestionSetSummary = {
  key: ExaminationArchiveKey
  provenance: ExaminationArchivedProvenance
}

export type ExaminationQuestionSummaryGroup = {
  subjectId: string
  sets: ExaminationArchivedQuestionSetSummary[]
}

export type ExaminationLookupQuestionSummariesResult = {
  summaries: ExaminationQuestionSummaryGroup[]
}

export type ExaminationLineRange = {
  start: number
  end: number
}

export type ExaminationSourceAnchor = {
  sourceId: string | null
  lineRange: ExaminationLineRange | null
}

export type ExaminationQuestion = {
  question: string
  answer: string
  anchor: ExaminationSourceAnchor
}

export type ExaminationUsage = LlmUsage

export type ExaminationArchivedProvenance = {
  model: string
  effort: LlmEffort
  questionCount: number
  usage: ExaminationUsage | null
  createdAtMs: number
  redactionPolicyVersion: number
  promptTemplateVersion: number
}

export type ExaminationSourceReference = {
  sourceId: string
  occurrences: {
    filePath: string
    lineRange: ExaminationLineRange
  }[]
}

export type ExaminationGenerateQuestionsResult = {
  key: ExaminationArchiveKey
  questions: ExaminationQuestion[]
  usage: ExaminationUsage | null
  fromArchive: boolean
  requestedQuestionCount: number
  archivedProvenance: ExaminationArchivedProvenance
  sourceReferences: ExaminationSourceReference[]
}

export type ExaminationArchivedQuestionSet = ExaminationGenerateQuestionsResult

export type ExaminationLookupQuestionsResult = {
  requestedKey: ExaminationArchiveKey
  sourceReferences: ExaminationSourceReference[]
  exact: ExaminationGenerateQuestionsResult | null
  availableSets: ExaminationArchivedQuestionSet[]
}

export type ExaminationArchiveRecord = {
  key: ExaminationArchiveKey
  questions: ExaminationQuestion[]
  provenance: ExaminationArchivedProvenance
}

export type ExaminationStreamProgress = {
  streamedCharacterCount: number
  activityLabel: string | null
}

export type ExaminationGenerateOutput =
  | { kind: "warn"; message: string }
  | ({ kind: "stream-progress" } & ExaminationStreamProgress)
  | {
      kind: "partial-questions"
      acceptedQuestionCount: number
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
    }

export type ExaminationStopGenerationInput = {
  generationControlId: string
}

export type ExaminationStopGenerationResult =
  | { stopped: true }
  | { stopped: false; reason: "not-running" }

export const EXAMINATION_ARCHIVE_BUNDLE_FORMAT =
  "repo-edu-examination-archive" as const
export const EXAMINATION_ARCHIVE_BUNDLE_VERSION = 3 as const

export type ExaminationArchiveBundle = {
  format: typeof EXAMINATION_ARCHIVE_BUNDLE_FORMAT
  bundleVersion: typeof EXAMINATION_ARCHIVE_BUNDLE_VERSION
  exportedAt: string
  records: ExaminationArchiveRecord[]
}

export type ExaminationArchiveExportResult = {
  file: UserSaveTargetRef
  recordCount: number
}

export type ExaminationArchiveImportSummary =
  HostExaminationArchiveImportSummary
