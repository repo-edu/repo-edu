import {
  type AnalysisBlameConfig,
  type AnalysisConfig,
  MAX_ANALYSIS_WORKFLOW_CONCURRENCY,
} from "@repo-edu/domain/analysis"

export const buildEffectiveBlameWorkflowConfig = (
  analysisConfig: AnalysisConfig,
  blameConfig: AnalysisBlameConfig,
  maxConcurrency: number,
): AnalysisBlameConfig => {
  const workflowConcurrency = Math.min(
    maxConcurrency,
    MAX_ANALYSIS_WORKFLOW_CONCURRENCY,
  )
  return {
    ...blameConfig,
    subfolder: analysisConfig.subfolder,
    extensions: analysisConfig.extensions,
    includeFiles: analysisConfig.includeFiles,
    excludeFiles: analysisConfig.excludeFiles,
    excludeAuthors: analysisConfig.excludeAuthors,
    excludeEmails: analysisConfig.excludeEmails,
    whitespace: analysisConfig.whitespace,
    maxConcurrency: workflowConcurrency,
  }
}
