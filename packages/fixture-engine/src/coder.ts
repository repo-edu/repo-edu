import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import {
  CODER_AGREEMENT,
  CODER_AGREEMENT_AI,
  COMMENTS_FREE_TIER,
  GITIGNORE_LINES,
  STATE_BASENAME,
} from "./constants"
import { runCoder } from "./llm-client"
import { emit, fail, formatSeconds, progress, withTicker } from "./log"
import type { Plan, PlannedCommit } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt, loadSection } from "./prompt-loader"

export interface CoderRunOpts {
  coderSpec: FixtureModelSpec
  aiCoders: boolean
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

function teamPhrase(s: number): string {
  if (s === 1) return loadSection("coder/team-phrase", "solo")
  if (s === 2) return loadSection("coder/team-phrase", "pair")
  return loadSection("coder/team-phrase", "group", {
    teammate_count: String(s - 1),
  })
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

  if (opts.aiCoders) {
    const ctx: Record<string, string> = {
      persona_name: persona.name,
      persona_email: persona.email,
      assignment: project.assignment,
      abs_path: absPath,
      coder_agreement_path: CODER_AGREEMENT_AI,
      round_goal: commit.note,
      comments_directive: commentsDirective,
    }
    if (commit.kind === "review") ctx.commit_log = shortLog(absPath)
    return loadPrompt(
      commit.kind === "review" ? "coder/review-ai" : "coder/build-ai",
      ctx,
    )
  }

  const ctx: Record<string, string> = {
    persona_name: persona.name,
    persona_email: persona.email,
    team_phrase: teamPhrase(opts.students),
    assignment: project.assignment,
    abs_path: absPath,
    coder_agreement_path: CODER_AGREEMENT,
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

export async function runCoderLoop(
  project: Project,
  plan: Plan,
  opts: CoderRunOpts,
  dir: string,
  runStart: number,
): Promise<State> {
  const state: State = { commit_index: 0, rounds: [], stopped: false }
  const coderPersona = loadPrompt(
    opts.aiCoders ? "coder/persona-ai" : "coder/persona",
  ).trim()

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
      const { reply, usage } = await withTicker(
        `fixture: round ${i + 1}/${plan.commits.length} (${commit.kind}, author ${commit.author_index})…`,
        () =>
          runCoder({
            spec: opts.coderSpec,
            prompt,
            cwd: dir,
            appendInstructions: coderPersona,
          }),
      )
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
      writeFileSync(
        resolve(dir, STATE_BASENAME),
        `${JSON.stringify(state, null, 2)}\n`,
      )
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
