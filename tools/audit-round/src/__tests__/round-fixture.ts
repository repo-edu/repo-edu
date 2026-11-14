import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { TestContext } from "node:test"
import { execa } from "execa"
import type { Assistant } from "../phase.js"
import {
  fixture,
  phaseStream,
  recorded,
  writePhaseInstructions,
} from "./helpers.js"

/** One empty commit under a stem, so the glance finds an episode and a head to count from. */
export async function commitFixture(
  cwd: string,
  subject = "example/init ath: fixture",
  committedAt?: string,
): Promise<string> {
  await execa("git", ["init", "--quiet"], { cwd })
  for (const [key, value] of Object.entries({
    "user.name": "Test",
    "user.email": "test@example.test",
    "core.hooksPath": "/dev/null",
    "commit.gpgsign": "false",
  }))
    await execa("git", ["config", key, value], { cwd })
  await execa(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      subject,
    ],
    {
      cwd,
      env:
        committedAt === undefined
          ? undefined
          : { GIT_COMMITTER_DATE: committedAt },
    },
  )
  return shortCommit(cwd, "HEAD")
}

/** The six-character display form the doctrine fixes for names and reports. */
export async function shortCommit(
  cwd: string,
  revision: string,
): Promise<string> {
  return (
    await execa("git", ["rev-parse", "--verify", revision], { cwd })
  ).stdout.slice(0, 6)
}

/**
 * One file-changing audit correction commit under the stem, which the glance
 * counts once in its area or section.
 */
export async function correctionFixture(
  cwd: string,
  repository: "repo-edu" | "plan",
  index: number,
): Promise<string> {
  await writeFile(join(cwd, "correction.md"), `${index}\n`)
  await execa("git", ["add", "correction.md"], { cwd })
  const bullet =
    repository === "plan"
      ? "- C [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Correct: the behaviour."
      : "- [C] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Correct: the behaviour."
  const kind = repository === "plan" ? "docs(example)" : "fix(audit-round)"
  return commitFixture(
    cwd,
    `example/impl-audit-1 ath growth-none c1 ${kind}: correction\n\n${bullet}`,
  )
}

/** The tier a finished fix commits, independent of the audit report's findings. */
type Grade = "a" | "b" | "c" | "d" | null

