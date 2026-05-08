import { spawnSync } from "node:child_process"
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, normalize, resolve } from "node:path"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import { LlmError, type LlmUsage } from "@repo-edu/integrations-llm-contract"
import {
  CODER_AGREEMENT,
  COMMENTS_FREE_TIER,
  GITIGNORE_LINES,
  LOG_BASENAME,
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  REVIEW_BASENAME,
  SETTINGS_BASENAME,
  STATE_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
} from "./constants"
import { runFixtureCoder } from "./llm-client"
import { emit, fail, formatSeconds, progress, withTicker } from "./log"
import type { Plan, PlannedCommit } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt, loadSection } from "./prompt-loader"
import { pythonRepoContext } from "./repo-context"

export interface CoderRunOpts {
  coderSpec: FixtureModelSpec
  reviewerSpec: FixtureModelSpec
  comments: number
  students: number
}

export interface RoundRecord {
  commit_index: number
  author_index: number
  kind: "build" | "review"
  coder_summary: string
  usage: LlmUsage
}

export interface State {
  commit_index: number
  rounds: RoundRecord[]
  stopped: boolean
}

export class CoderRoundLlmError extends Error {
  readonly error: LlmError
  readonly activeSpec: FixtureModelSpec

  constructor(error: LlmError, activeSpec: FixtureModelSpec) {
    super(error.message, { cause: error })
    this.name = "CoderRoundLlmError"
    this.error = error
    this.activeSpec = activeSpec
  }
}

function shortLog(dir: string): string {
  const r = spawnSync(
    "git",
    ["-C", dir, "log", "--reverse", "--pretty=%h %s"],
    { stdio: ["ignore", "pipe", "ignore"] },
  )
  if (r.status !== 0) return "(no commits yet)"
  const out = r.stdout.toString().trim()
  return out.length > 0 ? out : "(no commits yet)"
}

const SNAPSHOT_OMIT = new Set([
  ".git",
  LOG_BASENAME,
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  REVIEW_BASENAME,
  SETTINGS_BASENAME,
  STATE_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
])

const MAX_TARGET_FILE_BYTES = 20_000

function repoSnapshot(dir: string): string {
  const files: string[] = []
  const walk = (relativeDir: string): void => {
    const entries = readdirSync(join(dir, relativeDir), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (SNAPSHOT_OMIT.has(entry.name)) continue
      const relativePath =
        relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(relativePath)
        continue
      }
      if (entry.isFile()) files.push(relativePath)
    }
  }
  walk("")
  return files.length === 0 ? "(no project files yet)" : files.join("\n")
}

function targetFileContent(dir: string, relativePath: string): string {
  if (relativePath.length === 0) return "(no target file for this round)"
  const normalized = normalize(relativePath)
  if (
    isAbsolute(relativePath) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return "(target file path is outside the repository)"
  }
  const absPath = resolve(dir, normalized)
  if (!existsSync(absPath)) return "(target file does not exist yet)"
  const stat = statSync(absPath)
  if (!stat.isFile()) return "(target path is not a file)"
  const content = readFileSync(absPath, "utf8")
  if (Buffer.byteLength(content, "utf8") <= MAX_TARGET_FILE_BYTES) {
    return content.length === 0 ? "(target file is empty)" : content
  }
  const truncated = content.slice(0, MAX_TARGET_FILE_BYTES)
  return `${truncated}\n\n[truncated after ${MAX_TARGET_FILE_BYTES} bytes]`
}

function composeCoderPrompt(
  project: Project,
  plan: Plan,
  commit: PlannedCommit,
  opts: CoderRunOpts,
  absPath: string,
): string {
  const persona = plan.team[commit.author_index]
  const commentsDirective =
    opts.comments === COMMENTS_FREE_TIER
      ? ""
      : loadSection("coder/comments", String(opts.comments))
  const primaryModule =
    commit.kind === "build" ? (commit.primary_module ?? "") : ""

  const ctx: Record<string, string> = {
    persona_name: persona.name,
    persona_email: persona.email,
    assignment: project.assignment,
    abs_path: absPath,
    coder_agreement_path: CODER_AGREEMENT,
    repo_snapshot: repoSnapshot(absPath),
    repo_context: pythonRepoContext(absPath, primaryModule),
    target_file: primaryModule,
    target_file_content: targetFileContent(absPath, primaryModule),
    round_goal: commit.note,
    comments_directive: commentsDirective,
  }
  if (commit.kind === "review") ctx.commit_log = shortLog(absPath)
  return loadPrompt(
    commit.kind === "review" ? "coder/review" : "coder/build",
    ctx,
  )
}

function firstParagraph(reply: string): string {
  const trimmed = reply.trim()
  const endIdx = trimmed.search(/\n\s*\n/)
  return (endIdx > 0 ? trimmed.slice(0, endIdx) : trimmed).trim().slice(0, 500)
}

