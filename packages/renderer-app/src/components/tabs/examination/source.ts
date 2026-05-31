import type {
  ExaminationCodeExcerpt,
  ExaminationLocalIdentityContext,
} from "@repo-edu/application-contract"
import {
  buildExaminationRedactionIdentityScopeId,
  buildSubmissionContentScopeId,
  canonicalizeExaminationExcerpts,
} from "@repo-edu/application-contract"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import type { AnalysisSourceKey } from "../../../session/session-reducer.js"

export type SourceSubject = {
  id: string
  name: string
  email: string
  lines: number
  linesPercent: number
}

export type PreparedExaminationSubject = SourceSubject & {
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
  excerptScopeId: string
}

export type RepositoryAnalysisExaminationSource = {
  kind: "repository-analysis"
  selectedRepoPath: string
  commitOid: string
  subjects: PreparedExaminationSubject[]
  localIdentityContext: ExaminationLocalIdentityContext
  rosterWarningBySubjectId: ReadonlyMap<string, string | null>
}

export type SubmissionExaminationSource = {
  kind: "submission"
  folderPath: string
  contentScopeId: string
  subject: PreparedExaminationSubject
  localIdentityContext: ExaminationLocalIdentityContext
}

export type ExaminationSource =
  | RepositoryAnalysisExaminationSource
  | SubmissionExaminationSource

export type RepositoryAnalysisSourceIdentity = {
  kind: "repository-analysis"
  repoPath: string
  commitOid: string
  subjectId: string
  excerptScopeId: string
  redactionIdentityScopeId: string
  questionCount: number
  model: string
  effort: LlmEffort
}

export type SubmissionSourceIdentity = {
  kind: "submission"
  folderPath: string
  contentScopeId: string
  subjectId: string
  excerptScopeId: string
  redactionIdentityScopeId: string
  questionCount: number
  model: string
  effort: LlmEffort
}

export type SourceIdentity =
  | RepositoryAnalysisSourceIdentity
  | SubmissionSourceIdentity

export function sourceCarrierKey(source: ExaminationSource): string {
  if (source.kind === "repository-analysis") {
    return JSON.stringify([
      "repository-analysis",
      source.selectedRepoPath,
      source.commitOid,
    ])
  }
  return JSON.stringify([
    "submission",
    source.folderPath,
    source.contentScopeId,
  ])
}

export function sourceSubjects(source: ExaminationSource): SourceSubject[] {
  return source.kind === "repository-analysis"
    ? source.subjects
    : [source.subject]
}

function analysisSourceKeyParts(
  analysisSourceKey: AnalysisSourceKey | null,
): unknown[] {
  if (analysisSourceKey === null) return ["none"]
  if (analysisSourceKey.kind === "course") {
    return ["course", analysisSourceKey.courseId]
  }
  if (analysisSourceKey.kind === "folder") {
    return ["folder", analysisSourceKey.path]
  }
  return ["submission", analysisSourceKey.path, analysisSourceKey.courseId]
}

export function analysisSourceKeyScopeId(
  analysisSourceKey: AnalysisSourceKey | null,
): string {
  return JSON.stringify(analysisSourceKeyParts(analysisSourceKey))
}

function withAnalysisSourceScope(
  parts: unknown[],
  analysisSourceKey?: AnalysisSourceKey | null,
): unknown[] {
  return analysisSourceKey === undefined
    ? parts
    : ["analysis-source", analysisSourceKeyParts(analysisSourceKey), parts]
}

export function getSourceSubject(
  source: ExaminationSource,
  subjectId: string | null,
): PreparedExaminationSubject | null {
  if (source.kind === "submission") return source.subject
  if (subjectId === null) return null
  return source.subjects.find((subject) => subject.id === subjectId) ?? null
}

export function buildRepositoryAnalysisSourceIdentity(params: {
  source: RepositoryAnalysisExaminationSource
  subject: PreparedExaminationSubject
  questionCount: number
  model: string
  effort: LlmEffort
}): RepositoryAnalysisSourceIdentity {
  return {
    kind: "repository-analysis",
    repoPath: params.source.selectedRepoPath,
    commitOid: params.source.commitOid,
    subjectId: params.subject.id,
    excerptScopeId: params.subject.excerptScopeId,
    redactionIdentityScopeId: buildExaminationRedactionIdentityScopeId(
      params.source.localIdentityContext,
    ),
    questionCount: params.questionCount,
    model: params.model,
    effort: params.effort,
  }
}

