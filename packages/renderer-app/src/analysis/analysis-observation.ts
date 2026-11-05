import type { AnalysisResult, BlameResult } from "@repo-edu/domain/analysis"

export function selectCurrentAnalysisResult(params: {
  snapshotCommitOid: string | null
  analysisIsFetching: boolean
  analysisIsError: boolean
  data: AnalysisResult | undefined
}): AnalysisResult | null {
  if (
    params.snapshotCommitOid === null ||
    params.analysisIsFetching ||
    params.analysisIsError
  ) {
    return null
  }
  return params.data ?? null
}

export function selectCurrentBlameResult(params: {
  blameIsFetching: boolean
  blameIsError: boolean
  data: BlameResult | undefined
}): BlameResult | null {
  if (params.blameIsFetching || params.blameIsError) return null
  return params.data ?? null
}