export interface CoderTrailer {
  /**
   * `null` means no `COMMIT:` line found. `""` means `COMMIT: -` (explicit
   * skip). Anything else is the proposed subject.
   */
  commitSubject: string | null | ""
  deletes: string[]
}

const COMMIT_RE = /^COMMIT:\s*(.*)$/
const DELETE_RE = /^DELETE:\s*(.+)$/

export function parseCoderTrailer(reply: string): CoderTrailer {
  // Walk lines from the end so the *last* COMMIT: line wins (the model may
  // describe trailers earlier in its prose). DELETE: lines are collected in
  // forward order from the trailer block leading up to that COMMIT line.
  const lines = reply.split("\n")
  let commitIdx = -1
  let commitSubject: string | null | "" = null
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(COMMIT_RE)
    if (m) {
      commitIdx = i
      const raw = m[1].trim()
      commitSubject = raw === "-" || raw === "" ? "" : raw
      break
    }
  }
  const deletes: string[] = []
  if (commitIdx >= 0) {
    for (let i = 0; i < commitIdx; i++) {
      const m = lines[i].match(DELETE_RE)
      if (m) deletes.push(m[1].trim())
    }
  }
  return { commitSubject, deletes }
}

export function initRepo(dir: string): void {
  const gitInit = spawnSync("git", ["-C", dir, "init", "--template="], {
    stdio: "inherit",
  })
  if (gitInit.status !== 0) fail("git init failed")
  writeFileSync(resolve(dir, ".gitignore"), `${GITIGNORE_LINES.join("\n")}\n`)
}

function headSha(dir: string): string | null {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], {
    stdio: ["ignore", "pipe", "ignore"],
  })
  if (result.status !== 0) return null
  return result.stdout.toString().trim()
}

function gitRm(dir: string, path: string): void {
  // Use --ignore-unmatch so a path the model lists but that doesn't exist
  // (typo, already removed) doesn't blow up the round.
  spawnSync("git", ["-C", dir, "rm", "-rf", "--ignore-unmatch", "--", path], {
    stdio: ["ignore", "ignore", "pipe"],
  })
}

function gitAddAll(dir: string): void {
  spawnSync("git", ["-C", dir, "add", "-A"], {
    stdio: ["ignore", "ignore", "pipe"],
  })
}

function untrackedProjectFiles(dir: string): string[] {
  const result = spawnSync(
    "git",
    ["-C", dir, "ls-files", "--others", "--exclude-standard"],
    { stdio: ["ignore", "pipe", "ignore"] },
  )
  if (result.status !== 0) return []
  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function gitResetHard(dir: string): void {
  // Discard working-tree edits and untracked files for a "no commit" round
  // so the next round starts from the last committed state.
  spawnSync("git", ["-C", dir, "reset", "--hard", "HEAD"], {
    stdio: ["ignore", "ignore", "ignore"],
  })
  spawnSync("git", ["-C", dir, "clean", "-fdx", "--", ":!.gitignore"], {
    stdio: ["ignore", "ignore", "ignore"],
  })
}

function gitCommit(
  dir: string,
  subject: string,
  persona: { name: string; email: string },
  date: string,
): boolean {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: persona.name,
    GIT_AUTHOR_EMAIL: persona.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: persona.name,
    GIT_COMMITTER_EMAIL: persona.email,
    GIT_COMMITTER_DATE: date,
  }
  const r = spawnSync("git", ["-C", dir, "commit", "-m", subject], {
    stdio: ["ignore", "ignore", "pipe"],
    env,
  })
  return r.status === 0
}

function applyTrailerAndCommit(
  dir: string,
  trailer: CoderTrailer,
  commit: PlannedCommit,
  persona: { name: string; email: string },
): { committed: boolean; reason: string } {
  if (commit.kind === "review") {
    const newFiles = untrackedProjectFiles(dir)
    if (newFiles.length > 0) {
      gitResetHard(dir)
      return {
        committed: false,
        reason: `review created new project file(s): ${newFiles.join(", ")}`,
      }
    }
  }

  // Resolve the subject: explicit COMMIT trailer wins; otherwise build rounds
  // fall back to the planner's `message`, review rounds skip.
  let subject: string | null
  if (trailer.commitSubject === null) {
    subject = commit.kind === "build" ? commit.message : null
  } else if (trailer.commitSubject === "") {
    subject = null
  } else {
    subject = trailer.commitSubject
  }

  for (const path of trailer.deletes) gitRm(dir, path)
  gitAddAll(dir)

  if (subject === null) {
    gitResetHard(dir)
    return {
      committed: false,
      reason: "no commit (trailer COMMIT: - or absent on review)",
    }
  }
  const ok = gitCommit(dir, subject, persona, commit.date)
  if (!ok) {
    gitResetHard(dir)
    return {
      committed: false,
      reason: "git commit failed (likely empty changeset)",
    }
  }
  return { committed: true, reason: "" }
}

