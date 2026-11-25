import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, posix } from "node:path"
import { execa } from "execa"
import { lock } from "proper-lockfile"
import type { CommitStamps } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { commitOnly, type LifecycleCommit } from "./lifecycle.js"
import type { PhaseFailure } from "./phase.js"
import { splitLabel } from "./round-paths.js"
import { type Answer, type NamedAnswer, savedAnswer } from "./split-answers.js"
import type { AttemptFile, AttemptReply } from "./split-attempt.js"
import {
  type Choice,
  type DesignSessions,
  designSplit,
  type Moves,
  type TrialFailure,
} from "./split-design.js"
import type { SplitResult, SplitResultWord } from "./split-result.js"
import { parseSubject } from "./subject.js"
import { committedListPath, numberedListPath } from "./target.js"

export type SplitRequest =
  | { mode: "design" | "both"; source: string; sessions: DesignSessions }
  | { mode: "run"; named: NamedAnswer }
export type CheckFailure = { readonly command: string; readonly output: string }
export type SplitDependencies = {
  attempt: (list: Moves) => Promise<AttemptReply>
  checks: (pkg: string) => Promise<CheckFailure | null>
  message: (text: string) => Promise<void>
}

/** A commit whose environment carries no round's stamps, so its own record stands. */
const ownRecord: CommitStamps = { auditor: null, phases: null, series: null }

/**
 * Git's blob hash of the source as `git hash-object` prints it, after the
 * line-ending normalisation of the repository's attributes.
 */
export async function blobHash(
  repoEduRoot: string,
  source: string,
): Promise<string> {
  return (
    await execa("git", ["hash-object", "--", source], { cwd: repoEduRoot })
  ).stdout.trim()
}

/** The workspace package a source belongs to, as `pnpm test` names it. */
export function sourcePackage(source: string): string {
  const [group, name] = source.split("/")
  return `${group}/${name}`
}

/**
 * Hold the split lock while `work` runs. Two calls never change files at the
 * same time, so a second call waits for the lock. The lock lives in the Repo
 * Edu checkout's Git folder, beside the working tree it guards, and frees
 * itself 10 seconds after a killed holder stops refreshing it.
 */
export async function withSplitLock<T>(
  repoEduRoot: string,
  work: () => Promise<T>,
): Promise<T> {
  const gitDir = (
    await execa("git", ["rev-parse", "--absolute-git-dir"], {
      cwd: repoEduRoot,
    })
  ).stdout.trim()
  const release = await lock(gitDir, {
    lockfilePath: join(gitDir, "audit-round-split.lock"),
    realpath: false,
    retries: { forever: true, minTimeout: 200, maxTimeout: 1000 },
  })
  try {
    return await work()
  } finally {
    await release()
  }
}

/** Run `pnpm check` and then the tests of the source's package. */
export async function runChecks(
  repoEduRoot: string,
  pkg: string,
  signal?: AbortSignal,
): Promise<CheckFailure | null> {
  for (const args of [["check"], ["test", pkg]]) {
    const run = await execa("pnpm", args, {
      cwd: repoEduRoot,
      all: true,
      reject: false,
      cancelSignal: signal,
    })
    if (signal?.aborted === true) throw signal.reason
    if (run.exitCode !== 0)
      return { command: `pnpm ${args.join(" ")}`, output: run.all.trim() }
  }
  return null
}

/** The paths of the file set that Git shows with any change beside HEAD. */
async function uncommitted(
  root: string,
  paths: readonly string[],
): Promise<readonly string[]> {
  const { stdout } = await execa(
    "git",
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignored",
      "--",
      ...paths,
    ],
    { cwd: root },
  )
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3))
}

/** One file as the split found it: its text, or null when the split creates it. */
type Original = { readonly path: string; readonly text: string | null }

/** Put every file of the split back as it was: restore its text or remove it. */
async function restore(
  repoEduRoot: string,
  originals: readonly Original[],
): Promise<void> {
  for (const { path, text } of originals) {
    const file = join(repoEduRoot, path)
    if (text === null) await rm(file, { force: true })
    else await writeFile(file, text, "utf8")
  }
}

