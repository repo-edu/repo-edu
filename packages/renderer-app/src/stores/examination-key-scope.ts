import { analysisSourceKeyScopeId } from "../components/tabs/examination/source.js"
import type { AnalysisSourceKey } from "../session/session-reducer.js"

function scopedExaminationKeyParts(
  key: string,
  analysisSourceKey?: AnalysisSourceKey | null,
): unknown[] | null {
  try {
    const parsed = JSON.parse(key) as unknown
    if (!Array.isArray(parsed)) return null
    if (parsed[0] !== "analysis-source") {
      return analysisSourceKey === undefined ? parsed : null
    }
    if (analysisSourceKey !== undefined) {
      const scope = analysisSourceKeyScopeId(analysisSourceKey)
      if (JSON.stringify(parsed[1]) !== scope) return null
    }
    return Array.isArray(parsed[2]) ? parsed[2] : null
  } catch (_error) {
    return null
  }
}

export function examinationKeyMatchesSourceScope(
  key: string,
  analysisSourceKey?: AnalysisSourceKey | null,
): boolean {
  return scopedExaminationKeyParts(key, analysisSourceKey) !== null
}

export function repositoryAnalysisSummaryMatchesRepoPath(
  sourceSummaryKey: string,
  repoPath: string | null,
  analysisSourceKey?: AnalysisSourceKey | null,
): boolean {
  const parsed = scopedExaminationKeyParts(sourceSummaryKey, analysisSourceKey)
  if (parsed === null) return false
  if (parsed[0] !== "repository-analysis-summary") return false
  return repoPath === null || parsed[1] === repoPath
}

export function submissionSummaryMatchesFolderPath(
  sourceSummaryKey: string,
  folderPath: string,
  analysisSourceKey?: AnalysisSourceKey | null,
): boolean {
  const parsed = scopedExaminationKeyParts(sourceSummaryKey, analysisSourceKey)
  if (parsed === null) return false
  if (parsed[0] !== "submission-summary") return false
  return parsed[1] === folderPath
}
