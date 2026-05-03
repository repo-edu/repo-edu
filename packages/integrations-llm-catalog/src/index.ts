export const packageId = "@repo-edu/integrations-llm-catalog"

export {
  allCatalogSpecs,
  codingAgentProviders,
  getExaminationDefaultSpec,
  getSpecByCode,
  getVerifyDefaultSpec,
  listCatalogSpecsForProvider,
  listCodes,
  listCodesForTierStem,
  tierOf,
} from "./catalog"
export {
  archivalModelCode,
  formatModelSpec,
  ModelCodeError,
  modelCode,
  parseShortCode,
} from "./codes"
export {
  formatCostByMode,
  getPriceCard,
  PRICING,
  tokenCostUsd,
} from "./pricing"

export { parseRepoDirCode, type RepoDirParse } from "./repo-dir"
export type {
  FixtureModelSpec,
  Phase,
  PriceCard,
  SupportedEfforts,
} from "./types"
