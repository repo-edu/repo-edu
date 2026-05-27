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

export type CourseExaminationSource = {
  kind: "course"
  selectedRepoPath: string
  commitOid: string
  subjects: SourceSubject[]
  localIdentityContext: ExaminationLocalIdentityContext
  rosterWarningBySubjectId: ReadonlyMap<string, string | null>
}

export type SubmissionExaminationSource = {
  kind: "submission"
  folderPath: string
  contentScopeId: string
  subject: SourceSubject
  localIdentityContext: ExaminationLocalIdentityContext
  excerpts: ExaminationCodeExcerpt[]
  excerptFileSources: Record<string, string>
}

export type ExaminationSource =
  | CourseExaminationSource
  | SubmissionExaminationSource

export type CourseSourceIdentity = {
  kind: "course"
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
  redactionIdentityScopeId: string
  questionCount: number
  model: string
  effort: LlmEffort
}

export type SourceIdentity = CourseSourceIdentity | SubmissionSourceIdentity

export function sourceCarrierKey(source: ExaminationSource): string {
  if (source.kind === "course") {
    return JSON.stringify(["course", source.selectedRepoPath, source.commitOid])
  }
  return JSON.stringify(["submission", source.folderPath])
}

export function sourceSubjects(source: ExaminationSource): SourceSubject[] {
  return source.kind === "course" ? source.subjects : [source.subject]
}

export function getSourceSubject(
  source: ExaminationSource,
  subjectId: string | null,
): SourceSubject | null {
  if (source.kind === "submission") return source.subject
  if (subjectId === null) return null
  return source.subjects.find((subject) => subject.id === subjectId) ?? null
}

export function buildCourseSourceIdentity(params: {
  source: CourseExaminationSource
  subjectId: string
  excerptScopeId: string
  questionCount: number
  model: string
  effort: LlmEffort
}): CourseSourceIdentity {
  return {
    kind: "course",
    repoPath: params.source.selectedRepoPath,
    commitOid: params.source.commitOid,
    subjectId: params.subjectId,
    excerptScopeId: params.excerptScopeId,
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
    redactionIdentityScopeId: buildExaminationRedactionIdentityScopeId(
      params.source.localIdentityContext,
    ),
    questionCount: params.questionCount,
    model: params.model,
    effort: params.effort,
  }
}

export function buildProvisionalCourseExcerptScopeId(params: {
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