/** A target list in words, as `a`, `a and b` or `a, b and c`. */
function listed(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/** Publish the selected text and remove its predecessor in one plan commit. */
async function publish(
  context: ExecutionContext,
  choice: Choice,
  path: string,
): Promise<string | LifecycleCommit> {
  const { selected, pick } = choice
  const { source } = selected.list
  const old = await committedListPath(context.planRoot, source)
  const paths = old && old !== path ? [path, old] : [path]
  const dirty = await uncommitted(context.planRoot, paths)
  if (dirty.length)
    return `Move list paths have uncommitted changes: ${dirty.join(", ")}.`
  await mkdir(dirname(join(context.planRoot, path)), { recursive: true })
  await writeFile(join(context.planRoot, path), selected.text)
  if (old && old !== path) await rm(join(context.planRoot, old))
  const label = splitLabel(source)
  const subject = pick
    ? `${label}/design ${pick.writer.tag}: pick answer ${selected.record.number} for ${source}`
    : `${label}/choose: choose answer ${selected.record.number} for ${source}`
  parseSubject(subject, "plan")
  const body = pick
    ? [
        `${pick.writer.model} ${pick.writer.effort}`,
        "",
        `- Selected from answer ${pick.original}.`,
        ...pick.designers.map(
          ({ record }) =>
            `- Answer ${record.number} ran on ${record.model} ${record.effort}.`,
        ),
      ].join("\n")
    : undefined
  return commitOnly({
    cwd: context.planRoot,
    subject,
    body,
    paths,
    stamps: ownRecord,
  })
}

export async function runSplit(
  context: ExecutionContext,
  request: SplitRequest,
  dependencies: SplitDependencies,
): Promise<{ status: "result"; result: SplitResult } | PhaseFailure> {
  const { repoEduRoot, roundRoot } = context
  const source =
    request.mode === "run" ? request.named.list.source : request.source
  const label = splitLabel(source)
  const say = dependencies.message
  const hash =
    request.mode === "run"
      ? request.named.list.hash
      : await blobHash(repoEduRoot, source)
  const ended = (result: SplitResultWord, message: string) => ({
    status: "result" as const,
    result: { result, hash, message },
  })
  const stale = () =>
    ended("skipped", `${source} changed since the move list was designed.`)
  let choice: Choice
  if (request.mode === "run") {
    if ((await blobHash(repoEduRoot, source)) !== hash) return stale()
    choice = { selected: await savedAnswer(roundRoot, label, request.named) }
  } else {
    const outcome = await designSplit(
      source,
      hash,
      roundRoot,
      request.sessions,
      (answers) =>
        withSplitLock(repoEduRoot, async () => {
          const replies: (TrialFailure | null)[] = []
          for (const { list } of answers) {
            const trial =
              list.kind === "moves" ? await dependencies.attempt(list) : null
            replies.push(trial?.outcome === "clean" ? null : trial)
          }
          return replies
        }),
    )
    if ("status" in outcome) return outcome
    if ("result" in outcome) return ended(outcome.result, outcome.message)
    choice = outcome
  }
  const { selected } = choice
  const { list, record } = selected
  if (
    request.mode !== "run" &&
    list.kind === "no-split" &&
    (await blobHash(repoEduRoot, source)) !== hash
  )
    return stale()
  if (list.kind === "no-split") return ended(list.result, list.reason)
  const listPath = numberedListPath(source, record.number)
  const written = await withSplitLock(
    repoEduRoot,
    async (): Promise<
      | { ended: ReturnType<typeof ended> }
      | { files: readonly AttemptFile[]; originals: readonly Original[] }
    > => {
      const reply = await dependencies.attempt(list)
      if (reply.outcome === "changed") return { ended: stale() }
      if (reply.outcome === "refused")
        return { ended: ended("needs-plan", reply.message) }
      if (request.mode !== "run" || request.named.tag !== undefined) {
        const commit = await publish(context, choice, listPath)
        if (typeof commit === "string")
          return { ended: ended("skipped", commit) }
        await say(`Committed ${commit.sha}: ${commit.subject}`)
      }
      if (request.mode === "design")
        return { ended: ended("designed", join(context.planRoot, listPath)) }
      const dirty = await uncommitted(
        repoEduRoot,
        reply.files.map((file) => file.path),
      )
      if (dirty.length)
        return {
          ended: ended(
            "skipped",
            `Files the split would write have uncommitted changes: ${dirty.join(", ")}.`,
          ),
        }
      const originals = await Promise.all(
        reply.files.map(async (file) => ({
          path: file.path,
          text: file.isNew
            ? null
            : await readFile(join(repoEduRoot, file.path), "utf8"),
        })),
      )
      try {
        for (const file of reply.files) {
          const path = join(repoEduRoot, file.path)
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, file.text)
        }
      } catch (error) {
        await restore(repoEduRoot, originals)
        throw error
      }
      return { files: reply.files, originals }
    },
  )
  if ("ended" in written) return written.ended
  const pkg = sourcePackage(source)
  await say(`Running pnpm check and pnpm test ${pkg}.`)
  const putBack = () =>
    withSplitLock(repoEduRoot, () => restore(repoEduRoot, written.originals))
  let failure: CheckFailure | null
  try {
    failure = await dependencies.checks(pkg)
  } catch (error) {
    // An interrupted check proves nothing, so the split is not left half
    // judged on disk.
    await putBack()
    throw error
  }
  if (failure !== null) {
    await putBack()
    await say(`${failure.command} failed, so the split's files are restored.`)
    return ended(
      "checks-failed",
      `${failure.command} failed:\n${failure.output}`,
    )
  }
  const commit = await commitSplit(
    context,
    selected,
    list,
    written.files.map((file) => file.path),
  )
  await say(`Committed ${commit.sha}: ${commit.subject}`)
  const targets = list.moves.map((move) => move.target)
  return ended(
    "made",
    `${source} was split into ${listed(targets)}, in commit ${commit.sha.slice(0, 6)}.`,
  )
}

async function commitSplit(
  context: ExecutionContext,
  selected: Answer,
  list: Moves,
  paths: readonly string[],
): Promise<LifecycleCommit> {
  const { source } = list
  const { record } = selected
  const label = splitLabel(source)
  const names = list.moves.map((move) => posix.basename(move.target))
  const subject = `${label}/split ${record.tag} refactor(${list.area}): split ${posix.basename(source)} into ${listed(names)}`
  parseSubject(subject, "repo-edu")
  const body = [
    `${record.model} ${record.effort}`,
    "",
    `- Carries out the move list ${numberedListPath(source, record.number)} for \`${source}\`.`,
    ...list.moves.map((move) => `- \`${move.target}\`: ${move.responsibility}`),
  ].join("\n")
  return commitOnly({
    cwd: context.repoEduRoot,
    subject,
    body,
    paths,
    stamps: ownRecord,
  })
}
