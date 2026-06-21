import type { AnalysisConfig } from "./analysis/config-types.js"

export type AnalysisInputs = Omit<AnalysisConfig, "maxConcurrency">
