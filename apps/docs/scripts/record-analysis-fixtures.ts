import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type {
  RecordedAnalysisGitCommit,
  RecordedAnalysisGitFixture,
  RecordedAnalysisGitNumstat,
  RecordedAnalysisGitRepo,
  RecordedAnalysisGitTreeEntry,
} from "../src/fixtures/analysis-git-fixture-types.js"

const defaultSourcePath =
  "/Users/aivm/repos/fixtures-demo/c2-arithmetic-expression-evaluator"
const defaultDemoRootPath = "/repo-edu-demo/c2-arithmetic-expression-evaluator"
const generatedRelativePath =
  "../src/fixtures/generated-analysis-git-fixture.ts"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputPath = join(scriptDir, generatedRelativePath)
const sourcePath = process.env.DOCS_ANALYSIS_FIXTURE_SOURCE ?? defaultSourcePath
const demoRootPath =
  process.env.DOCS_ANALYSIS_FIXTURE_ROOT ?? defaultDemoRootPath

function gitText(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  })
}

function gitBuffer(cwd: string, args: string[]): Buffer {
  return execFileSync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 64,
  })
}

function isGitRepo(path: string): boolean {
  try {
    return statSync(join(path, ".git")).isDirectory()
  } catch {
    return false
  }
}

function listFixtureRepos(root: string): string[] {
  return readdirSync(root)
    .map((entry) => join(root, entry))
    .filter((path) => {
      try {
        return statSync(path).isDirectory() && isGitRepo(path)
      } catch {
        return false
      }
    })
    .sort()
}

function slugifyToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
}

function authorSurname(authorName: string): string {
  const parts = authorName.trim().split(/\s+/)
  return parts.at(-1) ?? authorName
}

function authorRepoName(commits: readonly RecordedAnalysisGitCommit[]): string {
  const surnames = new Set<string>()

  for (const commit of [...commits].reverse()) {
    const surname = slugifyToken(authorSurname(commit.authorName))
    if (surname.length > 0) {
      surnames.add(surname)
    }
  }

  return [...surnames].join("-") || "unknown-authors"
}

function parseNumstatZ(output: Buffer): RecordedAnalysisGitNumstat[] {
  const text = output.toString("utf8")
  const entries: RecordedAnalysisGitNumstat[] = []

  for (const record of text.split("\0")) {
    if (record.length === 0) continue
    const [insertionsRaw, deletionsRaw, path] = record
      .replace(/^\n+/, "")
      .split("\t")
    if (!insertionsRaw || !deletionsRaw || !path) continue
    entries.push({
      path,
      insertions:
        insertionsRaw === "-" ? 0 : Number.parseInt(insertionsRaw, 10),
      deletions: deletionsRaw === "-" ? 0 : Number.parseInt(deletionsRaw, 10),
    })
  }

  return entries
}

function recordCommit(
  repoPath: string,
  oid: string,
): RecordedAnalysisGitCommit {
  const metadata = gitText(repoPath, [
    "show",
    "-s",
    "--format=%H%x00%h%x00%ct%x00%aN%x00%aE%x00%B%x00",
    oid,
  ]).split("\0")

  const [fullOid, shortOid, timestampRaw, authorName, authorEmail] = metadata
  const message = (metadata[5] ?? "").trimEnd()
  const files = parseNumstatZ(
    gitBuffer(repoPath, ["show", "--numstat", "--format=", "-z", oid]),
  )

  return {
    oid: fullOid,
    shortOid,
    timestamp: Number.parseInt(timestampRaw, 10),
    authorName,
    authorEmail,
    message,
    files,
  }
}

function recordTree(
  repoPath: string,
  oid: string,
): RecordedAnalysisGitTreeEntry[] {
  return gitText(repoPath, ["ls-tree", "-r", "-l", "--full-name", oid])
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const tabIndex = line.indexOf("\t")
      if (tabIndex === -1) return []
      const [mode, type, objectOid, sizeRaw] = line
        .slice(0, tabIndex)
        .split(/\s+/)
      if (type !== "blob") return []
      return [
        {
          mode,
          type,
          objectOid,
          size: Number.parseInt(sizeRaw, 10),
          path: line.slice(tabIndex + 1),
        } satisfies RecordedAnalysisGitTreeEntry,
      ]
    })
}

