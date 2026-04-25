import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import { effortOption, runAgent, type Usage } from "./agent"
import {
  CODER_AGREEMENT,
  CODER_AGREEMENT_L0,
  COMMENTS_FREE_TIER,
  GITIGNORE_LINES,
  type ModelName,
  STUDENT_REPOS,
} from "./constants"
import { emit, fail, formatSeconds, withTicker } from "./log"
import type { Plan, PlannedCommit } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt, loadSection } from "./prompt-loader"

export interface CoderRunOpts {
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
  aiCoders: boolean
  coderExperience: number
  comments: number
  students: number
}

export interface RoundRecord {
  commit_index: number
  author_index: number
  kind: "build" | "review"
  coder_summary: string
  usage: Usage
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
    return loadPrompt(
      commit.kind === "review" ? "coder/review-l0" : "coder/build-l0",
      {
        persona_name: persona.name,
        persona_email: persona.email,
        assignment: project.assignment,
        abs_path: absPath,
        coder_agreement_path: CODER_AGREEMENT_L0,
        round_goal: commit.note,
        comments_directive: commentsDirective,
        commit_date: commit.date,
      },
    )
  }

  const coderExperienceRules = loadSection(
    "coder/experience",
    String(opts.coderExperience),
  )

  const ctx: Record<string, string> = {
    persona_name: persona.name,
    persona_email: persona.email,
    team_phrase: teamPhrase(opts.students),
    assignment: project.assignment,
    abs_path: absPath,
    coder_agreement_path: CODER_AGREEMENT,
    round_goal: commit.note,
    coder_experience_rules: coderExperienceRules,
    comments_directive: commentsDirective,
    commit_date: commit.date,
  }

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

export function initRepo(dir: string): void {
  const gitInit = spawnSync("git", ["-C", dir, "init", "--template="], {
    stdio: "inherit",
  })
  if (gitInit.status !== 0) fail("git init failed")
  writeFileSync(resolve(dir, ".gitignore"), `${GITIGNORE_LINES.join("\n")}\n`)
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
    opts.aiCoders ? "coder/persona-l0" : "coder/persona",
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
      const prompt = composeCoderPrompt(project, plan, commit, opts, dir)
      emit(
        2,
        `\n## Round ${i + 1} · ${commit.kind} · author ${commit.author_index}\n\n### Prompt\n\n${prompt}`,
      )
      const { reply, usage } = await withTicker(
        `fixture: round ${i + 1}/${plan.commits.length} (${commit.kind}, author ${commit.author_index})…`,
        () =>
          runAgent(prompt, {
            model: opts.coderModel,
            ...effortOption(opts.coderEffort),
            cwd: dir,
            permissionMode: "bypassPermissions",
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: coderPersona,
            },
          }),
      )
      emit(
        2,
        `\n### Reply\n\n${reply}\n\n### Usage\n\n- input_tokens: ${usage.input_tokens}\n- output_tokens: ${usage.output_tokens}\n- wall_ms: ${usage.wall_ms}`,
      )
      state.rounds.push({
        commit_index: i,
        author_index: commit.author_index,
        kind: commit.kind,
        coder_summary: firstParagraph(reply),
        usage,
      })
      state.commit_index = i + 1
      writeFileSync(
        resolve(STUDENT_REPOS, "_state.json"),
        `${JSON.stringify(state, null, 2)}\n`,
      )
      process.stderr.write(
        `fixture: round ${i + 1} done (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})\n`,
      )
      if (state.stopped) break
    }
  } finally {
    process.off("SIGINT", onSigint)
  }

  return state
}
