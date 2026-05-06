import type {
  FileSystemDirectoryEntry,
  FileSystemEntryStatus,
  FileSystemPort,
  GitCommandPort,
  GitCommandRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type {
  RecordedAnalysisGitCommit,
  RecordedAnalysisGitFixture,
  RecordedAnalysisGitRepo,
  RecordedAnalysisGitTreeEntry,
} from "./analysis-git-fixture-types.js"

const commitDelimiter = "---commit-boundary---"

function ok(stdout = ""): ProcessResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
  }
}

function fail(stderr: string): ProcessResult {
  return {
    exitCode: 128,
    signal: null,
    stdout: "",
    stderr,
  }
}

function normalizePath(path: string): string {
  if (path === "/") return path
  return path.replaceAll("\\", "/").replace(/\/+$/, "")
}

function joinPath(base: string, child: string): string {
  return `${normalizePath(base)}/${child.replace(/^\/+/, "")}`
}

function splitGitCwd(request: GitCommandRequest): {
  cwd: string | undefined
  args: string[]
} {
  const args = [...request.args]
  let cwd = request.cwd

  while (args[0] === "-C" && args[1]) {
    cwd = args[1]
    args.splice(0, 2)
  }

  return { cwd: cwd ? normalizePath(cwd) : undefined, args }
}

function repoForPath(
  fixture: RecordedAnalysisGitFixture,
  path: string | undefined,
): RecordedAnalysisGitRepo | null {
  if (!path) return null
  const normalized = normalizePath(path)
  return (
    fixture.repos.find(
      (repo) =>
        normalized === repo.path || normalized.startsWith(`${repo.path}/`),
    ) ?? null
  )
}

function resolveCommit(
  repo: RecordedAnalysisGitRepo,
  ref: string | undefined,
): string | null {
  if (!ref || ref === "HEAD") return repo.headOid
  const normalized = ref.replace(/\^\{commit\}$/, "")
  return (
    repo.commits.find(
      (commit) =>
        commit.oid === normalized || commit.oid.startsWith(normalized),
    )?.oid ?? null
  )
}

function commitsThrough(
  repo: RecordedAnalysisGitRepo,
  commitOid: string,
): RecordedAnalysisGitCommit[] {
  const index = repo.commits.findIndex((commit) => commit.oid === commitOid)
  return index === -1 ? [] : repo.commits.slice(index)
}

function parseDateBoundary(
  value: string,
  boundary: "start" | "end",
): number | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, yearRaw, monthRaw, dayRaw] = dateOnly
    const year = Number.parseInt(yearRaw, 10)
    const month = Number.parseInt(monthRaw, 10) - 1
    const day = Number.parseInt(dayRaw, 10)
    const ms =
      boundary === "start"
        ? Date.UTC(year, month, day, 0, 0, 0)
        : Date.UTC(year, month, day, 23, 59, 59)
    return Math.floor(ms / 1000)
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