export async function roundFixture(
  t: TestContext,
  auditor: Assistant = "codex",
  owner: "repo-edu" | "plan" = "repo-edu",
  ruling = false,
  tier: Grade = null,
  /**
   * Whether the commit record leaves the watch due, which no round does
   * alongside a ruling. Both heads are recorded at the initial commits. False
   * records green and lands nothing after them, so the glance finds nothing to
   * count. True records red and lands two audit corrections in the working
   * repository, the red limit, so the watch runs and its red grade stops the
   * sequence.
   */
  watch = false,
  working: "repo-edu" | "plan" = "repo-edu",
  /** Whether the audit reports no findings, which completes without another assistant. */
  clean = false,
  /** Whether the vet accepts every finding, which sends the round past the rebuttal. */
  accepted = false,
  /**
   * Whether Repo Edu's history has landed step 1, which an implementation
   * scope needs and a plan's name alone then no longer plans.
   */
  landed = working === "repo-edu",
) {
  const f = await fixture(t)
  await mkdir(join(f.root, "repo-edu/.agents/skills/audit/references"), {
    recursive: true,
  })
  // The command resolves its root through realpath, so paths it derives compare against this.
  const repoRoot = await realpath(join(f.root, "repo-edu"))
  const planDirectory = join(f.root, "plan")
  await mkdir(join(planDirectory, ".agents/skills/audit/references"), {
    recursive: true,
  })
  await writePhaseInstructions(repoRoot, planDirectory)
  await writeFile(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n")
  await mkdir(join(repoRoot, "tools/architecture-check/src"), {
    recursive: true,
  })
  await writeFile(
    join(repoRoot, "tools/architecture-check/src/area-model.json"),
    await readFile(
      new URL(
        "../../../architecture-check/src/area-model.json",
        import.meta.url,
      ),
    ),
  )
  // The command checks the plan where the phases open it, so the Repo Edu
  // root and the plan checkout's active folder hold the plan and its widening
  // artifact.
  await mkdir(join(planDirectory, "active"), { recursive: true })
  for (const root of [repoRoot, join(planDirectory, "active")])
    for (const name of ["example.md", "example-widen.md"])
      await writeFile(
        join(root, name),
        `# Example plan

## Implementation plan

1. **Fixture step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1.
`,
      )
  const planRoot = await realpath(planDirectory)
  const activeRoot = join(planRoot, "active")
  const outputRoot = activeRoot
  const recordHeads = {
    "repo-edu": await commitFixture(
      repoRoot,
      landed ? "example/impl-1 ath feat(audit-round): fixture" : undefined,
    ),
    plan: await commitFixture(planRoot),
  }
  const heads = { ...recordHeads }
  if (watch)
    for (const index of [0, 1])
      heads[working] = await correctionFixture(
        working === "plan" ? planRoot : repoRoot,
        working,
        index,
      )
  const cacheRoot = join(f.root, "cache")
  await mkdir(cacheRoot)
  await writeFile(
    join(cacheRoot, "watch.json"),
    JSON.stringify({
      example: {
        heads: recordHeads,
        grade: watch ? "red" : "green",
        written: "2026-09-20",
      },
    }),
  )
  const report = join(outputRoot, "audit-source.md")
  const finding = (location: string) =>
    `### 1. B: Fixture finding\n\n${location} [growth-pattern:none] [reach:developer] [complexity:none]\n\nCorrect the fixture.\n`
  await writeFile(
    report,
    (working === "plan"
      ? "Planning round workflow\n"
      : "Implementation audit workflow\n") +
      "Target: <arguments>\n" +
      `Judged repos: ${owner}@${heads[owner]}\n` +
      "\n" +
      (working === "plan"
        ? `## Excess functionality\n\nNo excess findings.\n\n## Missing functionality\n\n${clean ? "No missing findings.\n" : finding("[field:missing] [section:decisions]")}`
        : `## Findings\n\n${clean ? "No findings.\n" : finding("[area:tool-audit-round]")}`),
  )
  await writeFile(
    join(f.root, owner, "VET-example.md"),
    accepted ? "1. [B] Accept\n" : "1. [B] Revise\nCheck the correction.\n",
  )
  const phases: Record<string, unknown> = {}
  for (const phase of [
    "audit",
    "vet",
    "rebut",
    "fix",
    "watch",
    "close",
  ] as const) {
    // The test settings' panel is one Claude vetter, whoever audits.
    const assistant = ["fix", "watch", "close"].includes(phase)
      ? "codex"
      : phase === "vet"
        ? "claude"
        : auditor
    const sessionId = `${phase}-session`
    const status = phase === "fix" && ruling ? "needs-ruling" : "finished"
    const final =
      phase === "watch"
        ? `# Example: trajectory watch\n\nComplete watch text.\nWatch grade: ${watch ? "red" : "green"}\nPHASE RESULT: {"status":"finished","reason":null}`
        : `Complete ${phase} text.\n\n| Result | Value |\n| --- | --- |\n| Round | ${phase} |\nPHASE RESULT: ${JSON.stringify({ status, reason: null })}`
    phases[phase] = {
      document:
        phase === "audit"
          ? { source: report }
          : phase === "vet"
            ? { source: join(f.root, owner, "VET-example.md") }
            : phase === "rebut"
              ? { text: "1. [B] [<vet>] Agree\n" }
              : phase === "fix" && ruling
                ? { text: "Written ruling by fix" }
                : undefined,
      commits:
        phase === "fix" && !ruling
          ? [
              {
                cwd: owner === "plan" ? planRoot : repoRoot,
                subject:
                  tier === null
                    ? "example/impl-audit-1 oth clean: fixture"
                    : `example/impl-audit-1 oth growth-none ${tier}1 fix(audit-round): fixture`,
                ...(tier === null
                  ? {}
                  : {
                      commitSubject: `oth growth-none ${tier}1 fix(audit-round): fixture`,
                    }),
              },
            ]
          : [],
      // A close session moves its plan into the archive; the runner then
      // archives the plan's round data itself.
      moves:
        phase === "close"
          ? [
              {
                from: join(activeRoot, "example.md"),
                to: join(planRoot, "archive/example/plan.md"),
              },
            ]
          : [],
      stream: await phaseStream(assistant, final, sessionId),
      // Either CLI may run a phase when the next auditor changes, so both answer.
      assistants: {
        claude: { stream: await phaseStream("claude", final, sessionId) },
        codex: { stream: await phaseStream("codex", final, sessionId) },
      },
      usage: {
        path: join(f.root, `rollout-${sessionId}.jsonl`),
        text: await recorded("codex-rollout.jsonl"),
      },
    }
  }
  await f.configure({ phases })
  const visible: string[] = []
  const errors: string[] = []
  const status: string[] = []
  let clears = 0
  const options = {
    awaitAnswer: async (): Promise<null> => null,
    repoEduRoot: repoRoot,
    terminal: {
      write: (text: string) => {
        visible.push(text)
      },
      status: (text: string) => {
        status.push(text)
      },
      clear: () => {
        clears++
      },
    },
    emergency: (text: string) => {
      errors.push(text)
    },
    cacheRoot,
  }
  const roundFiles = async () =>
    (await readdir(outputRoot)).filter((name) =>
      /-1-round\.[ao][btu][lmhx]\.(md|log)$/.test(name),
    )
  const records = async () => {
    const names = await roundFiles()
    assert.equal(names.length, 2)
    const log = await readFile(
      join(outputRoot, names.find((name) => name.endsWith(".log")) as string),
      "utf8",
    )
    const transcript = join(
      outputRoot,
      names.find((name) => name.endsWith(".md")) as string,
    )
    const markdown = await readFile(transcript, "utf8")
    return { log, markdown, transcript }
  }
  const document = (kind: string, fallback: string) => {
    // Finished fixes remove their reports; the run log retains the paths passed to phases.
    for (const root of [outputRoot, repoRoot]) {
      for (const name of readdirSync(root)
        .filter((name) => name.endsWith(".log"))
        .sort()
        .reverse()) {
        const log = readFileSync(join(root, name), "utf8")
        if (kind === "ruling") {
          const match = /^Ruling output path \(JSON string\): (.+)$/m.exec(log)
          if (match !== null) return JSON.parse(match[1]) as string
        }
        for (const match of log.matchAll(
          /^Phase arguments \(JSON array\): (.+)$/gm,
        )) {
          const path = (JSON.parse(match[1]) as unknown[]).find(
            (path): path is string =>
              typeof path === "string" && path.includes(`-${kind}.`),
          )
          if (path !== undefined) return path
        }
      }
    }
    return fallback
  }
  return {
    ...f,
    repoRoot,
    planRoot,
    activeRoot,
    heads,
    recordHeads,
    get report() {
      return document("audit", report)
    },
    get vet() {
      return document("vet", "")
    },
    get rebut() {
      return document("rebut", "")
    },
    phases,
    visible,
    errors,
    status,
    clears: () => clears,
    options,
    records,
    roundFiles,
    get ruling() {
      return document("ruling", "")
    },
    get watch() {
      return document("watch", "")
    },
    runtime: { ...f.runtime, cwd: working === "plan" ? planRoot : repoRoot },
  }
}
