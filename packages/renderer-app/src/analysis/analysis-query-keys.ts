import type {
  AnalysisBlameConfig,
  AnalysisConfig,
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
}

function uniqueSortedStrings(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort((left, right) =>
    left.localeCompare(right),
  )
}

function normalizedPatternList(
  values: readonly string[] | undefined,
  options: { readonly defaultAll?: boolean } = {},
): readonly string[] | undefined {
  const sorted = uniqueSortedStrings(
    values?.map((value) => value.trim()).filter((value) => value.length > 0),
  )
  if (options.defaultAll && sorted.length === 1 && sorted[0] === "*") {
    return undefined
  }
  return sorted.length === 0 ? undefined : sorted
}

function normalizedExtensions(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  const sorted = uniqueSortedStrings(
    values
      ?.map((value) => value.trim().toLowerCase().replace(/^\./, ""))
      .filter((value) => value.length > 0),
  )
  return sorted.length === 0 ? undefined : sorted
}

function optionalString(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
}

function optionalSubfolder(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "")
  return normalized.length === 0 ? undefined : normalized
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

export function analysisAutoDiscoveryScopeKey(
  source: AnalysisSourceKeyParts,
  folder: string,
): string {
  return JSON.stringify([source, folder])
}

export function analysisResultScopeKey(
  identity: AnalysisQueryIdentity,
): string {
  return JSON.stringify(identity)
}

function sourcePartsEqual(
  candidate: unknown,
  expected: AnalysisSourceKeyParts,
): boolean {
  if (!Array.isArray(candidate)) return false
  if (candidate.length !== expected.length) return false
  return expected.every((part, index) => candidate[index] === part)
}

export function queryKeyMatchesSourceSnapshotHead(
  queryKey: readonly unknown[],
  source: AnalysisSourceKeyParts,
): boolean {
  return (
    queryKey[0] === "analysis" &&
    queryKey[1] === "source" &&
    sourcePartsEqual(queryKey[2], source) &&
    queryKey[3] === "repo" &&
    typeof queryKey[4] === "string" &&
    queryKey[5] === "snapshot-head"
  )
}

export function buildAnalysisOutputConfigKey(
  config: AnalysisConfig,
): AnalysisOutputConfigKey {
  return {
    subfolder: optionalSubfolder(config.subfolder),
    extensions: normalizedExtensions(config.extensions),
    includeFiles: normalizedPatternList(config.includeFiles, {
      defaultAll: true,
    }),
    excludeFiles: normalizedPatternList(config.excludeFiles),
    excludeAuthors: normalizedPatternList(config.excludeAuthors),
    excludeEmails: normalizedPatternList(config.excludeEmails),
    excludeRevisions: normalizedPatternList(config.excludeRevisions),
    excludeMessages: normalizedPatternList(config.excludeMessages),
    since: optionalString(config.since),
    until: optionalString(config.until),
    whitespace: config.whitespace === true ? true : undefined,
    nFiles: config.nFiles,
  }
}

export function buildBlameOutputConfigKey(
  config: AnalysisBlameConfig,
): BlameOutputConfigKey {
  return {
    subfolder: optionalSubfolder(config.subfolder),
    extensions: normalizedExtensions(config.extensions),
    includeFiles: normalizedPatternList(config.includeFiles, {
      defaultAll: true,
    }),
    excludeFiles: normalizedPatternList(config.excludeFiles),
    excludeAuthors: normalizedPatternList(config.excludeAuthors),
    excludeEmails: normalizedPatternList(config.excludeEmails),
    whitespace: config.whitespace === true ? true : undefined,
    copyMove:
      config.copyMove === undefined || config.copyMove === 1
        ? undefined
        : config.copyMove,
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
}): BlameQueryIdentity {
  return {
    source: params.source,
    repoPath: params.repoPath,
    analysis: params.analysis,
    config: buildBlameOutputConfigKey(params.config),
  }
}

export const analysisQueryKeys = {
  all: () => ["analysis"] as const,
  source: (source: AnalysisSourceKeyParts) =>
    ["analysis", "source", source] as const,
  sourceRepos: (source: AnalysisSourceKeyParts) =>
    ["analysis", "source", source, "repo"] as const,
  repo: (source: AnalysisSourceKeyParts, repoPath: string) =>
    ["analysis", "source", source, "repo", repoPath] as const,
  discovery: (source: AnalysisSourceKeyParts, folder: string, depth: number) =>
    ["analysis", "source", source, "discovery", folder, depth] as const,
  repoSnapshotHeads: (source: AnalysisSourceKeyParts, repoPath: string) =>
    ["analysis", "source", source, "repo", repoPath, "snapshot-head"] as const,
  snapshotHead: (params: {
    source: AnalysisSourceKeyParts
    repoPath: string
    until: string | null
  }) =>
    [
      "analysis",
      "source",
      params.source,
      "repo",
      params.repoPath,
      "snapshot-head",
      params.until,
    ] as const,
  repoResults: (source: AnalysisSourceKeyParts, repoPath: string) =>
    ["analysis", "source", source, "repo", repoPath, "result"] as const,
  result: (identity: AnalysisQueryIdentity) =>
    [
      "analysis",
      "source",
      identity.source,
      "repo",
      identity.repoPath,
      "result",
      identity,
    ] as const,
  repoBlames: (source: AnalysisSourceKeyParts, repoPath: string) =>
    ["analysis", "source", source, "repo", repoPath, "blame"] as const,
  blame: (identity: BlameQueryIdentity) =>
    [
      "analysis",
      "source",
      identity.source,
      "repo",
      identity.repoPath,
      "blame",
      identity,
    ] as const,
}
