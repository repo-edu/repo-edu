import type { AppError, DiagnosticOutput } from "@repo-edu/application-contract"
import type { AnalysisCommit, AnalysisConfig } from "@repo-edu/domain/analysis"
import type { GitCommandPort } from "@repo-edu/host-runtime-contract"
import { fnmatchFilter } from "./filter-utils.js"
import { LOG_PRETTY_FORMAT } from "./log-parser.js"

// ---------------------------------------------------------------------------
// Git helper commands
// ---------------------------------------------------------------------------

/**
 * Resolves the commit OID to use as the analysis snapshot head.
 *
 * Priority:
 * 1. Explicit `asOfCommit` — validate it resolves in the repo.
 * 2. `config.until` — find the top commit at or before that date.
 * 3. Repository HEAD.
 */
export async function resolveSnapshotHead(
  gitCommand: GitCommandPort,
  repoRoot: string,
  asOfCommit: string | undefined,
  until: string | undefined,
  signal: AbortSignal | undefined,
  onOutput?: (event: DiagnosticOutput) => void,
): Promise<string> {
  if (asOfCommit) {
    const result = await gitCommand.run({
      args: ["rev-parse", "--verify", `${asOfCommit}^{commit}`],
      cwd: repoRoot,
      signal,
    })
    if (result.exitCode !== 0) {
      throw {
        type: "validation",
        message: `asOfCommit '${asOfCommit}' does not resolve to a valid commit.`,
        issues: [
          {
            path: "asOfCommit",
            message: result.stderr.trim() || "Invalid commit reference",
          },
        ],
      } satisfies AppError
    }
    const resolvedOid = result.stdout.trim()
    if (resolvedOid.length === 0) {
      throw {
        type: "validation",
        message: `asOfCommit '${asOfCommit}' does not resolve to a valid commit.`,
        issues: [
          {
            path: "asOfCommit",
            message: "Git returned an empty commit oid.",
          },
        ],
      } satisfies AppError
    }
    return resolvedOid
  }

  if (until) {
    const result = await gitCommand.run({
      args: ["rev-list", "-1", `--until=${until}`, "HEAD"],
      cwd: repoRoot,
      signal,
    })
    if (result.exitCode === 0 && result.stdout.trim().length > 0) {
      return result.stdout.trim()
    }
    // Fallback to HEAD with diagnostic
    onOutput?.({
      channel: "warn",
      message: `No commits found before ${until}, using repository HEAD.`,
    })
  }

  const result = await gitCommand.run({
    args: ["rev-parse", "HEAD"],
    cwd: repoRoot,
    signal,
  })
  if (result.exitCode !== 0) {
    throw {
      type: "provider",
      message: `Failed to resolve repository HEAD: ${result.stderr.trim()}`,
      provider: "git",
      operation: "rev-parse",
      retryable: false,
    } satisfies AppError
  }
  const headOid = result.stdout.trim()
  if (headOid.length === 0) {
    throw {
      type: "provider",
      message: "Failed to resolve repository HEAD: git returned an empty oid.",
      provider: "git",
      operation: "rev-parse",
      retryable: false,
    } satisfies AppError
  }
  return headOid
}

// ---------------------------------------------------------------------------
// File candidate listing from snapshot tree
// ---------------------------------------------------------------------------

type TreeEntry = {
  path: string
  size: number
}

/**
 * Lists files present in the snapshot commit tree via `git ls-tree`.
 * Returns file paths and blob sizes for nFiles ranking.
 */
export async function listSnapshotFiles(
  gitCommand: GitCommandPort,
  repoRoot: string,
  commitOid: string,
  signal: AbortSignal | undefined,
): Promise<TreeEntry[]> {
  const result = await gitCommand.run({
    args: ["ls-tree", "-r", "-l", "--full-name", commitOid],
    cwd: repoRoot,
    signal,
  })
  if (result.exitCode !== 0) {
    throw {
      type: "provider",
      message: `Failed to list tree for ${commitOid}: ${result.stderr.trim()}`,
      provider: "git",
      operation: "ls-tree",
      retryable: false,
    } satisfies AppError
  }

  const entries: TreeEntry[] = []
  for (const line of result.stdout.split("\n")) {
    if (line.trim().length === 0) continue
    // Format: <mode> <type> <oid> <size>\t<path>
    const tabIndex = line.indexOf("\t")
    if (tabIndex === -1) continue
    const metaParts = line.slice(0, tabIndex).split(/\s+/)
    const path = line.slice(tabIndex + 1)
    if (metaParts[1] !== "blob") continue
    const size = Number.parseInt(metaParts[3], 10)
    entries.push({ path, size: Number.isNaN(size) ? 0 : size })
  }

  return entries
}

// ---------------------------------------------------------------------------
// File filtering pipeline
// ---------------------------------------------------------------------------

/**
 * Applies the analysis file filtering pipeline (Python parity):
 * subfolder → extensions → excludeFiles → includeFiles → nFiles
 *
 * Returns filtered file paths in deterministic sorted order.
 */
