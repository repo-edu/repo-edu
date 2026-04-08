import type { RosterMember } from "../types.js"

// ---------------------------------------------------------------------------
// Git identity primitives
// ---------------------------------------------------------------------------

export type GitAuthorIdentity = {
  name: string
  email: string
}

// ---------------------------------------------------------------------------
// Analysis config
// ---------------------------------------------------------------------------

export type BlameExclusionMode = "hide" | "show" | "remove"

export type AnalysisConfig = {
  since?: string
  until?: string
  subfolder?: string
  extensions?: string[]
  includeFiles?: string[]
  excludeFiles?: string[]
  excludeAuthors?: string[]
  excludeEmails?: string[]
  excludeRevisions?: string[]
  excludeMessages?: string[]
  nFiles?: number
  whitespace?: boolean
  maxConcurrency?: number
  blameSkip?: boolean
}

export type AnalysisBlameConfig = {
  subfolder?: string
  extensions?: string[]
  includeFiles?: string[]
  excludeFiles?: string[]
  excludeAuthors?: string[]
  excludeEmails?: string[]
  whitespace?: boolean
  maxConcurrency?: number
  copyMove?: number
  includeEmptyLines?: boolean
  includeComments?: boolean
  blameExclusions?: BlameExclusionMode
  ignoreRevsFile?: boolean
}

// ---------------------------------------------------------------------------
// Commit and stats
// ---------------------------------------------------------------------------

export type AnalysisCommit = {
  sha: string
  authorName: string
  authorEmail: string
  timestamp: number
  message: string
  files: {
    path: string
    insertions: number
    deletions: number
  }[]
}

export type AuthorStats = {
  personId: string
  canonicalName: string
  canonicalEmail: string
  commits: number
  insertions: number
  deletions: number
  lines: number
  linesPercent: number
  insertionsPercent: number
  stability: number
  age: number
  commitShas: Set<string>
}

export type FileStats = {
  path: string
  commits: number
  insertions: number
  deletions: number
  lines: number
  stability: number
  lastModified: number
  commitShas: Set<string>
  authorBreakdown: Map<
    string,
    {
      insertions: number
      deletions: number
      commits: number
      commitShas: Set<string>
    }
  >
}

// ---------------------------------------------------------------------------
// Blame
// ---------------------------------------------------------------------------

export type BlameLine = {
  sha: string
  authorName: string
  authorEmail: string
  timestamp: number
  lineNumber: number
  content: string
  message: string
}

export type FileBlame = {
  path: string
  lines: BlameLine[]
}

export type BlameAuthorSummary = {
  personId: string
  canonicalName: string
  canonicalEmail: string
  lines: number
  linesPercent: number
}

// ---------------------------------------------------------------------------
// Person merging
// ---------------------------------------------------------------------------

export type MergeEvidence = "email-link" | "name-only"

export type PersonAlias = {
  name: string
  email: string
  evidence: MergeEvidence
}

export type MergedPerson = {
  id: string
  canonicalName: string
  canonicalEmail: string
  aliases: PersonAlias[]
  commitCount: number
  evidence: MergeEvidence[]
}

export type PersonMergeResult = {
  persons: MergedPerson[]
}

// ---------------------------------------------------------------------------
// PersonDB
// ---------------------------------------------------------------------------

export type PersonRecord = {
  id: string
  canonicalName: string
  canonicalEmail: string
  aliases: PersonAlias[]
  commitCount: number
}

export type PersonDbSnapshot = {
  persons: PersonRecord[]
  identityIndex: Map<string, string>
}

export type PersonDbDelta = {
  newPersons: PersonRecord[]
  newAliases: { personId: string; alias: PersonAlias }[]
  relinkedIdentities: {
    identity: string
    fromPersonId: string
    toPersonId: string
  }[]
}

// ---------------------------------------------------------------------------
// Identity bridge (git authors ↔ roster members)
// ---------------------------------------------------------------------------

export type IdentityConfidence = "exact-email" | "fuzzy-name" | "unmatched"

export type IdentityMatch = {
  personId: string
  canonicalName: string
  canonicalEmail: string
  memberId: string
  memberName: string
  confidence: IdentityConfidence
}

export type IdentityBridgeResult = {
  matches: IdentityMatch[]
  unmatchedPersonIds: string[]
  unmatchedMemberIds: string[]
}

// ---------------------------------------------------------------------------
// Roster context (passed into analysis.run when roster is available)
// ---------------------------------------------------------------------------

export type AnalysisRosterContext = {
  members: RosterMember[]
}

// ---------------------------------------------------------------------------
// Analysis result
// ---------------------------------------------------------------------------

export type AnalysisResult = {
  resolvedAsOfOid: string
  authorStats: AuthorStats[]
  fileStats: FileStats[]
  personDbBaseline: PersonDbSnapshot
  rosterMatches?: IdentityBridgeResult
}

export type BlameResult = {
  fileBlames: FileBlame[]
  authorSummaries: BlameAuthorSummary[]
  personDbOverlay: PersonDbSnapshot
  delta: PersonDbDelta
}

// ---------------------------------------------------------------------------
// Supported languages (comment detection)
// ---------------------------------------------------------------------------

export type SupportedLanguage =
  | "ada"
  | "adb"
  | "ads"
  | "c"
  | "cc"
  | "cif"
  | "cpp"
  | "cs"
  | "glsl"
  | "go"
  | "h"
  | "hh"
  | "hpp"
  | "hs"
  | "html"
  | "ily"
  | "java"
  | "js"
  | "jspx"
  | "ly"
  | "ml"
  | "mli"
  | "php"
  | "pl"
  | "po"
  | "pot"
  | "py"
  | "rb"
  | "rlib"
  | "robot"
  | "rs"
  | "scala"
  | "sql"
  | "tex"
  | "tooldef"
  | "ts"
  | "xhtml"
  | "xml"
