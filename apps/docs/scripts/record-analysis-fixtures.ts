import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type {
  GeneratedRepoSlot,
  RecordedAnalysisGitCommit,
  RecordedAnalysisGitNumstat,
  RecordedAnalysisGitRepo,
  RecordedAnalysisGitTreeEntry,
} from "../src/fixtures/analysis-git-fixture-types.js"
import { extractRecordedAuthors } from "../src/fixtures/recorded-repo-slots.js"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "../../..")
const fixturesDemoRoot = resolve(workspaceRoot, "../fixtures-demo")
const projectsRoot = resolve(workspaceRoot, "apps/docs/src/fixtures/projects")
const demoRootPath =
  process.env.DOCS_ANALYSIS_FIXTURE_ROOT ??
  "/repo-edu-demo/shared-analysis-fixture"

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

function fail(message: string): never {
  throw new Error(message)
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\")
}

function slugifyToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function variableName(projectId: string, slotId: string): string {
  return `${projectId.replaceAll("-", "_")}Slot_${slotId.replaceAll("-", "_")}`
}

function projectDir(projectId: string): string {
  return resolve(projectsRoot, projectId)
}

function generatedDir(projectId: string): string {
  return resolve(projectDir(projectId), "generated")
}

function leafPath(projectId: string, slotId: string): string {
  return resolve(generatedDir(projectId), `${slotId}.fixture.ts`)
}

function isGitRepo(path: string): boolean {
  try {
    return statSync(resolve(path, ".git")).isDirectory()
  } catch {
    return false
  }
}

function sourceRepoPath(sourcePath: string): string {
  return isAbsolute(sourcePath)
    ? sourcePath
    : resolve(fixturesDemoRoot, sourcePath)
}

function sourcePathForLeaf(inputPath: string): string {
  const absolute = sourceRepoPath(inputPath)
  const relativePath = relative(fixturesDemoRoot, absolute)
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    fail(`source path must be under ${fixturesDemoRoot}: ${inputPath}`)
  }
  return relativePath.replaceAll("\\", "/")
}

