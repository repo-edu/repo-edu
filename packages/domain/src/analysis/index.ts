export {
  classifyCommentLines,
  extensionToLanguage,
} from "./comment-detector.js"
export { bridgeAuthorsToRoster } from "./identity-bridge.js"
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
  DEFAULT_EXTENSIONS,
  DEFAULT_N_FILES,
  validateAnalysisBlameConfig,
  validateAnalysisConfig,
} from "./schemas.js"
export type {
  AnalysisBlameConfig,
  AnalysisCommit,
  AnalysisConfig,
  AnalysisResult,
  AnalysisRosterContext,
  AuthorDailyActivity,
  AuthorStats,
  BlameAuthorSummary,
  BlameExclusionMode,
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
