import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisResult,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import type { AnalysisSourceKey } from "../session/session-reducer.js"

export type AnalysisSourceKeyParts =
  | readonly ["none"]
  | readonly ["course", string]
  | readonly ["folder", string]
  | readonly ["submission", string, string | null]

export type AnalysisOutputConfigKey = {
  readonly subfolder?: string
  readonly extensions?: readonly string[]
  readonly includeFiles?: readonly string[]
  readonly excludeFiles?: readonly string[]
  readonly excludeAuthors?: readonly string[]
  readonly excludeEmails?: readonly string[]
  readonly excludeRevisions?: readonly string[]
  readonly excludeMessages?: readonly string[]
  readonly since?: string
  readonly until?: string
  readonly whitespace?: boolean
  readonly nFiles?: number
}

export type BlameOutputConfigKey = {
  readonly subfolder?: string
  readonly extensions?: readonly string[]
  readonly includeFiles?: readonly string[]
  readonly excludeFiles?: readonly string[]
  readonly excludeAuthors?: readonly string[]
  readonly excludeEmails?: readonly string[]
  readonly whitespace?: boolean
  readonly copyMove?: number
}

export type RosterOutputContextKey = readonly {
  readonly id: string
  readonly name: string
  readonly email: string | null
}[]

export type AnalysisQueryIdentity = {
  readonly source: AnalysisSourceKeyParts
  readonly repoPath: string
  readonly snapshotCommitOid: string
  readonly config: AnalysisOutputConfigKey
  readonly roster: RosterOutputContextKey
}

export type BlameQueryIdentity = {
  readonly source: AnalysisSourceKeyParts
  readonly repoPath: string
  readonly analysis: AnalysisQueryIdentity
  readonly config: BlameOutputConfigKey
  readonly files: readonly string[]
}

function sortedStrings(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right))
}

function nonEmptyStrings(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  const sorted = sortedStrings(values)
  return sorted.length === 0 ? undefined : sorted
}

function optionalString(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
}

export function analysisSourceKeyParts(
  sourceKey: AnalysisSourceKey | null,
): AnalysisSourceKeyParts {
  if (sourceKey === null) return ["none"]
  if (sourceKey.kind === "course") return ["course", sourceKey.courseId]
  if (sourceKey.kind === "folder") return ["folder", sourceKey.path]
  return ["submission", sourceKey.path, sourceKey.courseId]
}

export function analysisSourceScopeKey(source: AnalysisSourceKeyParts): string {
  return JSON.stringify(source)
}

export function analysisResultScopeKey(
  identity: AnalysisQueryIdentity,
): string {
  return JSON.stringify(identity)
}

export function buildAnalysisOutputConfigKey(
  config: AnalysisConfig,
): AnalysisOutputConfigKey {
  return {
    subfolder: optionalString(config.subfolder),
    extensions: nonEmptyStrings(config.extensions),
    includeFiles: nonEmptyStrings(config.includeFiles),
    excludeFiles: nonEmptyStrings(config.excludeFiles),
    excludeAuthors: nonEmptyStrings(config.excludeAuthors),
    excludeEmails: nonEmptyStrings(config.excludeEmails),
    excludeRevisions: nonEmptyStrings(config.excludeRevisions),
    excludeMessages: nonEmptyStrings(config.excludeMessages),
    since: optionalString(config.since),
    until: optionalString(config.until),
    whitespace: config.whitespace,
    nFiles: config.nFiles,
  }
}

export function buildBlameOutputConfigKey(
  config: AnalysisBlameConfig,
): BlameOutputConfigKey {
  return {
    subfolder: optionalString(config.subfolder),
    extensions: nonEmptyStrings(config.extensions),
    includeFiles: nonEmptyStrings(config.includeFiles),
    excludeFiles: nonEmptyStrings(config.excludeFiles),
    excludeAuthors: nonEmptyStrings(config.excludeAuthors),
    excludeEmails: nonEmptyStrings(config.excludeEmails),
    whitespace: config.whitespace,
    copyMove: config.copyMove,
  }
}

export function buildRosterOutputContextKey(
  rosterContext: AnalysisRosterContext | undefined,
): RosterOutputContextKey {
  return [...(rosterContext?.members ?? [])]
    .map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function buildAnalysisQueryIdentity(params: {
  source: AnalysisSourceKeyParts
  repoPath: string
  snapshotCommitOid: string
  config: AnalysisConfig
  rosterContext: AnalysisRosterContext | undefined
}): AnalysisQueryIdentity {
  return {
    source: params.source,
    repoPath: params.repoPath,
    snapshotCommitOid: params.snapshotCommitOid,
    config: buildAnalysisOutputConfigKey(params.config),
    roster: buildRosterOutputContextKey(params.rosterContext),
  }
}

export function buildBlameQueryIdentity(params: {
  source: AnalysisSourceKeyParts
  repoPath: string
  analysis: AnalysisQueryIdentity
  config: AnalysisBlameConfig
  result: AnalysisResult
}): BlameQueryIdentity {
  return {
    source: params.source,
    repoPath: params.repoPath,
    analysis: params.analysis,
    config: buildBlameOutputConfigKey(params.config),
    files: params.result.fileStats
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right)),
  }
}

export const analysisQueryKeys = {
  all: () => ["analysis"] as const,
  source: (source: AnalysisSourceKeyParts) =>
    ["analysis", "source", source] as const,
  discovery: (source: AnalysisSourceKeyParts, folder: string, depth: number) =>
    ["analysis", "source", source, "discovery", folder, depth] as const,
  snapshotHead: (params: {
    source: AnalysisSourceKeyParts
    repoPath: string
    asOfCommit: string | null
    until: string | null
  }) =>
    [
      "analysis",
      "source",
      params.source,
      "snapshot-head",
      params.repoPath,
      params.asOfCommit,
      params.until,
    ] as const,
  result: (identity: AnalysisQueryIdentity) =>
    ["analysis", "result", identity] as const,
  blame: (identity: BlameQueryIdentity) =>
    ["analysis", "blame", identity] as const,
}