function parseNumstatZ(output: Buffer): RecordedAnalysisGitNumstat[] {
  const entries: RecordedAnalysisGitNumstat[] = []

  for (const record of output.toString("utf8").split("\0")) {
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
  headOid: string
  defaultBranch: string
  commitOids: string[]
  commits: RecordedAnalysisGitCommit[]
}

function recordSourceRepo(repoPath: string): SourceRepoRecord {
  if (!isGitRepo(repoPath)) fail(`not a git repository: ${repoPath}`)
  const headOid = gitText(repoPath, ["rev-parse", "HEAD"]).trim()
  const defaultBranch =
    gitText(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "main"
  const commitOids = gitText(repoPath, ["rev-list", "HEAD"])
    .split("\n")
    .filter(Boolean)
  const commits = commitOids.map((oid) => recordCommit(repoPath, oid))

  return {
    repoPath,
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
  const treesByCommit: Record<string, RecordedAnalysisGitTreeEntry[]> = {}
  const blameByCommit: Record<string, Record<string, string>> = {}

  for (const oid of sourceRepo.commitOids) {
    const tree = recordTree(sourceRepo.repoPath, oid)
    treesByCommit[oid] = tree
    blameByCommit[oid] = recordBlameForTree(sourceRepo.repoPath, oid, tree)
  }

  return {
    name: assignedName,
    path: `${demoRootPath}/${assignedName}`,
    headOid: sourceRepo.headOid,
    defaultBranch: sourceRepo.defaultBranch,
    commits: sourceRepo.commits,
    treesByCommit,
    blameByCommit,
  }
}

function serializeSlot(slot: GeneratedRepoSlot): string {
  return [
    "/* eslint-disable */",
    "// AUTO-GENERATED by apps/docs/scripts/record-analysis-fixtures.ts.",
    "// Do not edit manually; regenerate from the source fixture repository.",
    'import type { GeneratedRepoSlot } from "../../../analysis-git-fixture-types.js"',
    "",
    `export const ${variableName(slot.projectId, slot.slotId)}: GeneratedRepoSlot = ${JSON.stringify(
      slot,
      null,
      2,
    )}`,
    "",
  ].join("\n")
}

function serializeGeneratedIndex(projectId: string, slotIds: string[]): string {
  const imports = slotIds.map(
    (slotId) =>
      `import { ${variableName(projectId, slotId)} } from "./${slotId}.fixture.js"`,
  )
  const entries = slotIds
    .map((slotId) => `  ${variableName(projectId, slotId)}`)
    .join(",\n")
  return [
    ...imports,
    'import type { GeneratedRepoSlot } from "../../../analysis-git-fixture-types.js"',
    'import { recordedAtForSlots } from "../../../recorded-repo-slots.js"',
    "",
    `export const projectId = "${projectId}"`,
    "export const generatedRepoSlots = [",
    entries,
    "] satisfies GeneratedRepoSlot[]",
    "export const recordedAt = recordedAtForSlots(generatedRepoSlots)",
    "",
  ].join("\n")
}

function writeProjectIndex(projectId: string): void {
  const dir = generatedDir(projectId)
  const slotIds = readdirSync(dir)
    .filter((entry) => entry.endsWith(".fixture.ts"))
    .map((entry) => entry.replace(/\.fixture\.ts$/, ""))
    .sort()
  writeFileSync(
    resolve(dir, "index.ts"),
    serializeGeneratedIndex(projectId, slotIds),
  )
  writeFileSync(
    resolve(projectDir(projectId), "index.ts"),
    'export * from "./generated/index.js"\n',
  )
}

async function loadSlot(
  projectId: string,
  slotId: string,
): Promise<GeneratedRepoSlot> {
  const path = leafPath(projectId, slotId)
  if (!existsSync(path)) fail(`slot not found: ${projectId}/${slotId}`)
  const href = `${pathToFileURL(path).href}?t=${Date.now()}`
  const mod = (await import(href)) as Record<string, GeneratedRepoSlot>
  const slot = mod[variableName(projectId, slotId)]
  if (!slot) fail(`slot export not found in ${path}`)
  return slot
}

function listProjects(): string[] {
  return readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function listProjectSlotIds(projectId: string): string[] {
  return readdirSync(generatedDir(projectId))
    .filter((entry) => entry.endsWith(".fixture.ts"))
    .map((entry) => entry.replace(/\.fixture\.ts$/, ""))
    .sort()
}

async function recordSlot(
  existing: GeneratedRepoSlot,
  updateCommitOid: boolean,
): Promise<GeneratedRepoSlot> {
  const repoPath = sourceRepoPath(existing.source.path)
  const headOid = gitText(repoPath, ["rev-parse", "HEAD"]).trim()
  if (headOid !== existing.source.commitOid && !updateCommitOid) {
    fail(
      `${existing.projectId}/${existing.slotId}: source HEAD ${headOid} does not match recorded source.commitOid ${existing.source.commitOid}; pass --update-commit-oid to accept the new source HEAD`,
    )
  }
  const sourceRepo = recordSourceRepo(repoPath)
  return {
    ...existing,
    source: {
      ...existing.source,
      commitOid: updateCommitOid
        ? sourceRepo.headOid
        : existing.source.commitOid,
    },
    recordedAuthors: extractRecordedAuthors(sourceRepo.commits),
    repo: recordRepo(sourceRepo, existing.repoName),
  }
}

async function bootstrap(
  projectId: string,
  inputSourcePath: string,
  slotIdInput: string | undefined,
): Promise<void> {
  const sourcePath = sourcePathForLeaf(inputSourcePath)
  const repoPath = sourceRepoPath(sourcePath)
  const sourceRepo = recordSourceRepo(repoPath)
  const slotId = slotIdInput ?? slugifyToken(basename(repoPath))
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slotId)) {
    fail(`slot id must be kebab-case, got "${slotId}"`)
  }
  const path = leafPath(projectId, slotId)
  if (existsSync(path)) fail(`slot already exists: ${projectId}/${slotId}`)
  mkdirSync(dirname(path), { recursive: true })
  const repoName = `${projectId}-${slotId}`
  const slot: GeneratedRepoSlot = {
    slotKey: `${projectId}:${slotId}`,
    slotId,
    projectId,
    repoName,
    source: {
      path: sourcePath,
      commitOid: sourceRepo.headOid,
    },
    recordedAuthors: extractRecordedAuthors(sourceRepo.commits),
    repo: recordRepo(sourceRepo, repoName),
  }
  writeFileSync(path, serializeSlot(slot))
  writeProjectIndex(projectId)
  process.stdout.write(
    `Bootstrapped ${projectId}/${slotId} from ${sourcePath}\n`,
  )
}

async function record(
  target: string | undefined,
  updateCommitOid: boolean,
): Promise<void> {
  const affected: Array<[projectId: string, slotId: string]> = []
  if (!target) {
    for (const projectId of listProjects()) {
      for (const slotId of listProjectSlotIds(projectId)) {
        affected.push([projectId, slotId])
      }
    }
  } else if (target.includes("/")) {
    const [projectId, slotId] = target.split("/")
    if (!projectId || !slotId || hasPathSeparator(slotId)) {
      fail(
        `record target must be <project> or <project>/<slotId>, got ${target}`,
      )
    }
    affected.push([projectId, slotId])
  } else {
    for (const slotId of listProjectSlotIds(target))
      affected.push([target, slotId])
  }

  for (const [projectId, slotId] of affected) {
    const slot = await loadSlot(projectId, slotId)
    const updated = await recordSlot(slot, updateCommitOid)
    writeFileSync(leafPath(projectId, slotId), serializeSlot(updated))
    writeProjectIndex(projectId)
  }
  process.stdout.write(`Recorded ${affected.length} fixture slot(s)\n`)
}

function parseArgs(argv: string[]): {
  command: string
  args: string[]
  slotId?: string
  updateCommitOid: boolean
} {
  const args: string[] = []
  let slotId: string | undefined
  let updateCommitOid = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--slot-id") {
      slotId = argv[++index]
      if (!slotId) fail("--slot-id requires a value")
    } else if (arg === "--update-commit-oid") {
      updateCommitOid = true
    } else {
      args.push(arg)
    }
  }
  return {
    command: args[0] ?? "record",
    args: args.slice(1),
    slotId,
    updateCommitOid,
  }
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.command === "bootstrap") {
  const [projectId, sourcePath] = parsed.args
  if (!projectId || !sourcePath) {
    fail(
      "Usage: pnpm docs:record-fixtures bootstrap <project> <sourcePath> [--slot-id <id>]",
    )
  }
  await bootstrap(projectId, sourcePath, parsed.slotId)
} else if (parsed.command === "record") {
  await record(parsed.args[0], parsed.updateCommitOid)
} else {
  fail(`unknown subcommand "${parsed.command}"; expected bootstrap or record`)
}
