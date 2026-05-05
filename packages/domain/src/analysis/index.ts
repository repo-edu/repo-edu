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
  isSupportedExtension,
  LANGUAGE_CATALOG,
  normalizeExtension,
  SUPPORTED_LANGUAGES,
} from "./language-catalog.js"
export {
  applyBlameToPersonDb,
  clonePersonDbSnapshot,
  createPersonDbFromLog,
  lookupPerson,
} from "./person-db.js"
export { mergePersonIdentities } from "./person-merge.js"
export {
  analysisBlameConfigSchema,
  analysisConfigSchema,
  validateAnalysisBlameConfig,
  validateAnalysisConfig,
} from "./schemas.js"
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
