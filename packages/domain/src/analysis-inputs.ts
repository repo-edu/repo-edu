import { z } from "zod"
import type { AnalysisConfig } from "./analysis/config-types.js"
import { analysisConfigFieldSchemas } from "./analysis/schemas.js"

export type AnalysisInputs = Omit<AnalysisConfig, "maxConcurrency">

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
