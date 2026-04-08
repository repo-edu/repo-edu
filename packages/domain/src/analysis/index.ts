export type {
  AnalysisBlameConfig,
  AnalysisCommit,
  AnalysisConfig,
  AnalysisResult,
  AnalysisRosterContext,
  AuthorStats,
  BlameLine,
  BlameAuthorSummary,
  BlameExclusionMode,
  BlameResult,
  FileBlame,
  FileStats,
  GitAuthorIdentity,
  IdentityBridgeResult,
  IdentityConfidence,
  IdentityMatch,
  MergeEvidence,
  MergedPerson,
  PersonAlias,
  PersonDbDelta,
  PersonDbSnapshot,
  PersonMergeResult,
  PersonRecord,
  SupportedLanguage,
} from "./types.js"

export {
  analysisBlameConfigSchema,
  analysisConfigSchema,
  DEFAULT_EXTENSIONS,
  DEFAULT_N_FILES,
  validateAnalysisBlameConfig,
  validateAnalysisConfig,
} from "./schemas.js"

export { mergePersonIdentities } from "./person-merge.js"

export {
  applyBlameToPersonDb,
  clonePersonDbSnapshot,
  createPersonDbFromLog,
  lookupPerson,
} from "./person-db.js"

export { bridgeAuthorsToRoster } from "./identity-bridge.js"

export {
  classifyCommentLines,
  extensionToLanguage,
} from "./comment-detector.js"
