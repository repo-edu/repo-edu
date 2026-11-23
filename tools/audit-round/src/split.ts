import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, posix } from "node:path"
import { execa } from "execa"
import { lock } from "proper-lockfile"
import type { CommitStamps } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { commitOnly, type LifecycleCommit } from "./lifecycle.js"
import { type MoveList, readMoveList } from "./move-list.js"
import { splitLabel } from "./round-paths.js"
import type { AttemptFile, AttemptReply } from "./split-attempt.js"
import type { DesignIdentity } from "./split-output.js"
import type { SplitResult, SplitResultWord } from "./split-result.js"
import { parseSubject } from "./subject.js"
import { moveListFile } from "./target.js"

type Moves = Extract<MoveList, { kind: "moves" }>

/**
 * How the rounds of a split call's series ended. `finished` says every listed
 * auditor has a current read, `withdrawn` that a fix withdrew the list and
 * `limit` that the series reached its round maximum. `stopped` is a failed
 * phase or an unanswered ruling, and `halted` says the attempt after a fix
 * changed the list ended the series.
 */
export type SplitSeriesEnding =
  | "finished"
  | "withdrawn"
  | "limit"
  | "stopped"
  | "halted"

/** A design session's ending: its answer as text, or the reason it failed. */
export type DesignOutcome =
  | { readonly status: "finished"; readonly document: string }
  | {
      readonly status: "failed"
      readonly reason: string
      readonly sessionId: string | null
    }

/** A check that failed, with the command that ran and its whole output. */
export type CheckFailure = {
  readonly command: string
  readonly output: string
}

export type SplitDependencies = {
  /** Run the design session on the source content the hash names. */
  readonly design: (hash: string) => Promise<DesignOutcome>
  /** Whether a listed auditor of the split level lacks a current read of the list. */
  readonly roundsDue: () => Promise<boolean>
  /**
   * Run the automatic series of move-list rounds. The series calls
   * `afterRound` after each finished round that left the list in place, and
   * ends as `halted` when it answers false.
   */
  readonly series: (
    afterRound: () => Promise<boolean>,
  ) => Promise<SplitSeriesEnding>
  /** Try a move list in memory and write nothing. */
  readonly attempt: (list: Moves) => Promise<AttemptReply>
  /** Run the checks and the package's tests on the written files; null when both pass. */
  readonly checks: (pkg: string) => Promise<CheckFailure | null>
  readonly message: (text: string) => Promise<void>
}

export type SplitInput = ExecutionContext & {
  /** The source file's path relative to the Repo Edu root, with `/` separators. */
  readonly source: string
  readonly identity: DesignIdentity
}

/**
 * How one split call ended. A call with a result keeps its series in the round
 * folder only when the series is still live work: at the round maximum, or
 * when another call wrote the list first and its rounds are that call's. A
 * call without a result stopped on a failed phase or an unanswered ruling,
 * whose rerun continues where it stood.
 */
export type SplitOutcome =
  | {
      readonly status: "result"
      readonly result: SplitResult
      readonly live: boolean
    }
  | {
      readonly status: "design-failed"
      readonly reason: string
      readonly sessionId: string | null
    }
  | { readonly status: "stopped" }

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

/**
 * The text of a source's move list as the plan checkout's HEAD holds it, or
 * null when HEAD holds none. The series rules date every read by commits, so
 * only committed text has rounds behind it: a split call reports, tries and
 * carries out no other.
 */
export async function committedListText(
  planRoot: string,
  source: string,
): Promise<string | null> {
  const path = `HEAD:${moveListFile(source)}`
  const held = await execa("git", ["cat-file", "-e", path], {
    cwd: planRoot,
    reject: false,
  })
  if (held.exitCode !== 0) return null
  return (await execa("git", ["show", path], { cwd: planRoot })).stdout
}

/** The committed text of a move list that a commit must already hold. */
export async function heldListText(
  planRoot: string,
  source: string,
): Promise<string> {
  const text = await committedListText(planRoot, source)
  if (text === null)
    throw new Error(
      `The plan checkout's HEAD holds no move list ${moveListFile(source)}`,
    )
  return text
}