function optionValue(args: readonly string[], prefix: string): string | null {
  const match = args.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function treeText(entries: readonly RecordedAnalysisGitTreeEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${entry.mode} ${entry.type} ${entry.objectOid} ${entry.size}\t${entry.path}`,
    )
    .join("\n")
}

function logText(commits: readonly RecordedAnalysisGitCommit[]): string {
  return commits
    .map((commit) => {
      const header = [
        commitDelimiter,
        commit.shortOid,
        String(commit.timestamp),
        commit.authorName,
        commit.authorEmail,
        commit.message,
      ].join("\0")
      const files = commit.files
        .map(
          (file) => `\n${file.insertions}\t${file.deletions}\t${file.path}\0`,
        )
        .join("")
      return `${header}\0${files}`
    })
    .join("")
}

function selectLogCommits(
  repo: RecordedAnalysisGitRepo,
  args: readonly string[],
): RecordedAnalysisGitCommit[] | null {
  const commitRef = args.find(
    (arg, index) =>
      index > 0 &&
      arg !== "--" &&
      !arg.startsWith("-") &&
      args[index - 1] !== "--pretty=format:",
  )
  const commitOid = resolveCommit(repo, commitRef)
  if (!commitOid) return null

  const since = optionValue(args, "--since=")
  const until = optionValue(args, "--until=")
  const sinceTimestamp = since ? parseDateBoundary(since, "start") : null
  const untilTimestamp = until ? parseDateBoundary(until, "end") : null
  const pathSeparatorIndex = args.indexOf("--")
  const pathFilter =
    pathSeparatorIndex === -1 ? null : (args[pathSeparatorIndex + 1] ?? null)

  return commitsThrough(repo, commitOid)
    .filter((commit) => {
      if (sinceTimestamp !== null && commit.timestamp < sinceTimestamp) {
        return false
      }
      if (untilTimestamp !== null && commit.timestamp > untilTimestamp) {
        return false
      }
      return true
    })
    .flatMap((commit) => {
      if (!pathFilter) return [commit]
      const files = commit.files.filter((file) => file.path === pathFilter)
      return files.length > 0 ? [{ ...commit, files }] : []
    })
}

function handleRevParse(
  repo: RecordedAnalysisGitRepo | null,
  args: readonly string[],
): ProcessResult {
  if (!repo) return fail("not a git repository")

  if (args.includes("--show-toplevel")) {
    return ok(`${repo.path}\n`)
  }
  if (args.includes("--is-inside-work-tree")) {
    return ok("true\n")
  }
  if (args.includes("--git-dir")) {
    return ok(`${repo.path}/.git\n`)
  }
  if (args.includes("--abbrev-ref")) {
    return ok(`${repo.defaultBranch}\n`)
  }
  if (args.includes("--verify")) {
    const ref = args[args.indexOf("--verify") + 1]
    const commitOid = resolveCommit(repo, ref)
    return commitOid ? ok(`${commitOid}\n`) : fail("unknown revision")
  }

  const commitOid = resolveCommit(repo, args[1])
  return commitOid ? ok(`${commitOid}\n`) : fail("unknown revision")
}

function handleRevList(
  repo: RecordedAnalysisGitRepo | null,
  args: readonly string[],
): ProcessResult {
  if (!repo) return fail("not a git repository")
  const until = optionValue(args, "--until=")
  if (!until) return ok(`${repo.headOid}\n`)

  const untilTimestamp = parseDateBoundary(until, "end")
  const commit = repo.commits.find(
    (candidate) =>
      untilTimestamp === null || candidate.timestamp <= untilTimestamp,
  )
  return ok(commit ? `${commit.oid}\n` : "")
}

function handleGitCommand(
  fixture: RecordedAnalysisGitFixture,
  request: GitCommandRequest,
): ProcessResult {
  const { cwd, args } = splitGitCwd(request)
  const command = args[0]
  const repo = repoForPath(fixture, cwd)

  switch (command) {
    case "rev-parse":
      return handleRevParse(repo, args)
    case "rev-list":
      return handleRevList(repo, args)
    case "ls-tree": {
      if (!repo) return fail("not a git repository")
      const commitOid = resolveCommit(repo, args.at(-1))
      if (!commitOid) return fail("unknown revision")
      return ok(`${treeText(repo.treesByCommit[commitOid] ?? [])}\n`)
    }
    case "log": {
      if (!repo) return fail("not a git repository")
      const commits = selectLogCommits(repo, args)
      return commits ? ok(logText(commits)) : fail("unknown revision")
    }
    case "blame": {
      if (!repo) return fail("not a git repository")
      const separatorIndex = args.indexOf("--")
      const filePath =
        separatorIndex === -1 ? undefined : args[separatorIndex + 1]
      const commitRef =
        separatorIndex === -1 ? args.at(-1) : args[separatorIndex - 1]
      const commitOid = resolveCommit(repo, commitRef)
      if (!commitOid || !filePath) return fail("unknown revision")
      const stdout = repo.blameByCommit[commitOid]?.[filePath]
      return stdout === undefined ? fail("no such path") : ok(stdout)
    }
    case "diff":
    case "init":
    case "pull":
    case "remote":
    case "push":
    case "clone":
    case "show":
      return ok("")
    default:
      return ok("")
  }
}

function directoryEntries(
  fixture: RecordedAnalysisGitFixture,
  path: string,
): FileSystemDirectoryEntry[] {
  const normalized = normalizePath(path)
  if (normalized === fixture.rootPath) {
    return fixture.repos.map((repo) => ({
      name: repo.name,
      kind: "directory" as const,
    }))
  }

  const repo = repoForPath(fixture, normalized)
  if (!repo) return []

  const relativeDirectory =
    normalized === repo.path ? "" : normalized.slice(repo.path.length + 1)
  const prefix = relativeDirectory ? `${relativeDirectory}/` : ""
  const entries = new Map<string, FileSystemDirectoryEntry>()

  for (const treeEntry of repo.treesByCommit[repo.headOid] ?? []) {
    if (!treeEntry.path.startsWith(prefix)) continue
    const remainder = treeEntry.path.slice(prefix.length)
    if (remainder.length === 0) continue
    const slashIndex = remainder.indexOf("/")
    if (slashIndex === -1) {
      entries.set(remainder, { name: remainder, kind: "file" })
    } else {
      const name = remainder.slice(0, slashIndex)
      entries.set(name, { name, kind: "directory" })
    }
  }

  return [...entries.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

function inspectPath(
  fixture: RecordedAnalysisGitFixture,
  path: string,
): FileSystemEntryStatus {
  const normalized = normalizePath(path)
  if (normalized === fixture.rootPath) {
    return { path, kind: "directory" }
  }

  const repo = repoForPath(fixture, normalized)
  if (!repo) return { path, kind: "missing" }
  if (normalized === repo.path) return { path, kind: "directory" }

  const relativePath = normalized.slice(repo.path.length + 1)
  const headTree = repo.treesByCommit[repo.headOid] ?? []
  if (headTree.some((entry) => entry.path === relativePath)) {
    return { path, kind: "file" }
  }
  if (headTree.some((entry) => entry.path.startsWith(`${relativePath}/`))) {
    return { path, kind: "directory" }
  }

  return { path, kind: "missing" }
}

export function createRecordedAnalysisGitMock(
  fixture: RecordedAnalysisGitFixture,
): {
  gitCommandPort: GitCommandPort
  fileSystemPort: FileSystemPort
  pickDirectory: () => Promise<string | null>
} {
  return {
    gitCommandPort: {
      cancellation: "best-effort",
      async run(request) {
        return handleGitCommand(fixture, request)
      },
    },
    fileSystemPort: {
      userHomeSystemDirectories: [],
      async inspect(request) {
        return request.paths.map((path) => inspectPath(fixture, path))
      },
      async applyBatch(request) {
        return {
          completed: request.operations,
        }
      },
      async createTempDirectory(_prefix) {
        return joinPath(fixture.rootPath, ".tmp")
      },
      async listDirectory(request) {
        return directoryEntries(fixture, request.path)
      },
    },
    async pickDirectory() {
      return fixture.rootPath
    },
  }
}