function recordBlameForTree(
  repoPath: string,
  oid: string,
  tree: readonly RecordedAnalysisGitTreeEntry[],
): Record<string, string> {
  const blameByPath: Record<string, string> = {}

  for (const entry of tree) {
    try {
      blameByPath[entry.path] = gitText(repoPath, [
        "blame",
        "--follow",
        "--porcelain",
        oid,
        "--",
        entry.path,
      ])
    } catch {
      blameByPath[entry.path] = ""
    }
  }

  return blameByPath
}

type SourceRepoRecord = {
  repoPath: string
  name: string
  headOid: string
  defaultBranch: string
  commitOids: string[]
  commits: RecordedAnalysisGitCommit[]
}

function recordSourceRepo(repoPath: string): SourceRepoRecord {
  const headOid = gitText(repoPath, ["rev-parse", "HEAD"]).trim()
  const defaultBranch =
    gitText(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "main"
  const commitOids = gitText(repoPath, ["rev-list", "HEAD"])
    .split("\n")
    .filter(Boolean)
  const commits = commitOids.map((oid) => recordCommit(repoPath, oid))

  return {
    repoPath,
    name: authorRepoName(commits),
    headOid,
    defaultBranch,
    commitOids,
    commits,
  }
}

function recordRepo(
  sourceRepo: SourceRepoRecord,
  assignedName: string,
): RecordedAnalysisGitRepo {
  const virtualRepoPath = `${demoRootPath}/${assignedName}`
  const treesByCommit: Record<string, RecordedAnalysisGitTreeEntry[]> = {}
  const blameByCommit: Record<string, Record<string, string>> = {}

  for (const oid of sourceRepo.commitOids) {
    const tree = recordTree(sourceRepo.repoPath, oid)
    treesByCommit[oid] = tree
    blameByCommit[oid] = recordBlameForTree(sourceRepo.repoPath, oid, tree)
  }

  return {
    name: assignedName,
    path: virtualRepoPath,
    headOid: sourceRepo.headOid,
    defaultBranch: sourceRepo.defaultBranch,
    commits: sourceRepo.commits,
    treesByCommit,
    blameByCommit,
  }
}

function serializeFixture(fixture: RecordedAnalysisGitFixture): string {
  return [
    "/* eslint-disable */",
    "// AUTO-GENERATED by apps/docs/scripts/record-analysis-fixtures.ts.",
    "// Do not edit manually; regenerate from the source fixture repositories.",
    'import type { RecordedAnalysisGitFixture } from "./analysis-git-fixture-types.js"',
    "",
    `export const docsAnalysisGitFixture: RecordedAnalysisGitFixture = ${JSON.stringify(
      fixture,
      null,
      2,
    )}`,
    "",
  ].join("\n")
}

const sourceRepoPaths = listFixtureRepos(sourcePath)
if (sourceRepoPaths.length === 0) {
  throw new Error(`No git repositories found under ${sourcePath}`)
}
const recordedRepos = sourceRepoPaths.map(recordSourceRepo)
const nameCounts = new Map<string, number>()
const repos = recordedRepos.map((recorded) => {
  const count = (nameCounts.get(recorded.name) ?? 0) + 1
  nameCounts.set(recorded.name, count)
  const uniqueName =
    count === 1
      ? recorded.name
      : `${recorded.name}-${recorded.headOid.slice(0, 7)}`
  return recordRepo(recorded, uniqueName)
})
const latestCommitTimestamp = Math.max(
  ...repos.flatMap((repo) => repo.commits.map((commit) => commit.timestamp)),
)

const fixture: RecordedAnalysisGitFixture = {
  rootPath: demoRootPath,
  recordedAt: new Date(latestCommitTimestamp * 1000).toISOString(),
  repos,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, serializeFixture(fixture))
console.log(`Recorded ${repos.length} analysis fixture repos to ${outputPath}`)