function writeRunState(dir: string, state: State): void {
  writeFileSync(
    resolve(dir, STATE_BASENAME),
    `${JSON.stringify(state, null, 2)}\n`,
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function runCoderLoop(
  project: Project,
  plan: Plan,
  opts: CoderRunOpts,
  dir: string,
  runStart: number,
): Promise<State> {
  const state: State = { commit_index: 0, rounds: [], stopped: false }
  const coderPersona = loadPrompt("coder/persona").trim()

  let sigintCount = 0
  const onSigint = () => {
    sigintCount++
    if (sigintCount === 1) {
      state.stopped = true
      process.stderr.write(
        "\nfixture: stop requested — finishing current round, then writing summary. Press Ctrl+C again to force exit.\n",
      )
      return
    }
    process.stderr.write("\nfixture: force exit\n")
    process.exit(130)
  }
  process.on("SIGINT", onSigint)

  try {
    for (let i = 0; i < plan.commits.length; i++) {
      const commit = plan.commits[i]
      const persona = plan.team[commit.author_index]
      const prompt = composeCoderPrompt(project, plan, commit, opts, dir)
      const roundHeader = `\n## Round ${i + 1} · ${commit.kind} · author ${commit.author_index}`
      emit(2, `${roundHeader}\n\n### Prompt\n\n${prompt}`)
      emit(3, `${roundHeader}\n\n### Prompt\n\n${prompt}`)
      const beforeSha = headSha(dir)
      const roundSpec =
        commit.kind === "review" ? opts.reviewerSpec : opts.coderSpec
      let reply: string
      let usage: LlmUsage
      try {
        ;({ reply, usage } = await withTicker(
          `fixture: round ${i + 1}/${plan.commits.length} (${commit.kind}, author ${commit.author_index})…`,
          async () => {
            try {
              return await runFixtureCoder({
                spec: roundSpec,
                prompt,
                cwd: dir,
                appendInstructions: coderPersona,
              })
            } catch (err) {
              if (err instanceof LlmError) {
                throw new CoderRoundLlmError(err, roundSpec)
              }
              throw err
            }
          },
        ))
      } catch (err) {
        if (
          err instanceof CoderRoundLlmError &&
          err.error.kind === "guardrail"
        ) {
          gitResetHard(dir)
          const skipNote = `round ${i + 1} skipped (${err.error.message})`
          emit(2, `\n### Skipped\n\n${skipNote}`)
          emit(3, `\n### Skipped\n\n${skipNote}`)
          state.rounds.push({
            commit_index: i,
            author_index: commit.author_index,
            kind: commit.kind,
            coder_summary: `(skipped: ${err.error.message})`,
            usage: {
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
              wallMs: 0,
              authMode: err.error.context.authMode ?? "api",
            },
          })
          state.commit_index = i + 1
          writeRunState(dir, state)
          progress(skipNote)
          if (state.stopped) break
          continue
        }
        if (state.stopped) {
          gitResetHard(dir)
          const stopNote = `round ${i + 1} stopped after stop request (${errorMessage(err)})`
          emit(2, `\n### Stopped\n\n${stopNote}`)
          emit(3, `\n### Stopped\n\n${stopNote}`)
          writeRunState(dir, state)
          progress(stopNote)
          break
        }
        throw err
      }
      const trailer = parseCoderTrailer(reply)
      const outcome = applyTrailerAndCommit(dir, trailer, commit, persona)
      const afterSha = headSha(dir)
      const committed = outcome.committed && afterSha !== beforeSha
      const tail = `\n### Reply\n\n${reply}\n\n### Trailer\n\n- commit: ${trailer.commitSubject === null ? "(absent)" : trailer.commitSubject === "" ? "(skip)" : JSON.stringify(trailer.commitSubject)}\n- deletes: ${trailer.deletes.length === 0 ? "(none)" : trailer.deletes.map((p) => JSON.stringify(p)).join(", ")}\n- committed: ${committed}${outcome.reason ? ` (${outcome.reason})` : ""}\n\n### Usage\n\n- inputTokens: ${usage.inputTokens}\n- cachedInputTokens: ${usage.cachedInputTokens}\n- outputTokens: ${usage.outputTokens}\n- wallMs: ${usage.wallMs}\n- authMode: ${usage.authMode}`
      emit(2, tail)
      emit(3, tail)
      state.rounds.push({
        commit_index: i,
        author_index: commit.author_index,
        kind: commit.kind,
        coder_summary: firstParagraph(reply),
        usage,
      })
      state.commit_index = i + 1
      writeRunState(dir, state)
      progress(
        `round ${i + 1} ${commit.kind} done (${formatSeconds(usage.wallMs)}, cumulative ${formatSeconds(Date.now() - runStart)})${committed ? "" : " (no commit)"}`,
      )
      if (state.stopped) break
    }
  } finally {
    process.off("SIGINT", onSigint)
  }

  return state
}
