export function canShowExaminationView(blameSkip: boolean): boolean {
  return !blameSkip
}

export function resolveExaminationEmptyState(params: {
  selectedRepositoryPath: string | null
  hasBlameResult: boolean
  authorCount: number
}): string | null {
  if (params.selectedRepositoryPath === null) {
    return "Select a repository to choose an author for examination questions."
  }
  if (!params.hasBlameResult || params.authorCount === 0) {
    return "Run blame analysis to identify authors in this repository."
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
