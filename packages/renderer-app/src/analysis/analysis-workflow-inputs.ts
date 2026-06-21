import type { AnalysisBlameConfig } from "@repo-edu/domain/analysis"
import type { AnalysisCore } from "@repo-edu/domain/types"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"

export const buildEffectiveBlameWorkflowConfig = (
  course: AnalysisCore,
  blameConfig: AnalysisBlameConfig,
  defaultExtensions: string[],
  maxConcurrency: number,
): AnalysisBlameConfig => {
  const config = resolveAnalysisConfig(
    course,
    defaultExtensions,
    maxConcurrency,
  )
  return {
    ...blameConfig,
    subfolder: config.subfolder,
    extensions: config.extensions,
    includeFiles: config.includeFiles,
    excludeFiles: config.excludeFiles,
    excludeAuthors: config.excludeAuthors,
    excludeEmails: config.excludeEmails,
    whitespace: config.whitespace,
    maxConcurrency: config.maxConcurrency,
  }
}
