import assert from "node:assert/strict"
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { TestContext } from "node:test"
import { execa } from "execa"
import type { Assistant } from "../phase.js"
import { fixture, phaseStream, recorded } from "./helpers.js"

/** One empty commit under a stem, so the glance finds an episode and a head to count from. */
export async function commitFixture(
  cwd: string,
  subject = "example/init ath: fixture",
): Promise<string> {
  await execa("git", ["init", "--quiet"], { cwd })
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
    { cwd },
  )
  return (await execa("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout
}

/** The tier a finished fix reports, which a chained run reads. */
type Grade = "a" | "b" | "c" | "d" | null

export async function roundFixture(
  t: TestContext,
  auditor: Assistant = "codex",
  owner: "repo-edu" | "plan" = "repo-edu",
  ruling = false,
  tier: Grade = null,
  /**
   * Whether the commit record leaves the watch due, which no round does
   * alongside a ruling. False records both heads at HEAD as green, so the
   * glance finds nothing to count; true records nothing, so the first watch is
   * due.
   */
  watch = false,
  working: "repo-edu" | "plan" = "repo-edu",
  /** Whether the audit reports no findings, which sends the round straight to the fix. */
  clean = false,
  /** Whether the vet accepts every finding, which sends the round past the rebuttal. */
  accepted = false,
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
  await writeFile(
    join(planDirectory, ".agents/skills/audit/references/workflow.md"),
    "Fixture marker",
  )
  await writeFile(
    join(repoRoot, ".agents/skills/audit/references/workflow.md"),
    "Fixture marker",
  )
  await writeFile(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n")
  const planRoot = await realpath(planDirectory)
  const outputRoot = working === "plan" ? planRoot : repoRoot
  const heads = {
    "repo-edu": await commitFixture(repoRoot),
    plan: await commitFixture(planRoot),
  }
  const cacheRoot = join(f.root, "cache")
  await mkdir(cacheRoot)
  if (!watch)
    await writeFile(
      join(cacheRoot, "watch.json"),
      JSON.stringify({
        example: { heads, grade: "green", written: "2026-09-20" },
      }),
    )
  const report = join(f.root, owner, "AUDIT-example.md")
  const brief = join(outputRoot, "ROUND-example-brief.md")
  const rulingFile = join(outputRoot, "ROUND-example-ruling.md")
  const watchFile = join(outputRoot, "ROUND-example-watch.md")
  // The second pass rewrites whichever draft its round produced.
  const revised = ruling ? rulingFile : watchFile
  const phases: Record<string, unknown> = {}
  for (const phase of [
    "audit",
    "vet",
    "rebut",
    "fix",
    "brief",
    "rule",
    "revise",
    "watch",
  ] as const) {
    const assistant =
      phase === "fix" || phase === "brief"
        ? "codex"
        : ["rule", "revise", "watch"].includes(phase)
          ? "claude"
          : phase === "vet"
            ? auditor === "codex"
              ? "claude"
              : "codex"
            : auditor
    const sessionId = phase === "rebut" ? "audit-session" : `${phase}-session`
    const file =
      phase === "fix"
        ? null
        : phase === "audit"
          ? report
          : phase === "brief"
            ? brief
            : phase === "rule"
              ? rulingFile
              : phase === "revise"
                ? revised
                : phase === "watch"
                  ? watchFile
                  : join(f.root, owner, `${phase.toUpperCase()}-example.md`)
    const status = phase === "fix" && ruling ? "needs-ruling" : "finished"
    const final = `Complete ${phase} text.\n\n| Result | Value |\n| --- | --- |\n| Round | ${phase} |\nPHASE RESULT: ${JSON.stringify({ status, file, reason: null, tier: status === "finished" && phase === "fix" ? tier : null, clean: phase === "audit" ? clean : null, accepted: phase === "vet" ? accepted : null })}`
    phases[phase] = {
      stream: await phaseStream(assistant, final, sessionId),
      // Either CLI may run a phase once a chain crosses over, so both answer.
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
    (await readdir(outputRoot)).filter((name) => /-round\.(md|log)$/.test(name))
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
  return {
    ...f,
    repoRoot,
    planRoot,
    heads,
    report,
    brief,
    phases,
    visible,
    errors,
    status,
    clears: () => clears,
    options,
    records,
    roundFiles,
    ruling: rulingFile,
    watch: watchFile,
    runtime: { ...f.runtime, cwd: outputRoot },
  }
}
