import type {
  AnalysisCommit,
  AnalysisConfig,
  AnalysisResult,
  AuthorDailyActivity,
  AuthorStats,
  FileStats,
  GitAuthorIdentity,
} from "@repo-edu/domain/analysis"
import {
  bridgeAuthorsToRoster,
  createPersonDbFromLog,
  validateAnalysisConfig,
} from "@repo-edu/domain/analysis"
import type {
  AnalysisProgress,
  AnalysisRunInput,
  AppError,
  DiagnosticOutput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { createValidationAppError } from "../core.js"
import { normalizeProviderError, throwIfAborted } from "../workflow-helpers.js"
import type { AnalysisWorkflowPorts } from "./ports.js"
import { resolveAnalysisRepoRoot } from "./repo-root.js"
import { parseLogOutput } from "./log-parser.js"
import { fnmatchFilter } from "./filter-utils.js"
import {
  applyCommitExclusions,
  buildCommitGroups,
  buildPerFileLogArgs,
  filterFileCandidates,
  listSnapshotFiles,
  reduceCommitGroupOverlap,
  resolveSnapshotHead,
  type CommitGroup,
} from "./snapshot-engine.js"

// ---------------------------------------------------------------------------
// Bounded concurrent execution
// ---------------------------------------------------------------------------

async function mapBounded<T, R>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Stats aggregation
// ---------------------------------------------------------------------------

function aggregateStats(
  fileGroupsMap: Map<string, CommitGroup[]>,
  fileToSubfolderedPath: (path: string) => string,
): { authorStats: AuthorStats[]; fileStats: FileStats[] } {
  // Per-author aggregation
  const authorMap = new Map<
    string,
    {
      name: string
      email: string
      insertions: number
      deletions: number
      dateSum: number
      commitShas: Set<string>
    }
  >()

  // Per-file aggregation
  const fileMap = new Map<
    string,
    {
      insertions: number
      deletions: number
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
  >()

  // Process in deterministic sorted file order
  const sortedFiles = [...fileGroupsMap.keys()].sort()

  for (const filePath of sortedFiles) {
    const groups = fileGroupsMap.get(filePath)
    if (!groups) continue
    const displayPath = fileToSubfolderedPath(filePath)

    if (!fileMap.has(displayPath)) {
      fileMap.set(displayPath, {
        insertions: 0,
        deletions: 0,
        lastModified: 0,
        commitShas: new Set(),
        authorBreakdown: new Map(),
      })
    }
    const fileStat = fileMap.get(displayPath)
    if (!fileStat) continue

    for (const group of groups) {
      const [authorName, authorEmail] = group.author.split("\0")

      // Author aggregation
      const authorKey = `${authorName}\0${authorEmail}`
      if (!authorMap.has(authorKey)) {
        authorMap.set(authorKey, {
          name: authorName,
          email: authorEmail,
          insertions: 0,
          deletions: 0,
          dateSum: 0,
          commitShas: new Set(),
        })
      }
      const authorStat = authorMap.get(authorKey)
      if (authorStat) {
        authorStat.insertions += group.insertions
        authorStat.deletions += group.deletions
        authorStat.dateSum += group.dateSum
        for (const sha of group.shas) authorStat.commitShas.add(sha)
      }

      // File aggregation
      fileStat.insertions += group.insertions
      fileStat.deletions += group.deletions
      fileStat.lastModified = Math.max(
        fileStat.lastModified,
        group.latestTimestamp ?? 0,
      )
      for (const sha of group.shas) {
        fileStat.commitShas.add(sha)
      }

      // Author breakdown within file
      if (!fileStat.authorBreakdown.has(authorKey)) {
        fileStat.authorBreakdown.set(authorKey, {
          insertions: 0,
          deletions: 0,
          commits: 0,
          commitShas: new Set(),
        })
      }
      const breakdown = fileStat.authorBreakdown.get(authorKey)
      if (breakdown) {
        breakdown.insertions += group.insertions
        breakdown.deletions += group.deletions
        for (const sha of group.shas) breakdown.commitShas.add(sha)
      }
    }
  }

  // Calculate totals for percentage computation
  const totalInsertions = [...authorMap.values()].reduce(
    (sum, a) => sum + a.insertions,
    0,
  )

  const now = Date.now() / 1000

  const authorStats: AuthorStats[] = [...authorMap.entries()].map(
    ([, stat]) => {
      const age = stat.insertions > 0 ? now - stat.dateSum / stat.insertions : 0

      return {
        personId: "", // filled after PersonDB construction
        canonicalName: stat.name,
        canonicalEmail: stat.email,
        commits: stat.commitShas.size,
        insertions: stat.insertions,
        deletions: stat.deletions,
        lines: 0, // filled from blame
        linesPercent: 0, // filled from blame
        insertionsPercent:
          totalInsertions > 0 ? (100 * stat.insertions) / totalInsertions : 0,
        stability: 0, // filled from blame
        age,
        commitShas: stat.commitShas,
      }
    },
  )

  // Update file stat commit counts
  const fileStats: FileStats[] = [...fileMap.entries()].map(([path, stat]) => {
    // Update author breakdown commit counts
    for (const breakdown of stat.authorBreakdown.values()) {
      breakdown.commits = breakdown.commitShas.size
    }

    return {
      path,
      commits: stat.commitShas.size,
      insertions: stat.insertions,
      deletions: stat.deletions,
      lines: 0, // filled from blame
      stability: 0, // filled from blame
      lastModified: stat.lastModified,
      commitShas: stat.commitShas,
      authorBreakdown: stat.authorBreakdown,
    }
  })

  return { authorStats, fileStats }
}

// ---------------------------------------------------------------------------
// Author exclusion (post-merge, Python parity)
// ---------------------------------------------------------------------------

function normalizeAuthorName(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function normalizeAuthorEmail(value: string): string {
  return value.trim()
}

function toPersonDbIdentityKey(name: string, email: string): string {
  return `${normalizeAuthorEmail(email).toLowerCase()}\0${normalizeAuthorName(name).toLowerCase()}`
}

function shouldExcludeIdentity(
  name: string,
  email: string,
  excludeAuthors: readonly string[],
  excludeEmails: readonly string[],
): boolean {
  const normalizedName = normalizeAuthorName(name)
  const normalizedEmail = normalizeAuthorEmail(email)

  if (
    excludeAuthors.length > 0 &&
    fnmatchFilter(normalizedName, excludeAuthors)
  ) {
    return true
  }
  if (
    excludeEmails.length > 0 &&
    fnmatchFilter(normalizedEmail, excludeEmails)
  ) {
    return true
  }
  return false
}

function applyAuthorExclusions(
  authorStats: AuthorStats[],
  fileStats: FileStats[],
  personDb: AnalysisResult["personDbBaseline"],
  config: AnalysisConfig,
): { authorStats: AuthorStats[]; fileStats: FileStats[] } {
  const excludeAuthors = config.excludeAuthors ?? []
  const excludeEmails = config.excludeEmails ?? []

  if (excludeAuthors.length === 0 && excludeEmails.length === 0) {
    return { authorStats, fileStats }
  }

  const excludedPersonIds = new Set<string>()
  for (const person of personDb.persons) {
    if (
      shouldExcludeIdentity(
        person.canonicalName,
        person.canonicalEmail,
        excludeAuthors,
        excludeEmails,
      )
    ) {
      excludedPersonIds.add(person.id)
      continue
    }
    if (
      person.aliases.some((alias) =>
        shouldExcludeIdentity(
          alias.name,
          alias.email,
          excludeAuthors,
          excludeEmails,
        ),
      )
    ) {
      excludedPersonIds.add(person.id)
    }
  }

  const filteredAuthorStats = authorStats.filter(
    (stat) => !excludedPersonIds.has(stat.personId),
  )
  const totalInsertions = filteredAuthorStats.reduce(
    (sum, stat) => sum + stat.insertions,
    0,
  )
  for (const stat of filteredAuthorStats) {
    stat.insertionsPercent =
      totalInsertions > 0 ? (100 * stat.insertions) / totalInsertions : 0
  }

  const filteredFileStats: FileStats[] = []
  for (const fileStat of fileStats) {
    const authorBreakdown = new Map<
      string,
      {
        insertions: number
        deletions: number
        commits: number
        commitShas: Set<string>
      }
    >()
    const fileCommitShas = new Set<string>()
    let insertions = 0
    let deletions = 0

    for (const [authorKey, breakdown] of fileStat.authorBreakdown) {
      const [name = "", email = ""] = authorKey.split("\0")
      const personId = personDb.identityIndex.get(
        toPersonDbIdentityKey(name, email),
      )
      if (personId && excludedPersonIds.has(personId)) {
        continue
      }

      const nextBreakdown = {
        insertions: breakdown.insertions,
        deletions: breakdown.deletions,
        commits: breakdown.commitShas.size,
        commitShas: new Set(breakdown.commitShas),
      }
      authorBreakdown.set(authorKey, nextBreakdown)
      insertions += nextBreakdown.insertions
      deletions += nextBreakdown.deletions
      for (const sha of nextBreakdown.commitShas) {
        fileCommitShas.add(sha)
      }
    }

    if (authorBreakdown.size === 0) {
      continue
    }

    filteredFileStats.push({
      ...fileStat,
      commits: fileCommitShas.size,
      insertions,
      deletions,
      commitShas: fileCommitShas,
      authorBreakdown,
    })
  }

  return { authorStats: filteredAuthorStats, fileStats: filteredFileStats }
}

function toUtcDay(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function buildAuthorDailyActivity(
  fileGroupsMap: Map<string, CommitGroup[]>,
  personDb: AnalysisResult["personDbBaseline"],
): AuthorDailyActivity[] {
  const rowsByKey = new Map<
    string,
    {
      date: string
      personId: string
      commits: Set<string>
      insertions: number
      deletions: number
      netLines: number
    }
  >()

  const sortedPaths = [...fileGroupsMap.keys()].sort()
  for (const filePath of sortedPaths) {
    const groups = fileGroupsMap.get(filePath)
    if (!groups) continue

    for (const group of groups) {
      const [name = "", email = ""] = group.author.split("\0")
      const personId = personDb.identityIndex.get(
        toPersonDbIdentityKey(name, email),
      )
      if (!personId) continue

      for (const entry of group.commitEntries ?? []) {
        const date = toUtcDay(entry.timestamp)
        const key = `${date}\0${personId}`
        const existing = rowsByKey.get(key)
        if (existing) {
          existing.commits.add(entry.sha)
          existing.insertions += entry.insertions
          existing.deletions += entry.deletions
          existing.netLines += entry.insertions - entry.deletions
          continue
        }
        rowsByKey.set(key, {
          date,
          personId,
          commits: new Set([entry.sha]),
          insertions: entry.insertions,
          deletions: entry.deletions,
          netLines: entry.insertions - entry.deletions,
        })
      }
    }
  }

  return [...rowsByKey.values()]
    .map((row) => ({
      date: row.date,
      personId: row.personId,
      commits: row.commits.size,
      insertions: row.insertions,
      deletions: row.deletions,
      netLines: row.netLines,
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.personId.localeCompare(b.personId),
    )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createAnalysisRunHandler(
  ports: AnalysisWorkflowPorts,
): Pick<WorkflowHandlerMap<"analysis.run">, "analysis.run"> {
  return {
    "analysis.run": async (
      input: AnalysisRunInput,
      options?: WorkflowCallOptions<AnalysisProgress, DiagnosticOutput>,
    ): Promise<AnalysisResult> => {
      try {
        // Phase 1: Validate config
        throwIfAborted(options?.signal)
        const validation = validateAnalysisConfig(input.config)
        if (!validation.ok) {
          throw createValidationAppError(
            "Analysis config validation failed.",
            validation.issues,
          )
        }
        const config = validation.value

        options?.onProgress?.({
          phase: "init",
          label: "Resolving snapshot head.",
          processedFiles: 0,
          totalFiles: 0,
        })

        // Phase 2: Resolve repo root and snapshot head
        const repoRoot = resolveAnalysisRepoRoot(input)

        // Verify git repo
        throwIfAborted(options?.signal)
        const gitCheckResult = await ports.gitCommand.run({
          args: ["rev-parse", "--git-dir"],
          cwd: repoRoot,
          signal: options?.signal,
        })
        if (gitCheckResult.exitCode !== 0) {
          throw {
            type: "provider",
            message: `'${repoRoot}' is not a git repository.`,
            provider: "git",
            operation: "rev-parse",
            retryable: false,
          } satisfies AppError
        }

        throwIfAborted(options?.signal)
        const resolvedAsOfOid = await resolveSnapshotHead(
          ports.gitCommand,
          repoRoot,
          input.asOfCommit,
          config.until,
          options?.signal,
          options?.onOutput,
        )

        // Phase 3: List and filter file candidates
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          phase: "listing",
          label: "Listing files in snapshot tree.",
          processedFiles: 0,
          totalFiles: 0,
        })

        const treeEntries = await listSnapshotFiles(
          ports.gitCommand,
          repoRoot,
          resolvedAsOfOid,
          options?.signal,
        )

        const filePaths = filterFileCandidates(treeEntries, config)
        const totalFiles = filePaths.length

        if (totalFiles === 0) {
          // Empty result set — successful outcome
          const emptyPersonDb = createPersonDbFromLog([], new Map())
          return {
            resolvedAsOfOid,
            authorStats: [],
            fileStats: [],
            authorDailyActivity: [],
            personDbBaseline: emptyPersonDb,
          }
        }

        // Phase 4: Per-file git log --follow with bounded concurrency
        options?.onProgress?.({
          phase: "log",
          label: "Collecting per-file commit histories.",
          processedFiles: 0,
          totalFiles,
        })

        const maxConcurrency = config.maxConcurrency ?? 1
        const subfolder = config.subfolder
        const subfolderPrefix = subfolder
          ? subfolder.endsWith("/")
            ? subfolder
            : `${subfolder}/`
          : ""

        const fileToSubfolderedPath = (path: string): string =>
          subfolderPrefix && path.startsWith(subfolderPrefix)
            ? path.slice(subfolderPrefix.length)
            : path

        let processedFiles = 0
        const fileCommitGroupsMap = new Map<string, CommitGroup[]>()

        // Collect per-file log data with bounded concurrency
        const perFileResults = await mapBounded(
          filePaths,
          maxConcurrency,
          async (filePath) => {
            throwIfAborted(options?.signal)

            const args = buildPerFileLogArgs(resolvedAsOfOid, filePath, config)

            const result = await ports.gitCommand.run({
              args,
              cwd: repoRoot,
              signal: options?.signal,
            })

            processedFiles++
            options?.onProgress?.({
              phase: "log",
              label: "Collecting per-file commit histories.",
              processedFiles,
              totalFiles,
              currentFile: filePath,
            })

            if (result.exitCode !== 0) {
              // Non-fatal: skip files that fail (may be deleted in history)
              options?.onOutput?.({
                channel: "warn",
                message: `git log failed for '${filePath}': ${result.stderr.trim()}`,
              })
              return { filePath, commits: [] as AnalysisCommit[] }
            }

            const commits = parseLogOutput(result.stdout)
            const filtered = applyCommitExclusions(commits, config)
            return { filePath, commits: filtered }
          },
        )

        // Build commit groups in deterministic sorted file order
        for (const { filePath, commits } of perFileResults) {
          const groups = buildCommitGroups(commits, filePath)
          if (groups.length > 0) {
            fileCommitGroupsMap.set(filePath, groups)
          }
        }

        // Phase 5: Overlap reduction
        options?.onProgress?.({
          phase: "reduce",
          label: "Reducing commit history overlap.",
          processedFiles: totalFiles,
          totalFiles,
        })
        reduceCommitGroupOverlap(fileCommitGroupsMap)

        // Phase 6: Aggregate stats
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          phase: "aggregate",
          label: "Aggregating statistics.",
          processedFiles: totalFiles,
          totalFiles,
        })

        const { authorStats, fileStats } = aggregateStats(
          fileCommitGroupsMap,
          fileToSubfolderedPath,
        )

        // Phase 7: Build PersonDB from log identities
        const identities: GitAuthorIdentity[] = []
        const commitCounts = new Map<string, number>()

        for (const stat of authorStats) {
          const key = toPersonDbIdentityKey(
            stat.canonicalName,
            stat.canonicalEmail,
          )
          identities.push({
            name: stat.canonicalName,
            email: stat.canonicalEmail,
          })
          commitCounts.set(key, stat.commits)
        }

        const personDbBaseline = createPersonDbFromLog(identities, commitCounts)

        // Update personId on author stats
        for (const stat of authorStats) {
          const key = toPersonDbIdentityKey(
            stat.canonicalName,
            stat.canonicalEmail,
          )
          stat.personId = personDbBaseline.identityIndex.get(key) ?? ""
        }

        // Apply author exclusions after merge using canonical + alias matching.
        const filteredStats = applyAuthorExclusions(
          authorStats,
          fileStats,
          personDbBaseline,
          config,
        )
        const visibleAuthorIds = new Set(
          filteredStats.authorStats.map((author) => author.personId),
        )
        const authorDailyActivity = buildAuthorDailyActivity(
          fileCommitGroupsMap,
          personDbBaseline,
        ).filter((row) => visibleAuthorIds.has(row.personId))

        // Phase 8: Optional roster bridging
        let rosterMatches: AnalysisResult["rosterMatches"]
        if (input.rosterContext) {
          rosterMatches = bridgeAuthorsToRoster(
            personDbBaseline,
            input.rosterContext.members,
          )
        }

        options?.onProgress?.({
          phase: "done",
          label: "Analysis complete.",
          processedFiles: totalFiles,
          totalFiles,
        })

        return {
          resolvedAsOfOid,
          authorStats: filteredStats.authorStats,
          fileStats: filteredStats.fileStats,
          authorDailyActivity,
          personDbBaseline,
          rosterMatches,
        }
      } catch (error) {
        if (typeof error === "object" && error !== null && "type" in error) {
          throw error
        }
        throw normalizeProviderError(error, "git", "analysis.run")
      }
    },
  }
}
