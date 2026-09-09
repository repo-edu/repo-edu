import { z } from "zod"
import { analysisConfigFieldSchemas } from "./analysis/schemas.js"
import type { AnalysisInputs } from "./analysis-input-types.js"
import type { ValidationResult } from "./types.js"

export type { AnalysisInputs } from "./analysis-input-types.js"

const {
  maxConcurrency: _maxConcurrency,
  ...persistedAnalysisInputFieldSchemas
} = analysisConfigFieldSchemas()
void _maxConcurrency

export const analysisInputsSchema = z
  .object(persistedAnalysisInputFieldSchemas)
  .strict()
  .check(
    z.refine((data) => {
      if (data.since !== undefined && data.until !== undefined) {
        return data.since <= data.until
      }
      return true
    }, "since must be <= until"),
  )

/** Applies a patch and admits the result only when the persisted schema accepts
 * it. A document owner stores the returned value, never the raw patch, so the
 * live inputs always match what the schema will accept on save and run. */
export function admitAnalysisInputs(
  current: AnalysisInputs,
  patch: Partial<AnalysisInputs>,
): ValidationResult<AnalysisInputs> {
  const next: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  const result = analysisInputsSchema.safeParse(next)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  }
}
