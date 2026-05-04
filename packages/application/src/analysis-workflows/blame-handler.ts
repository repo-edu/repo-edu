import type {
  AnalysisBlameInput,
  AnalysisProgress,
  AppError,
  DiagnosticOutput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  BlameAuthorSummary,
  BlameFileSummary,
  BlameResult,
  FileBlame,
  PersonDbDelta,
} from "@repo-edu/domain/analysis"
import {
  applyBlameToPersonDb,
  clonePersonDbSnapshot,
  validateAnalysisBlameConfig,
} from "@repo-edu/domain/analysis"
import { createValidationAppError } from "../core.js"
import { normalizeProviderError, throwIfAborted } from "../workflow-helpers.js"
import { buildBlameArgs, buildBlameCacheKey } from "./blame-cache.js"
import { parseBlameOutput } from "./blame-parser.js"
import { fnmatchFilter } from "./filter-utils.js"
import type { AnalysisWorkflowPorts } from "./ports.js"
import { resolveAnalysisRepoRoot } from "./repo-root.js"
import { resolveSnapshotHead } from "./snapshot-engine.js"

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
// Line exclusion
// ---------------------------------------------------------------------------

function getFileExtension(path: string): string {
  const dotIndex = path.lastIndexOf(".")
  if (dotIndex === -1) return ""
  return path.slice(dotIndex + 1).toLowerCase()
}

function normalizeAuthorName(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function normalizeAuthorEmail(value: string): string {
  return value.trim()
}

function toPersonDbIdentityKey(name: string, email: string): string {
  return `${normalizeAuthorEmail(email).toLowerCase()}\0${normalizeAuthorName(name).toLowerCase()}`
}

type BlameFileTarget = {
  repoPath: string
  displayPath: string
}

function normalizeInputFilePath(path: string, index: number): string {
  const normalized = path.trim().replace(/\\/g, "/")
  if (normalized.length === 0) {
    throw {
      type: "validation",
      message: "Blame file path must not be empty.",
      issues: [
        { path: `files.${index}`, message: "File path must not be empty." },
      ],
    } satisfies AppError
  }
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw {
      type: "validation",
      message: "Blame file path must be a safe repository-relative path.",
      issues: [
        {
          path: `files.${index}`,
          message: "Absolute paths and '..' segments are not allowed.",
        },
      ],
    } satisfies AppError
  }
  return normalized.replace(/\/+/g, "/")
}

function normalizeSubfolderPrefix(subfolder: string | undefined): string {
  if (!subfolder) return ""
  return subfolder.endsWith("/") ? subfolder : `${subfolder}/`
}