export function filterFileCandidates(
  entries: TreeEntry[],
  config: AnalysisConfig,
): string[] {
  const subfolder = config.subfolder
  const extensions = config.extensions ?? []
  const excludeFiles = config.excludeFiles ?? []
  const includeFiles = config.includeFiles ?? ["*"]
  const nFiles = config.nFiles ?? 5

  let filtered = entries

  // 1. Subfolder scope
  if (subfolder) {
    const prefix = subfolder.endsWith("/") ? subfolder : `${subfolder}/`
    filtered = filtered.filter((e) => e.path.startsWith(prefix))
  }

  // 2. Extensions allowlist
  if (extensions.length > 0 && !extensions.includes("*")) {
    const extSet = new Set(extensions.map((e) => e.toLowerCase()))
    filtered = filtered.filter((e) => {
      const dotIndex = e.path.lastIndexOf(".")
      if (dotIndex === -1) return false
      return extSet.has(e.path.slice(dotIndex + 1).toLowerCase())
    })
  }

  // 3. Exclude files
  if (excludeFiles.length > 0) {
    filtered = filtered.filter((e) => {
      const relPath = subfolder
        ? e.path.slice(
            (subfolder.endsWith("/") ? subfolder : `${subfolder}/`).length,
          )
        : e.path
      return !fnmatchFilter(relPath, excludeFiles)
    })
  }

  // 4. Include files
  if (
    includeFiles.length > 0 &&
    !(includeFiles.length === 1 && includeFiles[0] === "*")
  ) {
    filtered = filtered.filter((e) => {
      const relPath = subfolder
        ? e.path.slice(
            (subfolder.endsWith("/") ? subfolder : `${subfolder}/`).length,
          )
        : e.path
      return fnmatchFilter(relPath, includeFiles)
    })
  }

  // Sort by size descending for nFiles selection, then by path for determinism
  filtered.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))

  // 5. nFiles truncation (0 = all files)
  if (nFiles > 0) {
    filtered = filtered.slice(0, nFiles)
  }

  // Return in deterministic sorted path order for processing
  return filtered.map((e) => e.path).sort()
}

// ---------------------------------------------------------------------------
// Per-file git log --follow
// ---------------------------------------------------------------------------

/**
 * Builds git log arguments for per-file `--follow` traversal.
 */
export function buildPerFileLogArgs(
  commitOid: string,
  filePath: string,
  config: AnalysisConfig,
): string[] {
  const args = ["log"]

  if (config.since) args.push(`--since=${config.since}`)
  if (config.until) args.push(`--until=${config.until}`)
  if (!config.whitespace) args.push("-w")

  args.push(
    commitOid,
    "--follow",
    "--numstat",
    `-z`,
    `--pretty=format:${LOG_PRETTY_FORMAT}`,
    "--",
    filePath,
  )

  return args
}

// ---------------------------------------------------------------------------
// Repo-wide git log
// ---------------------------------------------------------------------------

/**
 * Builds git log arguments for a single repo-wide traversal of the snapshot
 * head. Used to drive author-level aggregates that must not depend on the
 * `nFiles` cap (commits, insertions, deletions, age, daily activity).
 *
 * Path filtering (subfolder/extensions/include/exclude) is applied later in
 * code on the parsed numstat output; this keeps the git invocation simple
 * and lets us reuse the same parser as the per-file pass.
 */
export function buildRepoWideLogArgs(
  commitOid: string,
  config: AnalysisConfig,
): string[] {
  const args = ["log"]

  if (config.since) args.push(`--since=${config.since}`)
  if (config.until) args.push(`--until=${config.until}`)
  if (!config.whitespace) args.push("-w")

  args.push(
    commitOid,
    "--numstat",
    `-z`,
    `--pretty=format:${LOG_PRETTY_FORMAT}`,
  )

  return args
}

/**
 * Filters per-commit numstat file entries against the same path filters used
 * for snapshot listing (subfolder, extensions, include, exclude). Commits
 * whose entire file list is filtered out are dropped from the result.
 *
 * The `nFiles` cap is intentionally NOT applied here — repo-wide aggregates
 * must reflect every file that matches the filters, not only the top-N.
 */
export function filterCommitsByPathScope(
  commits: AnalysisCommit[],
  config: AnalysisConfig,
): AnalysisCommit[] {
  const subfolder = config.subfolder
  const extensions = config.extensions ?? []
  const excludeFiles = config.excludeFiles ?? []
  const includeFiles = config.includeFiles ?? ["*"]

  const subfolderPrefix = subfolder
    ? subfolder.endsWith("/")
      ? subfolder
      : `${subfolder}/`
    : ""
  const extSet =
    extensions.length > 0 && !extensions.includes("*")
      ? new Set(extensions.map((e) => e.toLowerCase()))
      : undefined
  const includeAll =
    includeFiles.length === 0 ||
    (includeFiles.length === 1 && includeFiles[0] === "*")

  const matchesScope = (rawPath: string): boolean => {
    let path = rawPath
    if (subfolderPrefix) {
      if (!path.startsWith(subfolderPrefix)) return false
      path = path.slice(subfolderPrefix.length)
    }
    if (extSet) {
      const dotIndex = path.lastIndexOf(".")
      if (dotIndex === -1) return false
      if (!extSet.has(path.slice(dotIndex + 1).toLowerCase())) return false
    }
    if (excludeFiles.length > 0 && fnmatchFilter(path, excludeFiles)) {
      return false
    }
    if (!includeAll && !fnmatchFilter(path, includeFiles)) {
      return false
    }
    return true
  }

  const filtered: AnalysisCommit[] = []
  for (const commit of commits) {
    const files = commit.files.filter((f) => matchesScope(f.path))
    if (files.length === 0) continue
    filtered.push({ ...commit, files })
  }
  return filtered
}

