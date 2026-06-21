import { z } from "zod"
import { analysisConfigFieldSchemas } from "./analysis/schemas.js"

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