function buildBlameTargets(
  files: readonly string[],
  config: AnalysisBlameConfig,
): BlameFileTarget[] {
  const subfolderPrefix = normalizeSubfolderPrefix(config.subfolder)
  const includeFiles = config.includeFiles ?? ["*"]
  const excludeFiles = config.excludeFiles ?? []
  const extensions = config.extensions ?? []
  const extensionSet =
    extensions.length > 0 && !extensions.includes("*")
      ? new Set(extensions.map((extension) => extension.toLowerCase()))
      : null

  const dedupedTargets = new Map<string, BlameFileTarget>()
  for (let index = 0; index < files.length; index++) {
    const normalized = normalizeInputFilePath(files[index], index)
    const repoPath =
      subfolderPrefix.length > 0 && !normalized.startsWith(subfolderPrefix)
        ? `${subfolderPrefix}${normalized}`
        : normalized
    const displayPath =
      subfolderPrefix.length > 0 && repoPath.startsWith(subfolderPrefix)
        ? repoPath.slice(subfolderPrefix.length)
        : repoPath

    // Keep stable first-in path shape after normalization.
    if (!dedupedTargets.has(repoPath)) {
      dedupedTargets.set(repoPath, { repoPath, displayPath })
    }
  }

  let targets = [...dedupedTargets.values()]

  if (extensionSet) {
    targets = targets.filter((target) =>
      extensionSet.has(getFileExtension(target.repoPath)),
    )
  }

  if (excludeFiles.length > 0) {
    targets = targets.filter(
      (target) => !fnmatchFilter(target.displayPath, excludeFiles),
    )
  }

  if (!(includeFiles.length === 1 && includeFiles[0] === "*")) {
    targets = targets.filter((target) =>
      fnmatchFilter(target.displayPath, includeFiles),
    )
  }

  targets.sort((left, right) => left.repoPath.localeCompare(right.repoPath))
  return targets
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createAnalysisBlameHandler(
  ports: AnalysisWorkflowPorts,
): Pick<WorkflowHandlerMap<"analysis.blame">, "analysis.blame"> {
  return {
    "analysis.blame": async (
      input: AnalysisBlameInput,
      options?: WorkflowCallOptions<AnalysisProgress, DiagnosticOutput>,
    ): Promise<BlameResult> => {
      try {
        // Phase 1: Validate config
        throwIfAborted(options?.signal)
        const validation = validateAnalysisBlameConfig(input.config)
        if (!validation.ok) {
          throw createValidationAppError(
            "Blame config validation failed.",
            validation.issues,
          )
        }
        const config = validation.value

        const repoRoot = resolveAnalysisRepoRoot(input)

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
        const commitOid = await resolveSnapshotHead(
          ports.gitCommand,
          repoRoot,
          input.asOfCommit,
          undefined,
          options?.signal,
        )

        const targets = buildBlameTargets(input.files, config)

        if (targets.length === 0) {
          const snapshot = input.personDbOverlay
            ? clonePersonDbSnapshot(input.personDbOverlay)
            : clonePersonDbSnapshot(input.personDbBaseline)
          return {
            fileBlames: [],
            authorSummaries: [],
            fileSummaries: [],
            personDbOverlay: snapshot,
            delta: { newPersons: [], newAliases: [], relinkedIdentities: [] },
          }
        }

        options?.onProgress?.({
          phase: "init",
          label: "Preparing blame analysis.",
          processedFiles: 0,
          totalFiles: targets.length,
        })

        // Probe + fingerprint _git-blame-ignore-revs.txt from the working tree.
        // `git blame --ignore-revs-file=<path>` reads this file from disk, so
        // local edits must participate in keying or cache hits can go stale.
        let hasIgnoreRevsFile = false
        let ignoreRevsFingerprint: string | null = null
        if (config.ignoreRevsFile ?? true) {
          throwIfAborted(options?.signal)
          const ignoreRevsHashResult = await ports.gitCommand.run({
            args: ["hash-object", "--", "_git-blame-ignore-revs.txt"],
            cwd: repoRoot,
            signal: options?.signal,
          })
          if (ignoreRevsHashResult.exitCode === 0) {
            const fingerprint = ignoreRevsHashResult.stdout.trim()
            if (fingerprint.length > 0) {
              hasIgnoreRevsFile = true
              ignoreRevsFingerprint = fingerprint
            }
          }
        }

        // Phase 2: Per-file blame with bounded concurrency — cache-first
        options?.onProgress?.({
          phase: "blame",
          label: "Running per-file blame.",
          processedFiles: 0,
          totalFiles: targets.length,
        })

        const maxConcurrency = config.maxConcurrency ?? 1

        const blameCache = ports.blameCache
        const cacheKeys = blameCache
          ? targets.map(({ repoPath }) =>
              buildBlameCacheKey({
                resolvedOid: commitOid,
                filePath: repoPath,
                config,
                hasIgnoreRevsFile,
                ignoreRevsFingerprint,
              }),
            )
          : null

        const cachedHits =
          blameCache && cacheKeys ? blameCache.getMany(cacheKeys) : null

        const rawBlames: FileBlame[] = new Array(targets.length)
        const missIndexes: number[] = []
        for (let i = 0; i < targets.length; i++) {
          const cached = cachedHits?.[i]
          if (cached) {
            rawBlames[i] = cached
          } else {
            missIndexes.push(i)
          }
        }

        let processedFiles = targets.length - missIndexes.length
        if (processedFiles > 0) {
          options?.onProgress?.({
            phase: "blame",
            label: "Running per-file blame.",
            processedFiles,
            totalFiles: targets.length,
          })
        }

        const computed = await mapBounded(
          missIndexes,
          maxConcurrency,
          async (index) => {
            throwIfAborted(options?.signal)
            const { repoPath, displayPath } = targets[index]

            const args = buildBlameArgs(
              commitOid,
              repoPath,
              config,
              hasIgnoreRevsFile,
            )

            const result = await ports.gitCommand.run({
              args,
              cwd: repoRoot,
              signal: options?.signal,
            })

            processedFiles++
            options?.onProgress?.({
              phase: "blame",
              label: "Running per-file blame.",
              processedFiles,
              totalFiles: targets.length,
              currentFile: displayPath,
            })

            if (result.exitCode !== 0) {
              throw {
                type: "provider",
                message: `git blame failed for '${repoPath}': ${result.stderr.trim()}`,
                provider: "git",
                operation: "blame",
                retryable: false,
              } satisfies AppError
            }

            return {
              index,
              blame: parseBlameOutput(displayPath, result.stdout),
            }
          },
        )

        for (const { index, blame } of computed) {
          rawBlames[index] = blame
        }

        if (blameCache && cacheKeys && computed.length > 0) {
          blameCache.setMany(
            computed.map(({ index, blame }) => ({
              key: cacheKeys[index],
              value: blame,
            })),
          )
        }

        // Phase 3: Apply line exclusions and build enriched PersonDB
        // Process in deterministic sorted file order
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          phase: "enrich",
          label: "Enriching person database from blame.",
          processedFiles: targets.length,
          totalFiles: targets.length,
        })

        let personDb = input.personDbOverlay
          ? clonePersonDbSnapshot(input.personDbOverlay)
          : clonePersonDbSnapshot(input.personDbBaseline)

        const excludeAuthors = config.excludeAuthors ?? []
        const excludeEmails = config.excludeEmails ?? []

        const accumulatedDelta: PersonDbDelta = {
          newPersons: [],
          newAliases: [],
          relinkedIdentities: [],
        }

        const fileBlames: FileBlame[] = []
        const authorLineMap = new Map<
          string,
          { name: string; email: string; lines: number }
        >()
        const fileLineMap = new Map<string, number>()
        const fileAuthorLineMap = new Map<
          string,
          Map<string, { name: string; email: string; lines: number }>
        >()
        let totalLines = 0

        for (const blame of rawBlames) {
          if (blame.lines.length === 0) {
            fileBlames.push(blame)
            fileLineMap.set(blame.path, 0)
            fileAuthorLineMap.set(blame.path, new Map())
            continue
          }

          const filteredLines = blame.lines.filter((line) => {
            if (
              excludeAuthors.length > 0 &&
              fnmatchFilter(line.authorName, excludeAuthors)
            ) {
              return false
            }
            if (
              excludeEmails.length > 0 &&
              fnmatchFilter(line.authorEmail, excludeEmails)
            ) {
              return false
            }
            return true
          })

          fileBlames.push({
            path: blame.path,
            lines: blame.lines,
          })

          // Enrich PersonDB (deterministic file order)
          const blameResult = applyBlameToPersonDb(personDb, filteredLines)
          personDb = blameResult.snapshot
          accumulatedDelta.newPersons.push(...blameResult.delta.newPersons)
          accumulatedDelta.newAliases.push(...blameResult.delta.newAliases)
          accumulatedDelta.relinkedIdentities.push(
            ...blameResult.delta.relinkedIdentities,
          )

          let fileAuthors = fileAuthorLineMap.get(blame.path)
          if (!fileAuthors) {
            fileAuthors = new Map()
            fileAuthorLineMap.set(blame.path, fileAuthors)
          }
          let fileLineTotal = fileLineMap.get(blame.path) ?? 0

          for (const line of filteredLines) {
            const key = `${line.authorName}\0${line.authorEmail}`
            const existing = authorLineMap.get(key)
            if (existing) {
              existing.lines++
            } else {
              authorLineMap.set(key, {
                name: line.authorName,
                email: line.authorEmail,
                lines: 1,
              })
            }

            const fileAuthorEntry = fileAuthors.get(key)
            if (fileAuthorEntry) {
              fileAuthorEntry.lines++
            } else {
              fileAuthors.set(key, {
                name: line.authorName,
                email: line.authorEmail,
                lines: 1,
              })
            }
            fileLineTotal++
            totalLines++
          }

          fileLineMap.set(blame.path, fileLineTotal)
        }

        // Phase 4: Compute author summaries from blame
        const authorSummaries: BlameAuthorSummary[] = [
          ...authorLineMap.entries(),
        ].map(([, stat]) => ({
          personId:
            personDb.identityIndex.get(
              toPersonDbIdentityKey(stat.name, stat.email),
            ) ?? "",
          canonicalName: stat.name,
          canonicalEmail: stat.email,
          lines: stat.lines,
          linesPercent: totalLines > 0 ? (100 * stat.lines) / totalLines : 0,
        }))

        const fileSummaries: BlameFileSummary[] = [
          ...fileLineMap.entries(),
        ].map(([path, lines]) => {
          const authorLines = new Map<string, number>()
          const rawAuthorLines = fileAuthorLineMap.get(path)
          if (rawAuthorLines) {
            for (const stat of rawAuthorLines.values()) {
              const personId = personDb.identityIndex.get(
                toPersonDbIdentityKey(stat.name, stat.email),
              )
              if (!personId) continue
              authorLines.set(
                personId,
                (authorLines.get(personId) ?? 0) + stat.lines,
              )
            }
          }
          return { path, lines, authorLines }
        })

        options?.onProgress?.({
          phase: "done",
          label: "Blame analysis complete.",
          processedFiles: targets.length,
          totalFiles: targets.length,
        })

        return {
          fileBlames,
          authorSummaries,
          fileSummaries,
          personDbOverlay: personDb,
          delta: accumulatedDelta,
        }
      } catch (error) {
        if (typeof error === "object" && error !== null && "type" in error) {
          throw error
        }
        throw normalizeProviderError(error, "git", "analysis.blame")
      }
    },
  }
}
