import type {
  AnalysisProgress,
  AnalysisRunInput,
  AppError,
  DiagnosticOutput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  AnalysisCommit,
  AnalysisConfig,
  AnalysisResult,
  AuthorDailyActivity,
  AuthorStats,
  FileStats,
  GitAuthorIdentity,
  PersonDbSnapshot,
} from "@repo-edu/domain/analysis"
import {
  bridgeAuthorsToRoster,
  createPersonDbFromLog,
  validateAnalysisConfig,
} from "@repo-edu/domain/analysis"
import { createValidationAppError } from "../core.js"
import { isAbsolutePath, joinPath } from "../path-utils.js"
import { normalizeProviderError, throwIfAborted } from "../workflow-helpers.js"
import { buildAnalysisCacheKey } from "./cache.js"
import {
  normalizeAnalysisConfigForCache,
  normalizeRosterContextForCache,
} from "./cache-keys.js"
import { fnmatchFilter } from "./filter-utils.js"
import { parseLogOutput } from "./log-parser.js"
import type { AnalysisWorkflowPorts } from "./ports.js"
import { resolveAnalysisRepoRoot } from "./repo-root.js"
import {
  applyCommitExclusions,
  buildCommitGroups,
  buildPerFileLogArgs,
  buildRepoWideLogArgs,
  type CommitGroup,
  filterCommitsByPathScope,
  filterFileCandidates,
  listSnapshotFiles,
  reduceCommitGroupOverlap,
  resolveSnapshotHead,
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
// Author stats aggregation (repo-wide)
// ---------------------------------------------------------------------------

/**
 * Aggregates author-level stats from the repo-wide commit list. Independent
 * of the `nFiles` cap so commit/insertion/deletion counts and daily activity
 * reflect every file that matches the path filters, not only the top-N.
 *
 * Each commit's per-author totals are computed from its filtered numstat
 * file entries (so a commit that only touches files outside the filter
 * scope is excluded by the caller, see `filterCommitsByPathScope`).
 */
function aggregateAuthorStatsFromCommits(
  commits: AnalysisCommit[],
): AuthorStats[] {
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

  for (const commit of commits) {
    const authorKey = `${commit.authorName}\0${commit.authorEmail}`
    let stat = authorMap.get(authorKey)
    if (!stat) {
      stat = {
        name: commit.authorName,
        email: commit.authorEmail,
        insertions: 0,
        deletions: 0,
        dateSum: 0,
        commitShas: new Set(),
      }
      authorMap.set(authorKey, stat)
    }

    let commitInsertions = 0
    let commitDeletions = 0
    for (const file of commit.files) {
      commitInsertions += file.insertions
      commitDeletions += file.deletions
    }

    stat.insertions += commitInsertions
    stat.deletions += commitDeletions
    // Weight age by insertions (Python parity: age = now - sum(ts*ins)/sum(ins))
    stat.dateSum += commit.timestamp * commitInsertions
    stat.commitShas.add(commit.sha)
  }

  const totalInsertions = [...authorMap.values()].reduce(
    (sum, a) => sum + a.insertions,
    0,
  )
  const now = Date.now() / 1000

  return [...authorMap.values()].map((stat) => ({
    personId: "", // filled after PersonDB construction
    canonicalName: stat.name,
    canonicalEmail: stat.email,
    commits: stat.commitShas.size,
    insertions: stat.insertions,
    deletions: stat.deletions,
    lines: 0,
    linesPercent: 0,
    insertionsPercent:
      totalInsertions > 0 ? (100 * stat.insertions) / totalInsertions : 0,
    age: stat.insertions > 0 ? now - stat.dateSum / stat.insertions : 0,
    commitShas: stat.commitShas,
  }))
}

// ---------------------------------------------------------------------------
// File stats aggregation (per-file)
// ---------------------------------------------------------------------------

/**
 * Aggregates file-level stats from the per-file `--follow` commit groups.
 * Always scoped to the top-N file selection — `fileStats` and per-file
 * author breakdowns are by definition per-file metrics.
 */
function aggregateFileStatsFromGroups(
  fileGroupsMap: Map<string, CommitGroup[]>,
  fileToSubfolderedPath: (path: string) => string,
  fileBytes: Map<string, number>,
): FileStats[] {
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
          lines: number
          commitShas: Set<string>
        }
      >
    }
  >()

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
      const authorKey = `${authorName}\0${authorEmail}`

      fileStat.insertions += group.insertions
      fileStat.deletions += group.deletions
      fileStat.lastModified = Math.max(
        fileStat.lastModified,
        group.latestTimestamp ?? 0,
      )
      for (const sha of group.shas) {
        fileStat.commitShas.add(sha)
      }

      if (!fileStat.authorBreakdown.has(authorKey)) {
        fileStat.authorBreakdown.set(authorKey, {
          insertions: 0,
          deletions: 0,
          commits: 0,
          lines: 0,
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

  return [...fileMap.entries()].map(([path, stat]) => {
    for (const breakdown of stat.authorBreakdown.values()) {
      breakdown.commits = breakdown.commitShas.size
    }

    return {
      path,
      bytes: fileBytes.get(path) ?? 0,
      commits: stat.commitShas.size,
      insertions: stat.insertions,
      deletions: stat.deletions,
      lines: 0,
      lastModified: stat.lastModified,
      commitShas: stat.commitShas,
      authorBreakdown: stat.authorBreakdown,
    }
  })
}

// ---------------------------------------------------------------------------
// Collapse per-identity stats by personId (after PersonDB merge)
// ---------------------------------------------------------------------------

function collapseStatsByPerson(
  rawAuthorStats: AuthorStats[],
  rawFileStats: FileStats[],
  personDb: PersonDbSnapshot,
): { authorStats: AuthorStats[]; fileStats: FileStats[] } {
  const personById = new Map(personDb.persons.map((p) => [p.id, p]))

  const resolvePersonId = (name: string, email: string): string => {
    const id = personDb.identityIndex.get(toPersonDbIdentityKey(name, email))
    if (!id) {
      throw new Error(
        `PersonDB missing identity for ${name} <${email}> — invariant violated`,
      )
    }
    return id
  }

  const mergedAuthors = new Map<
    string,
    {
      personId: string
      canonicalName: string
      canonicalEmail: string
      commitShas: Set<string>
      insertions: number
      deletions: number
      ageInsertionsSum: number
    }
  >()

  for (const stat of rawAuthorStats) {
    const personId = resolvePersonId(stat.canonicalName, stat.canonicalEmail)
    const person = personById.get(personId)
    const existing = mergedAuthors.get(personId)
    if (existing) {
      for (const sha of stat.commitShas) existing.commitShas.add(sha)
      existing.insertions += stat.insertions
      existing.deletions += stat.deletions
      existing.ageInsertionsSum += stat.age * stat.insertions
      continue
    }
    mergedAuthors.set(personId, {
      personId,
      canonicalName: person?.canonicalName ?? stat.canonicalName,
      canonicalEmail: person?.canonicalEmail ?? stat.canonicalEmail,
      commitShas: new Set(stat.commitShas),
      insertions: stat.insertions,
      deletions: stat.deletions,
      ageInsertionsSum: stat.age * stat.insertions,
    })
  }

  const totalInsertions = [...mergedAuthors.values()].reduce(
    (sum, a) => sum + a.insertions,
    0,
  )

  const authorStats: AuthorStats[] = [...mergedAuthors.values()].map((a) => ({
    personId: a.personId,
    canonicalName: a.canonicalName,
    canonicalEmail: a.canonicalEmail,
    commits: a.commitShas.size,
    insertions: a.insertions,
    deletions: a.deletions,
    lines: 0,
    linesPercent: 0,
    insertionsPercent:
      totalInsertions > 0 ? (100 * a.insertions) / totalInsertions : 0,
    age: a.insertions > 0 ? a.ageInsertionsSum / a.insertions : 0,
    commitShas: a.commitShas,
  }))

  const fileStats: FileStats[] = rawFileStats.map((file) => {
    const collapsed = new Map<
      string,
      {
        insertions: number
        deletions: number
        commits: number
        lines: number
        commitShas: Set<string>
      }
    >()
    for (const [rawKey, breakdown] of file.authorBreakdown) {
      const [name = "", email = ""] = rawKey.split("\0")
      const personId = resolvePersonId(name, email)
      const existing = collapsed.get(personId)
      if (existing) {
        existing.insertions += breakdown.insertions
        existing.deletions += breakdown.deletions
        for (const sha of breakdown.commitShas) existing.commitShas.add(sha)
        existing.commits = existing.commitShas.size
        continue
      }
      collapsed.set(personId, {
        insertions: breakdown.insertions,
        deletions: breakdown.deletions,
        commits: breakdown.commitShas.size,
        lines: 0,
        commitShas: new Set(breakdown.commitShas),
      })
    }
    return { ...file, authorBreakdown: collapsed }
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
        lines: number
        commitShas: Set<string>
      }
    >()
    const fileCommitShas = new Set<string>()
    let insertions = 0
    let deletions = 0

    for (const [personId, breakdown] of fileStat.authorBreakdown) {
      if (excludedPersonIds.has(personId)) {
        continue
      }

      const nextBreakdown = {
        insertions: breakdown.insertions,
        deletions: breakdown.deletions,
        commits: breakdown.commitShas.size,
        lines: 0,
        commitShas: new Set(breakdown.commitShas),
      }
      authorBreakdown.set(personId, nextBreakdown)
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
  commits: AnalysisCommit[],
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

  for (const commit of commits) {
    const personId = personDb.identityIndex.get(
      toPersonDbIdentityKey(commit.authorName, commit.authorEmail),
    )
    if (!personId) continue

    let insertions = 0
    let deletions = 0
    for (const file of commit.files) {
      insertions += file.insertions
      deletions += file.deletions
    }

    const date = toUtcDay(commit.timestamp)
    const key = `${date}\0${personId}`
    const existing = rowsByKey.get(key)
    if (existing) {
      existing.commits.add(commit.sha)
      existing.insertions += insertions
      existing.deletions += deletions
      existing.netLines += insertions - deletions
      continue
    }
    rowsByKey.set(key, {
      date,
      personId,
      commits: new Set([commit.sha]),
      insertions,
      deletions,
      netLines: insertions - deletions,
    })
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
        const repoGitDirRaw = gitCheckResult.stdout.trim()
        if (repoGitDirRaw.length === 0) {
          throw {
            type: "provider",
            message: `Failed to resolve git directory for '${repoRoot}'.`,
            provider: "git",
            operation: "rev-parse",
            retryable: false,
          } satisfies AppError
        }
        const repoGitDir = isAbsolutePath(repoGitDirRaw)
          ? repoGitDirRaw
          : joinPath(repoRoot, repoGitDirRaw)

        throwIfAborted(options?.signal)
        const resolvedAsOfOid = await resolveSnapshotHead(
          ports.gitCommand,
          repoRoot,
          input.asOfCommit,
          config.until,
          options?.signal,
          options?.onOutput,
        )

        const cacheKey = ports.cache
          ? buildAnalysisCacheKey({
              repoGitDir,
              resolvedAsOfOid,
              normalizedConfigJson: normalizeAnalysisConfigForCache(config),
              normalizedRosterFingerprint: normalizeRosterContextForCache(
                input.rosterContext,
              ),
            })
          : undefined

        // Cache lookup
        if (ports.cache && cacheKey) {
          const cached = ports.cache.get(cacheKey)
          if (cached) {
            options?.onProgress?.({
              phase: "done",
              label: "Analysis complete (cached).",
              processedFiles: 0,
              totalFiles: 0,
            })
            return cached
          }
        }

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

        const fileBytes = new Map<string, number>(
          treeEntries.map((e) => [fileToSubfolderedPath(e.path), e.size]),
        )

        // Phase 4a: Repo-wide git log for author-level aggregates. Path
        // filters (subfolder/extensions/include/exclude) apply, but the
        // `nFiles` cap intentionally does not — author commits/insertions/
        // deletions/age and daily activity must reflect every matching file.
        options?.onProgress?.({
          phase: "log",
          label: "Collecting repo-wide commit history.",
          processedFiles: 0,
          totalFiles,
        })
        throwIfAborted(options?.signal)

        const repoWideArgs = buildRepoWideLogArgs(resolvedAsOfOid, config)
        const repoWideResult = await ports.gitCommand.run({
          args: repoWideArgs,
          cwd: repoRoot,
          signal: options?.signal,
        })
        if (repoWideResult.exitCode !== 0) {
          throw {
            type: "provider",
            message: `Repo-wide git log failed: ${repoWideResult.stderr.trim()}`,
            provider: "git",
            operation: "log",
            retryable: false,
          } satisfies AppError
        }

        const repoWideCommits = filterCommitsByPathScope(
          applyCommitExclusions(parseLogOutput(repoWideResult.stdout), config),
          config,
        )

        // Phase 4b: Per-file git log --follow with bounded concurrency.
        // Drives only fileStats and per-file author breakdowns (which are
        // by definition top-N scoped). Skipped when nFiles selects nothing.
        const fileCommitGroupsMap = new Map<string, CommitGroup[]>()

        if (totalFiles > 0) {
          options?.onProgress?.({
            phase: "log",
            label: "Collecting per-file commit histories.",
            processedFiles: 0,
            totalFiles,
          })

          const maxConcurrency = config.maxConcurrency ?? 1
          let processedFiles = 0

          const perFileResults = await mapBounded(
            filePaths,
            maxConcurrency,
            async (filePath) => {
              throwIfAborted(options?.signal)

              const args = buildPerFileLogArgs(
                resolvedAsOfOid,
                filePath,
                config,
              )

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

          for (const { filePath, commits } of perFileResults) {
            const groups = buildCommitGroups(commits, filePath)
            if (groups.length > 0) {
              fileCommitGroupsMap.set(filePath, groups)
            }
          }

          // Phase 5: Overlap reduction (per-file `--follow` rename tails)
          options?.onProgress?.({
            phase: "reduce",
            label: "Reducing commit history overlap.",
            processedFiles: totalFiles,
            totalFiles,
          })
          reduceCommitGroupOverlap(fileCommitGroupsMap)
        }

        // Phase 6: Aggregate stats
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          phase: "aggregate",
          label: "Aggregating statistics.",
          processedFiles: totalFiles,
          totalFiles,
        })

        const rawAuthorStats = aggregateAuthorStatsFromCommits(repoWideCommits)
        const rawFileStats = aggregateFileStatsFromGroups(
          fileCommitGroupsMap,
          fileToSubfolderedPath,
          fileBytes,
        )

        // Phase 7: Build PersonDB from repo-wide log identities so that
        // person merging never depends on the nFiles cap.
        const identities: GitAuthorIdentity[] = []
        const commitCounts = new Map<string, number>()

        for (const stat of rawAuthorStats) {
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

        // Collapse per-identity author stats and file breakdowns into one row
        // per merged person, and re-key breakdowns by personId.
        const { authorStats, fileStats } = collapseStatsByPerson(
          rawAuthorStats,
          rawFileStats,
          personDbBaseline,
        )

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
          repoWideCommits,
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

        const result: AnalysisResult = {
          resolvedAsOfOid,
          authorStats: filteredStats.authorStats,
          fileStats: filteredStats.fileStats,
          authorDailyActivity,
          personDbBaseline,
          rosterMatches,
        }

        // Cache store
        if (ports.cache && cacheKey) {
          ports.cache.set(cacheKey, result)
        }

        return result
      } catch (error) {
        if (typeof error === "object" && error !== null && "type" in error) {
          throw error
        }
        throw normalizeProviderError(error, "git", "analysis.run")
      }
    },
  }
}