// ---------------------------------------------------------------------------
// Commit-level exclusion (post-filter, Python parity)
// ---------------------------------------------------------------------------

/**
 * Applies post-parse commit-level exclusions:
 * - `excludeRevisions`: SHA prefix matching
 * - `excludeMessages`: case-insensitive fnmatch on full message
 */
export function applyCommitExclusions(
  commits: AnalysisCommit[],
  config: AnalysisConfig,
): AnalysisCommit[] {
  const excludeRevisions = config.excludeRevisions ?? []
  const excludeMessages = config.excludeMessages ?? []

  if (excludeRevisions.length === 0 && excludeMessages.length === 0) {
    return commits
  }

  return commits.filter((commit) => {
    // SHA prefix matching for revision exclusion
    if (excludeRevisions.some((prefix) => commit.sha.startsWith(prefix))) {
      return false
    }

    // Case-insensitive fnmatch for message exclusion
    if (fnmatchFilter(commit.message, excludeMessages)) {
      return false
    }

    return true
  })
}

// ---------------------------------------------------------------------------
// Overlap reduction (Python parity)
// ---------------------------------------------------------------------------

/**
 * Commit group representation for overlap reduction.
 * Groups consecutive commits with the same author + file combination.
 */
export type CommitGroup = {
  author: string
  path: string
  insertions: number
  deletions: number
  dateSum: number
  shas: Set<string>
  latestTimestamp?: number
}

/**
 * Converts a file's commit list into commit groups (Python parity).
 * Consecutive commits by the same author for the same file are grouped.
 */
export function buildCommitGroups(
  commits: AnalysisCommit[],
  filePath: string,
): CommitGroup[] {
  const groups: CommitGroup[] = []

  for (const commit of commits) {
    const fileEntry = commit.files.find((f) => f.path === filePath)
    if (!fileEntry) continue

    const authorKey = `${commit.authorName}\0${commit.authorEmail}`
    const last = groups[groups.length - 1]

    if (last && `${last.author}` === authorKey && last.path === filePath) {
      last.insertions += fileEntry.insertions
      last.deletions += fileEntry.deletions
      last.dateSum += commit.timestamp * fileEntry.insertions
      last.shas.add(commit.sha)
      last.latestTimestamp = Math.max(
        last.latestTimestamp ?? 0,
        commit.timestamp,
      )
    } else {
      groups.push({
        author: authorKey,
        path: filePath,
        insertions: fileEntry.insertions,
        deletions: fileEntry.deletions,
        dateSum: commit.timestamp * fileEntry.insertions,
        shas: new Set([commit.sha]),
        latestTimestamp: commit.timestamp,
      })
    }
  }

  return groups
}

/**
 * Reduces overlap across per-file commit group lists (Python parity).
 *
 * Algorithm: sort files ascending by commit-group count. Process from
 * longest to shortest — for each file's tail commit groups, remove matching
 * trailing groups from shorter files.
 *
 * This removes duplicate rename-history tails when `--follow` traces a
 * renamed file's history across two paths.
 */
export function reduceCommitGroupOverlap(
  fileGroupsMap: Map<string, CommitGroup[]>,
): void {
  const files = [...fileGroupsMap.keys()]
  files.sort(
    (a, b) =>
      (fileGroupsMap.get(a)?.length ?? 0) - (fileGroupsMap.get(b)?.length ?? 0),
  )

  while (files.length > 0) {
    const longest = files.pop()
    if (!longest) break
    const longestGroups = fileGroupsMap.get(longest)
    if (!longestGroups) continue

    for (const shorter of files) {
      const shorterGroups = fileGroupsMap.get(shorter)
      if (!shorterGroups) continue
      let i = -1
      while (
        shorterGroups.length > 0 &&
        Math.abs(i) <= longestGroups.length &&
        commitGroupsEqual(
          longestGroups[longestGroups.length + i],
          shorterGroups[shorterGroups.length - 1],
        )
      ) {
        shorterGroups.pop()
        i--
      }
    }
  }
}

function commitGroupsEqual(
  a: CommitGroup | undefined,
  b: CommitGroup | undefined,
): boolean {
  if (!a || !b) return false
  return (
    a.author === b.author &&
    a.insertions === b.insertions &&
    a.deletions === b.deletions &&
    a.shas.size === b.shas.size &&
    [...a.shas].every((sha) => b.shas.has(sha))
  )
}