/** The paths of the file set that Git shows with any change beside HEAD. */
async function uncommitted(
  root: string,
  paths: readonly string[],
): Promise<readonly string[]> {
  const { stdout } = await execa(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", ...paths],
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

/**
 * Carry out one split call on one source file under the plan's Decision 17:
 * read the file's committed move list, design one when none names the
 * current content, try every list in memory before a round judges it, run the
 * move-list rounds the series rules call for, then write, check and commit
 * the split or put the files back. Every ending with a result names the
 * content hash of the file the call read.
 */
export async function runSplit(
  input: SplitInput,
  dependencies: SplitDependencies,
): Promise<SplitOutcome> {
  const { repoEduRoot, planRoot, source } = input
  const label = splitLabel(source)
  const listFile = moveListFile(source)
  const listPath = join(planRoot, listFile)
  const say = dependencies.message
  const hash = await blobHash(repoEduRoot, source)
  const ended = (
    result: SplitResultWord,
    message: string,
    live = false,
  ): SplitOutcome => ({
    status: "result",
    result: { result, hash, message },
    live,
  })
  /**
   * Try a list under the split lock and write nothing. A refused move makes
   * the file one that needs a plan, and a changed file ends the call as
   * skipped. A clean attempt answers null, so the call goes on.
   */
  const tried = (reply: AttemptReply): SplitOutcome | null => {
    if (reply.outcome === "refused")
      return ended(
        "needs-plan",
        `The statement move tool refused the move list: ${reply.message}`,
      )
    if (reply.outcome === "changed")
      return ended(
        "skipped",
        `${source} changed after its move list was written: ${reply.message}`,
      )
    return null
  }
  const attemptUnderLock = (list: Moves) =>
    withSplitLock(repoEduRoot, async () => {
      await say(`Trying the move list ${listFile} in memory.`)
      return tried(await dependencies.attempt(list))
    })
  const committedList = async (): Promise<MoveList | null> => {
    const text = await committedListText(planRoot, source)
    return text === null ? null : readMoveList(text)
  }
  /**
   * End the call as skipped when the move list has uncommitted changes. A new
   * design would overwrite them. A round reads the list in the plan checkout,
   * so it may have judged them in place of the committed list a split would
   * carry out.
   */
  const listEdited = async (): Promise<SplitOutcome | null> =>
    (await uncommitted(planRoot, [listFile])).length === 0
      ? null
      : ended(
          "skipped",
          `The move list ${listFile} has uncommitted changes; commit or discard them before the next call.`,
        )

  const found = await committedList()
  let list: Moves
  if (found !== null && found.hash === hash) {
    // The list names the current content, so the call designs nothing.
    if (found.kind === "no-split")
      return ended(
        found.result,
        `The move list ${listFile} records this result for the current content: ${found.reason}`,
      )
    const early = await attemptUnderLock(found)
    if (early !== null) return early
    list = found
  } else {
    await say(
      found === null
        ? `${source} has no move list, so a design session reads it.`
        : `The move list ${listFile} names other content, so a design session reads ${source} again.`,
    )
    const designed = await dependencies.design(hash)
    if (designed.status === "failed")
      return {
        status: "design-failed",
        reason: designed.reason,
        sessionId: designed.sessionId,
      }
    const answer = readMoveList(designed.document)
    if (answer.source !== source || answer.hash !== hash)
      throw new Error(
        `The design session answered for ${answer.source} at ${answer.hash}, not for ${source} at ${hash}`,
      )
    if (answer.kind === "no-split")
      return ended(
        answer.result,
        answer.result === "fine"
          ? `The design session judged the file fine: ${answer.reason}`
          : `The design session judged that the file needs a plan: ${answer.reason}`,
      )
    const published = await withSplitLock(repoEduRoot, async () => {
      // Another call may have designed the same content meanwhile, and its
      // rounds may already judge its list.
      const other = await committedList()
      if (other !== null && other.hash === hash)
        return ended(
          "skipped",
          `Another call wrote the move list ${listFile} for this content first.`,
          true,
        )
      const edited = await listEdited()
      if (edited !== null) return edited
      await say(`Trying the designed move list in memory.`)
      const outcome = tried(await dependencies.attempt(answer))
      if (outcome !== null) return outcome
      await mkdir(dirname(listPath), { recursive: true })
      await writeFile(listPath, `${designed.document.trim()}\n`, "utf8")
      const commit = await commitDesign(input, label, listFile)
      await say(`Committed ${commit.sha}: ${commit.subject}`)
      return null
    })
    if (published !== null) return published
    list = answer
  }

  // An uncommitted change beside a committed list does not stop the rounds: a
  // stopped fix leaves its change so, and the series continues that round.
  if (await dependencies.roundsDue()) {
    // The committed text the latest attempt passed, so a round that leaves
    // the list unchanged needs no attempt of its own.
    let attempted = await heldListText(planRoot, source)
    let halted: SplitOutcome | null = null
    const ending = await dependencies.series(async () => {
      const text = await heldListText(planRoot, source)
      if (text === attempted) return true
      const changed = readMoveList(text)
      if (changed.kind !== "moves") return true
      halted = await attemptUnderLock(changed)
      attempted = text
      return halted === null
    })
    if (ending === "stopped") return { status: "stopped" }
    if (ending === "halted") {
      if (halted === null)
        throw new Error("The move-list series halted without an attempt")
      return halted
    }
    if (ending === "limit")
      return ended(
        "needs-plan",
        "The move-list rounds reached their maximum before every listed auditor had a current read of the list.",
        true,
      )
    const judged = readMoveList(await heldListText(planRoot, source))
    if (judged.kind === "no-split")
      return ended(
        judged.result,
        `A move-list round withdrew the list: ${judged.reason}`,
      )
    if (ending === "withdrawn")
      throw new Error("The move-list series ended withdrawn on a list of moves")
    list = judged
  } else
    await say(
      `Every listed auditor has a current read of ${listFile}, so no round runs.`,
    )

  const pkg = sourcePackage(source)
  const written = await withSplitLock(
    repoEduRoot,
    async (): Promise<
      | { readonly ended: SplitOutcome }
      | {
          readonly files: readonly AttemptFile[]
          readonly originals: readonly Original[]
        }
    > => {
      const edited = await listEdited()
      if (edited !== null) return { ended: edited }
      await say(`Trying the move list ${listFile} in memory before the write.`)
      const reply = await dependencies.attempt(list)
      const outcome = tried(reply)
      if (outcome !== null) return { ended: outcome }
      if (reply.outcome !== "clean")
        throw new Error("A move-list attempt passed without its file set")
      const paths = reply.files.map((file) => file.path)
      const dirty = await uncommitted(repoEduRoot, paths)
      if (dirty.length > 0)
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
      for (const file of reply.files) {
        const path = join(repoEduRoot, file.path)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, file.text, "utf8")
      }
      await say(`Wrote ${reply.files.length} files: ${paths.join(", ")}.`)
      return { files: reply.files, originals }
    },
  )
  if ("ended" in written) return written.ended

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
    input,
    label,
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

/** Commit a design session's move list in the plan repo, as the design form. */
async function commitDesign(
  input: SplitInput,
  label: string,
  listFile: string,
): Promise<LifecycleCommit> {
  const subject = `${label}/design ${input.identity.tag}: write the move list of ${input.source}`
  parseSubject(subject, "plan")
  return commitOnly({
    cwd: input.planRoot,
    subject,
    body: input.identity.record,
    paths: [listFile],
    stamps: ownRecord,
  })
}

/**
 * Commit the split's files in Repo Edu, as the split form. Code writes the
 * subject sentence and the body from the list, so the text cannot drift from
 * what the rounds judged.
 */
async function commitSplit(
  input: SplitInput,
  label: string,
  list: Moves,
  paths: readonly string[],
): Promise<LifecycleCommit> {
  const names = list.moves.map((move) => posix.basename(move.target))
  const subject = `${label}/split ${input.identity.tag} refactor(${list.area}): split ${posix.basename(input.source)} into ${listed(names)}`
  parseSubject(subject, "repo-edu")
  const body = [
    input.identity.record,
    "",
    `- Carries out the move list ${moveListFile(input.source)} for \`${input.source}\`.`,
    ...list.moves.map((move) => `- \`${move.target}\`: ${move.responsibility}`),
  ].join("\n")
  return commitOnly({
    cwd: input.repoEduRoot,
    subject,
    body,
    paths,
    stamps: ownRecord,
  })
}
