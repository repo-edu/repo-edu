import type { LlmEffort } from "@repo-edu/integrations-llm-contract"

export function canShowExaminationView(blameSkip: boolean): boolean {
  return !blameSkip
}

export function resolveExaminationEmptyState(params: {
  selectedRepositoryPath: string | null
  hasBlameResult: boolean
  authorCount: number
  selectedPersonId: string | null
}): string | null {
  if (params.selectedRepositoryPath === null) {
    return "Select a repository to choose an author for examination questions."
  }
  if (!params.hasBlameResult || params.authorCount === 0) {
    return "Run blame analysis to identify authors in this repository."
  }
  if (params.selectedPersonId === null) {
    return "Choose an author or contributor from the list to generate questions."
  }
  return null
}

export function resolveExaminationBlockingReason(params: {
  selectedRepositoryPath: string | null
  commitOid: string
  hasActiveLlmConnection: boolean
}): string | null {
  if (params.selectedRepositoryPath === null) {
    return "Select a repository in the Analysis tab first."
  }
  if (params.commitOid.length === 0) {
    return "Analysis must resolve a commit before generating examination output."
  }
  if (!params.hasActiveLlmConnection) {
    return "Add an LLM connection in Settings -> LLM Connections to generate questions."
  }
  return null
}

export function shouldShowUnmatchedRosterWarning(params: {
  analysisKind: string
  rosterPopulated: boolean
  rosterMemberId: string | null
}): boolean {
  return (
    params.analysisKind === "course" &&
    params.rosterPopulated &&
    params.rosterMemberId === null
  )
}

export function buildPendingExaminationEntryKey(params: {
  repositoryPath: string
  contentScopeId: string
  personId: string
  questionCount: number
  model: string
  effort: LlmEffort
}): string {
  return JSON.stringify([
    "examination-pending-entry-v1",
    params.repositoryPath,
    params.contentScopeId,
    params.personId,
    params.questionCount,
    params.model,
    params.effort,
  ])
}
