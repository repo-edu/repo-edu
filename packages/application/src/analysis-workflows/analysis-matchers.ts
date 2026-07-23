import {
  compileAnalysisFilterPatterns,
  type PatternPredicate,
} from "@repo-edu/domain/pattern-matching"
import type { ValidationIssue, ValidationResult } from "@repo-edu/domain/types"

export type CompiledAnalysisMatchers = Readonly<{
  includeFiles: PatternPredicate
  excludeFiles: PatternPredicate
  excludeMessages: PatternPredicate
  excludeAuthors: PatternPredicate
  excludeEmails: PatternPredicate
}>

type AnalysisMatcherConfig = {
  includeFiles?: readonly string[]
  excludeFiles?: readonly string[]
  excludeMessages?: readonly string[]
  excludeAuthors?: readonly string[]
  excludeEmails?: readonly string[]
}

function compileField(
  field: keyof CompiledAnalysisMatchers,
  patterns: readonly string[],
): ValidationResult<PatternPredicate> {
  const result = compileAnalysisFilterPatterns(patterns)
  if (result.ok) return result

  return {
    ok: false,
    issues: result.issues.map(
      (issue): ValidationIssue => ({
        path: issue.path.startsWith("patterns.")
          ? `${field}.${issue.path.slice("patterns.".length)}`
          : field,
        message: issue.message,
      }),
    ),
  }
}

export function createCompiledAnalysisMatchers(
  config: AnalysisMatcherConfig,
): ValidationResult<CompiledAnalysisMatchers> {
  const fields = [
    ["includeFiles", config.includeFiles ?? ["*"]],
    ["excludeFiles", config.excludeFiles ?? []],
    ["excludeMessages", config.excludeMessages ?? []],
    ["excludeAuthors", config.excludeAuthors ?? []],
    ["excludeEmails", config.excludeEmails ?? []],
  ] as const

  const compiled = {} as Record<
    keyof CompiledAnalysisMatchers,
    PatternPredicate
  >
  for (const [field, patterns] of fields) {
    const result = compileField(field, patterns)
    if (!result.ok) return result
    compiled[field] = result.value
  }

  return {
    ok: true,
    value: Object.freeze(compiled),
  }
}
