import { mkdir, readdir, rename, rmdir } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import { errorMessage } from "./feedback.js"
import {
  planRoundFile,
  type SeriesKind,
  seriesArchiveFolder,
  seriesFile,
} from "./round-paths.js"

/** What one evidence commit did. */
export type EvidenceCommit =
  | { readonly status: "committed"; readonly sha: string }
  | { readonly status: "unchanged" }
  | { readonly status: "failed"; readonly reason: string }

/**
 * Commit every uncommitted file in the evidence checkout under one plain
 * subject, so a round file is in Git within one command of being written and
 * an overwritten or deleted file can be restored. The commit carries no
 * capability tag or model record and runs no hook, because nothing reads the
 * evidence log as a trajectory. A checkout with nothing to commit gets no
 * commit. A failure is returned rather than thrown: the files stay in place
 * and the next commit takes them, so the command's own result stands.
 */
export async function commitEvidence(
  evidenceRoot: string,
  subject: string,
): Promise<EvidenceCommit> {
  try {
    await execa("git", ["add", "--all"], { cwd: evidenceRoot })
    const staged = await execa("git", ["diff", "--cached", "--quiet"], {
      cwd: evidenceRoot,
      reject: false,
    })
    if (staged.exitCode === 0) return { status: "unchanged" }
    if (staged.exitCode !== 1)
      throw new Error(staged.stderr || `git diff exited ${staged.exitCode}`)
    await execa(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", subject],
      { cwd: evidenceRoot },
    )
    const { stdout } = await execa("git", ["rev-parse", "HEAD"], {
      cwd: evidenceRoot,
    })
    return { status: "committed", sha: stdout }
  } catch (error) {
    return { status: "failed", reason: errorMessage(error) }
  }
}

/** The one line a failed evidence commit prints, which leaves the command's result as it was. */
export function evidenceFailureText(
  commit: Extract<EvidenceCommit, { status: "failed" }>,
): string {
  return `Warning: the evidence commit failed; the next command that writes a round file commits these files. ${commit.reason}`
}

/** The names of one plan's round files still in the round folder, sorted. */
export async function planRoundFiles(
  roundRoot: string,
  stem: string,
): Promise<readonly string[]> {
  return (await readdir(roundRoot, { withFileTypes: true }))
    .filter((file) => file.isFile() && planRoundFile(stem, file.name))
    .map((file) => file.name)
    .sort()
}

/** The round files one close moved and the folder that holds them now. */
export type ClosedRoundFiles = {
  readonly folder: string
  readonly names: readonly string[]
}

/**
 * Move every round file of a closed plan from the round folder into the
 * plan's own folder under `archive/` of the evidence checkout, so the round
 * folder lists live work only and the evidence root lists groups only. The
 * plan's files are found through the names `round-paths.ts` owns, so another
 * plan whose stem extends this one stays. A file of the same name in the
 * destination is replaced; every earlier file is already in Git. The close's
 * own log may still be open: a rename keeps its open handle on the moved
 * file, so its last lines land there. The command's evidence commit takes the
 * move.
 */
export async function moveClosedRoundFiles(
  evidenceRoot: string,
  roundRoot: string,
  stem: string,
): Promise<ClosedRoundFiles> {
  const folder = join(evidenceRoot, "archive", stem)
  const names = await planRoundFiles(roundRoot, stem)
  if (names.length > 0) await mkdir(folder, { recursive: true })
  for (const name of names)
    await rename(join(roundRoot, name), join(folder, name))
  return { folder, names }
}

/** The line a close prints for the round files it moved. */
export function closedRoundFilesText(
  stem: string,
  moved: ClosedRoundFiles,
): string {
  return moved.names.length === 0
    ? `No round file of ${stem} is left in the round folder.`
    : `Moved ${moved.names.length} round ${moved.names.length === 1 ? "file" : "files"} of ${stem} to ${moved.folder}.`
}

/** The round files one series move took and the folder it took them to. */
export type MovedSeriesFiles = {
  readonly folder: string
  readonly names: readonly string[]
}

/** The names of one series' files directly inside one folder, sorted. */
async function seriesFiles(
  folder: string,
  label: string,
): Promise<readonly string[]> {
  try {
    return (await readdir(folder, { withFileTypes: true }))
      .filter((file) => file.isFile() && seriesFile(label, file.name))
      .map((file) => file.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

/**
 * Move every file of one finished commit or move-list series from the round
 * folder into its own folder under its kind's archive root, `commits/` or
 * `splits/`, so the round folder lists live work only. The series' files are
 * found through the names `round-paths.ts` owns, so a neighbouring label
 * stays. Each file moves by one rename and so sits in exactly one of the two
 * folders at every moment: a move that stops partway loses nothing, and the
 * next rerun restores the rest. The last round's log may still be open, and a
 * rename keeps its open handle on the moved file.
 */
export async function archiveSeries(
  evidenceRoot: string,
  roundRoot: string,
  kind: SeriesKind,
  label: string,
): Promise<MovedSeriesFiles> {
  const folder = seriesArchiveFolder(evidenceRoot, kind, label)
  const names = await seriesFiles(roundRoot, label)
  if (names.length > 0) await mkdir(folder, { recursive: true })
  for (const name of names)
    await rename(join(roundRoot, name), join(folder, name))
  return { folder, names }
}

/**
 * Move an archived series back into the round folder before a rerun reads it,
 * so its numbering, earlier fixes and queue are read where every round writes
 * them. A series that was never archived moves nothing. The emptied archive
 * folder goes, so the archive root holds finished series only.
 */
export async function restoreSeries(
  evidenceRoot: string,
  roundRoot: string,
  kind: SeriesKind,
  label: string,
): Promise<MovedSeriesFiles> {
  const archived = seriesArchiveFolder(evidenceRoot, kind, label)
  const names = await seriesFiles(archived, label)
  for (const name of names)
    await rename(join(archived, name), join(roundRoot, name))
  try {
    await rmdir(archived)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error
  }
  return { folder: roundRoot, names }
}

/** The line a series move prints, or null when it moved nothing. */
export function movedSeriesText(
  label: string,
  moved: MovedSeriesFiles,
): string | null {
  const count = moved.names.length
  if (count === 0) return null
  return `Moved ${count} round ${count === 1 ? "file" : "files"} of ${label} to ${moved.folder}.`
}
