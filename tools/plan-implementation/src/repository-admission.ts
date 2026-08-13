import { createHash } from "node:crypto"
import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import type { CodingCommitProposal, PlanSourceIdentity } from "./contracts.js"
import { readGitText, runGit } from "./git-command.js"
import { parseZeroSeparatedGitLog } from "./git-log.js"
import { createPlanStepCommitMessage } from "./plan-record.js"

const singleCommitFormat = "format:%H%x00%s%x00%b%x00"
const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

export type RepositoryAdmission = {
  readonly repoEduRoot: string
  readonly branchRef: string
  readonly headOid: string
  readonly cleanIndexFingerprint: string
}

export type AdmittedRepositoryDiff = {
  readonly paths: readonly string[]
  readonly dependencyManifestChanged: boolean
}

export type RepositoryStepCommit = {
  readonly commitOid: string
  readonly nextAdmission: RepositoryAdmission
}

export class RepositoryAdmissionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "RepositoryAdmissionError"
  }
}

function parseNullSeparatedPaths(
  output: Buffer,
  description: string,
): readonly string[] {
  if (output.length === 0) return []
  const fields = output.toString("utf8").split("\0")
  if (fields.pop() !== "" || fields.some((field) => field.length === 0)) {
    throw new RepositoryAdmissionError(
      `${description} did not contain complete zero-separated paths.`,
    )
  }
  return fields
}

function canonicalPathSet(paths: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(paths)].sort())
}

function samePaths(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
  )
}

function isDependencyManifest(path: string): boolean {
  return (
    path === "package.json" ||
    path === "pnpm-workspace.yaml" ||
    path.endsWith("/package.json")
  )
}

async function readFullObjectId(
  repoEduRoot: string,
  revision: string,
): Promise<string> {
  const oid = await readGitText(repoEduRoot, [
    "rev-parse",
    "--verify",
    revision,
  ])
  if (!fullObjectIdPattern.test(oid)) {
    throw new RepositoryAdmissionError(
      `Git did not return a full lowercase object ID for ${revision}.`,
    )
  }
  return oid
}

async function readBranchRef(repoEduRoot: string): Promise<string> {
  try {
    const branchRef = await readGitText(repoEduRoot, [
      "symbolic-ref",
      "--quiet",
      "HEAD",
    ])
    if (!branchRef.startsWith("refs/heads/")) {
      throw new Error("Git returned a non-branch symbolic reference.")
    }
    return branchRef
  } catch (error) {
    throw new RepositoryAdmissionError(
      "Plan implementation requires a current branch, not a detached HEAD.",
      { cause: error },
    )
  }
}

async function readIndexFingerprint(repoEduRoot: string): Promise<string> {
  const [entries, flags] = await Promise.all([
    runGit(repoEduRoot, ["ls-files", "--stage", "-z"]),
    runGit(repoEduRoot, ["ls-files", "-v", "-z"]),
  ])
  return createHash("sha256")
    .update(entries.stdout)
    .update("\0index-flags\0")
    .update(flags.stdout)
    .digest("hex")
}

async function readCheckoutStatus(repoEduRoot: string): Promise<Buffer> {
  return (
    await runGit(repoEduRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ])
  ).stdout
}