export function buildSubmissionSourceIdentity(params: {
  source: SubmissionExaminationSource
  questionCount: number
  model: string
  effort: LlmEffort
}): SubmissionSourceIdentity {
  return {
    kind: "submission",
    folderPath: params.source.folderPath,
    contentScopeId: params.source.contentScopeId,
    subjectId: params.source.subject.id,
    excerptScopeId: params.source.subject.excerptScopeId,
    redactionIdentityScopeId: buildExaminationRedactionIdentityScopeId(
      params.source.localIdentityContext,
    ),
    questionCount: params.questionCount,
    model: params.model,
    effort: params.effort,
  }
}

export function buildProvisionalRepositoryAnalysisExcerptScopeId(params: {
  excerpts: readonly ExaminationCodeExcerpt[]
  excerptFileSources: Readonly<Record<string, string>>
}): string {
  const canonicalExcerpts = canonicalizeExaminationExcerpts(params.excerpts)
  const sourceEntries = Object.entries(params.excerptFileSources).toSorted(
    ([left], [right]) => left.localeCompare(right),
  )
  const encoder = new TextEncoder()
  return buildSubmissionContentScopeId(
    encoder.encode(JSON.stringify([canonicalExcerpts, sourceEntries])),
  )
}

export function buildSourceSessionKey(
  identity: SourceIdentity | null,
  analysisSourceKey?: AnalysisSourceKey | null,
): string {
  if (identity === null) return "null"
  if (identity.kind === "repository-analysis") {
    return JSON.stringify(
      withAnalysisSourceScope(
        [
          "repository-analysis-session",
          identity.repoPath,
          identity.commitOid,
          identity.subjectId,
          identity.redactionIdentityScopeId,
          identity.excerptScopeId,
        ],
        analysisSourceKey,
      ),
    )
  }
  return JSON.stringify(
    withAnalysisSourceScope(
      [
        "submission-session",
        identity.folderPath,
        identity.contentScopeId,
        identity.subjectId,
        identity.redactionIdentityScopeId,
        identity.excerptScopeId,
      ],
      analysisSourceKey,
    ),
  )
}

export function buildArchiveKeyIdentityKey(
  identity: SourceIdentity | null,
  analysisSourceKey?: AnalysisSourceKey | null,
) {
  if (identity === null) return "null"
  if (identity.kind === "repository-analysis") {
    return JSON.stringify(
      withAnalysisSourceScope(
        [
          "repository-analysis-archive",
          identity.repoPath,
          identity.commitOid,
          identity.subjectId,
          identity.redactionIdentityScopeId,
          identity.excerptScopeId,
          identity.questionCount,
          identity.model,
          identity.effort,
        ],
        analysisSourceKey,
      ),
    )
  }
  return JSON.stringify(
    withAnalysisSourceScope(
      [
        "submission-archive",
        identity.folderPath,
        identity.contentScopeId,
        identity.subjectId,
        identity.redactionIdentityScopeId,
        identity.excerptScopeId,
        identity.questionCount,
        identity.model,
        identity.effort,
      ],
      analysisSourceKey,
    ),
  )
}

export function buildSourceSummaryKey(
  source: ExaminationSource,
  analysisSourceKey?: AnalysisSourceKey | null,
): string {
  const redactionIdentityScopeId = buildExaminationRedactionIdentityScopeId(
    source.localIdentityContext,
  )
  if (source.kind === "repository-analysis") {
    return JSON.stringify(
      withAnalysisSourceScope(
        [
          "repository-analysis-summary",
          source.selectedRepoPath,
          source.commitOid,
          redactionIdentityScopeId,
          source.subjects
            .map((subject) => [subject.id, subject.excerptScopeId] as const)
            .toSorted(([leftId], [rightId]) => leftId.localeCompare(rightId)),
        ],
        analysisSourceKey,
      ),
    )
  }
  return JSON.stringify(
    withAnalysisSourceScope(
      [
        "submission-summary",
        source.folderPath,
        source.contentScopeId,
        redactionIdentityScopeId,
        [[source.subject.id, source.subject.excerptScopeId]],
      ],
      analysisSourceKey,
    ),
  )
}
