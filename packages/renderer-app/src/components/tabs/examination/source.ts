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

export function buildSourceSessionKey(identity: SourceIdentity | null): string {
  if (identity === null) return "null"
  if (identity.kind === "repository-analysis") {
    return JSON.stringify([
      "repository-analysis-session",
      identity.repoPath,
      identity.commitOid,
      identity.subjectId,
      identity.redactionIdentityScopeId,
      identity.excerptScopeId,
    ])
  }
  return JSON.stringify([
    "submission-session",
    identity.folderPath,
    identity.contentScopeId,
    identity.subjectId,
    identity.redactionIdentityScopeId,
    identity.excerptScopeId,
  ])
}

export function buildArchiveKeyIdentityKey(identity: SourceIdentity | null) {
  if (identity === null) return "null"
  if (identity.kind === "repository-analysis") {
    return JSON.stringify([
      "repository-analysis-archive",
      identity.repoPath,
      identity.commitOid,
      identity.subjectId,
      identity.redactionIdentityScopeId,
      identity.excerptScopeId,
      identity.questionCount,
      identity.model,
      identity.effort,
    ])
  }
  return JSON.stringify([
    "submission-archive",
    identity.folderPath,
    identity.contentScopeId,
    identity.subjectId,
    identity.redactionIdentityScopeId,
    identity.excerptScopeId,
    identity.questionCount,
    identity.model,
    identity.effort,
  ])
}

export function buildSourceSummaryKey(source: ExaminationSource): string {
  const redactionIdentityScopeId = buildExaminationRedactionIdentityScopeId(
    source.localIdentityContext,
  )
  if (source.kind === "repository-analysis") {
    return JSON.stringify([
      "repository-analysis-summary",
      source.selectedRepoPath,
      source.commitOid,
      redactionIdentityScopeId,
      source.subjects
        .map((subject) => [subject.id, subject.excerptScopeId] as const)
        .toSorted(([leftId], [rightId]) => leftId.localeCompare(rightId)),
    ])
  }
  return JSON.stringify([
    "submission-summary",
    source.folderPath,
    source.contentScopeId,
    redactionIdentityScopeId,
    [[source.subject.id, source.subject.excerptScopeId]],
  ])
}
