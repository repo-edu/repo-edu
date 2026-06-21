export { classifyCommentLines } from "./comment-detector.js"
export type {
  AnalysisBlameConfig,
  AnalysisConfig,
} from "./config-types.js"
export { bridgeAuthorsToRoster } from "./identity-bridge.js"
export type { LanguageEntry } from "./language-catalog.js"
export {
  DEFAULT_EXTENSIONS,
  extensionToLanguage,
  LANGUAGE_CATALOG,
  normalizeExtension,
  SUPPORTED_LANGUAGES,
} from "./language-catalog.js"
export type {
  Token,
  TokenKind,
} from "./language-tokenizer.js"
export {
  extensionToTokenizerLanguage,
  isTokenizerSupportedLanguage,
  tokenizeSource,
} from "./language-tokenizer.js"
export {
  applyBlameToPersonDb,
  buildPersonDbIdentityKey,
  clonePersonDbSnapshot,
  createPersonDbFromLog,
  lookupPerson,
} from "./person-db.js"
export { mergePersonIdentities } from "./person-merge.js"
export {
  analysisBlameConfigSchema,
  analysisConfigSchema,
  MAX_ANALYSIS_WORKFLOW_CONCURRENCY,
  validateAnalysisBlameConfig,
  validateAnalysisConfig,
} from "./schemas.js"
export type {
  LoadedTokenizerLanguage,
  TokenizerSupportedLanguage,
} from "./tokenizer-language.js"
export { TOKENIZER_SUPPORTED_LANGUAGES } from "./tokenizer-language.js"
export type {
  AnalysisCommit,
  AnalysisResult,
  AnalysisRosterContext,
  AuthorDailyActivity,
  AuthorStats,
  BlameAuthorSummary,
  BlameFileSummary,
  BlameLine,
  BlameResult,
  FileBlame,
  FileStats,
  GitAuthorIdentity,
  IdentityBridgeResult,
  IdentityConfidence,
  IdentityMatch,
  MergedPerson,
  MergeEvidence,
  PersonAlias,
  PersonDbDelta,
  PersonDbSnapshot,
  PersonMergeResult,
  PersonRecord,
  SupportedLanguage,
} from "./types.js"