async function readOwnedPaths(repoEduRoot: string): Promise<readonly string[]> {
  const [tracked, untracked] = await Promise.all([
    runGit(repoEduRoot, ["diff", "--name-only", "-z", "--no-renames", "--"]),
    runGit(repoEduRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ])
  return canonicalPathSet([
    ...parseNullSeparatedPaths(tracked.stdout, "The tracked diff"),
    ...parseNullSeparatedPaths(untracked.stdout, "The untracked diff"),
  ])
}

async function readStagedPaths(
  repoEduRoot: string,
): Promise<readonly string[]> {
  const staged = await runGit(repoEduRoot, [
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--no-renames",
    "--",
  ])
  return canonicalPathSet(
    parseNullSeparatedPaths(staged.stdout, "The staged diff"),
  )
}

async function requireControlState(
  admission: RepositoryAdmission,
  options: { readonly compareIndex: boolean },
): Promise<void> {
  const [headOid, branchRef, indexFingerprint] = await Promise.all([
    readFullObjectId(admission.repoEduRoot, "HEAD"),
    readBranchRef(admission.repoEduRoot),
    options.compareIndex
      ? readIndexFingerprint(admission.repoEduRoot)
      : Promise.resolve(admission.cleanIndexFingerprint),
  ])
  if (headOid !== admission.headOid) {
    throw new RepositoryAdmissionError(
      "Codex or another process changed HEAD outside the runner-owned commit.",
    )
  }
  if (branchRef !== admission.branchRef) {
    throw new RepositoryAdmissionError(
      "Codex or another process changed the current branch.",
    )
  }
  if (
    options.compareIndex &&
    indexFingerprint !== admission.cleanIndexFingerprint
  ) {
    throw new RepositoryAdmissionError(
      "Codex or another process changed the Git index.",
    )
  }
}

async function requireNoUnstagedOrUntracked(
  repoEduRoot: string,
): Promise<void> {
  const [unstaged, untracked] = await Promise.all([
    runGit(repoEduRoot, ["diff", "--name-only", "-z", "--no-renames", "--"]),
    runGit(repoEduRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ])
  if (unstaged.stdout.length > 0 || untracked.stdout.length > 0) {
    throw new RepositoryAdmissionError(
      "The staged diff does not contain the complete admitted worktree diff.",
    )
  }
}

export async function resolveRepoEduRoot(startPath: string): Promise<string> {
  try {
    const root = await readGitText(startPath, ["rev-parse", "--show-toplevel"])
    return await realpath(resolve(root))
  } catch (error) {
    throw new RepositoryAdmissionError(
      "Plan implementation must run inside the Repo Edu Git checkout.",
      { cause: error },
    )
  }
}

export async function openRepositoryAdmission(
  repoEduRoot: string,
): Promise<RepositoryAdmission> {
  const root = await resolveRepoEduRoot(repoEduRoot)
  if ((await readCheckoutStatus(root)).length > 0) {
    throw new RepositoryAdmissionError(
      "Plan implementation requires no staged, unstaged or untracked files.",
    )
  }
  const [headOid, branchRef, cleanIndexFingerprint] = await Promise.all([
    readFullObjectId(root, "HEAD"),
    readBranchRef(root),
    readIndexFingerprint(root),
  ])
  return Object.freeze({
    repoEduRoot: root,
    branchRef,
    headOid,
    cleanIndexFingerprint,
  })
}

export async function requireCodingRepositoryControl(
  admission: RepositoryAdmission,
): Promise<void> {
  await requireControlState(admission, { compareIndex: true })
}

export async function admitOwnedRepositoryDiff(
  admission: RepositoryAdmission,
): Promise<AdmittedRepositoryDiff> {
  await requireControlState(admission, { compareIndex: true })
  const paths = await readOwnedPaths(admission.repoEduRoot)
  if (paths.length === 0) {
    throw new RepositoryAdmissionError(
      "A succeeded coding result requires a non-empty owned diff.",
    )
  }
  return Object.freeze({
    paths,
    dependencyManifestChanged: paths.some(isDependencyManifest),
  })
}

export async function requireAdmittedRepositoryDiff(
  admission: RepositoryAdmission,
  admitted: AdmittedRepositoryDiff,
): Promise<void> {
  await requireControlState(admission, { compareIndex: true })
  const currentPaths = await readOwnedPaths(admission.repoEduRoot)
  if (!samePaths(currentPaths, admitted.paths)) {
    throw new RepositoryAdmissionError(
      "The worktree path set changed after repository admission.",
    )
  }
}

export async function stageAdmittedRepositoryDiff(
  admission: RepositoryAdmission,
  admitted: AdmittedRepositoryDiff,
): Promise<void> {
  await requireAdmittedRepositoryDiff(admission, admitted)
  await runGit(admission.repoEduRoot, ["add", "--all"])
  const stagedPaths = await readStagedPaths(admission.repoEduRoot)
  if (!samePaths(stagedPaths, admitted.paths)) {
    throw new RepositoryAdmissionError(
      "The staged path set does not equal the admitted owned diff path set.",
    )
  }
  await requireNoUnstagedOrUntracked(admission.repoEduRoot)
}

export async function commitAdmittedRepositoryDiff(
  admission: RepositoryAdmission,
  admitted: AdmittedRepositoryDiff,
  source: PlanSourceIdentity,
  step: number,
  proposal: CodingCommitProposal,
): Promise<RepositoryStepCommit> {
  await requireControlState(admission, { compareIndex: false })
  const stagedPaths = await readStagedPaths(admission.repoEduRoot)
  if (!samePaths(stagedPaths, admitted.paths)) {
    throw new RepositoryAdmissionError(
      "The staged path set changed before the runner-owned commit.",
    )
  }
  await requireNoUnstagedOrUntracked(admission.repoEduRoot)

  const message = createPlanStepCommitMessage(source, step, proposal)
  try {
    await runGit(admission.repoEduRoot, [
      "commit",
      "--message",
      message.subject,
      "--message",
      message.body,
    ])
  } catch (error) {
    throw new RepositoryAdmissionError(
      "Git could not write the runner-owned step commit.",
      { cause: error },
    )
  }

  const [commitOid, parentOid, branchRef, changedPaths, history] =
    await Promise.all([
      readFullObjectId(admission.repoEduRoot, "HEAD"),
      readFullObjectId(admission.repoEduRoot, "HEAD^"),
      readBranchRef(admission.repoEduRoot),
      runGit(admission.repoEduRoot, [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-z",
        "-r",
        "--no-renames",
        "HEAD",
      ]),
      runGit(admission.repoEduRoot, [
        "log",
        "-1",
        `--format=${singleCommitFormat}`,
      ]),
    ])
  const actualPaths = canonicalPathSet(
    parseNullSeparatedPaths(changedPaths.stdout, "The committed diff"),
  )
  const commitFields = parseZeroSeparatedGitLog(history.stdout)
  if (parentOid !== admission.headOid) {
    throw new RepositoryAdmissionError(
      "The runner-owned step commit did not use the admitted HEAD as its parent.",
    )
  }
  if (branchRef !== admission.branchRef) {
    throw new RepositoryAdmissionError(
      "The current branch changed during the runner-owned commit.",
    )
  }
  if (!samePaths(actualPaths, admitted.paths)) {
    throw new RepositoryAdmissionError(
      "The committed path set does not equal the admitted owned diff path set.",
    )
  }
  if (
    commitFields.length !== 1 ||
    commitFields[0].commitOid !== commitOid ||
    commitFields[0].subject !== message.subject ||
    commitFields[0].body !== `${message.body}\n`
  ) {
    throw new RepositoryAdmissionError(
      "Git did not preserve the exact runner-owned step commit record.",
    )
  }
  if ((await readCheckoutStatus(admission.repoEduRoot)).length > 0) {
    throw new RepositoryAdmissionError(
      "The Repo Edu checkout is not clean after the step commit.",
    )
  }

  return {
    commitOid,
    nextAdmission: Object.freeze({
      repoEduRoot: admission.repoEduRoot,
      branchRef: admission.branchRef,
      headOid: commitOid,
      cleanIndexFingerprint: await readIndexFingerprint(admission.repoEduRoot),
    }),
  }
}
