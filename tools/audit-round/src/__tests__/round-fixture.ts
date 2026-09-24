import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
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
    { cwd },
  )
  return (await execa("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout
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
   * alongside a ruling. Both heads are recorded at HEAD, so the glance finds
   * nothing to count: false records green, which is not due, and true records
   * red, which is re-read every round.
   */
  watch = false,
  working: "repo-edu" | "plan" = "repo-edu",
  /** Whether the audit reports no findings, which completes without another assistant. */
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
  // The command checks the plan where the phases open it, so both roots hold
  // the plan and its widening artifact.
  for (const root of [repoRoot, planDirectory])
    for (const name of ["example.md", "example-widen.md"])
      await writeFile(join(root, name), "# Example plan\n")
  const planRoot = await realpath(planDirectory)
  const outputRoot = working === "plan" ? planRoot : repoRoot
  const heads = {
    "repo-edu": await commitFixture(repoRoot),
    plan: await commitFixture(planRoot),
  }
  const cacheRoot = join(f.root, "cache")
  await mkdir(cacheRoot)
  await writeFile(
    join(cacheRoot, "watch.json"),
    JSON.stringify({
      example: {
        heads,
        grade: watch ? "red" : "green",
        written: "2026-09-20",
      },
    }),
  )
  const report = join(outputRoot, "audit-source.md")
  const finding = (location: string) =>
    `1. **B: Fixture finding**\n   Correct the fixture.\n   ${location} [growth:none] [reach:developer] [complexity:none]\n`
  await writeFile(
    report,
    `Judged repos: ${owner}@${heads[owner]}\n\n` +
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
    "brief",
    "watch",
    "watch-edit",
  ] as const) {
    const assistant = ["fix", "brief", "watch", "watch-edit"].includes(phase)
      ? "codex"
      : phase === "vet"
        ? auditor === "codex"
          ? "claude"
          : "codex"
        : auditor
    const sessionId = phase === "rebut" ? "audit-session" : `${phase}-session`
    const status = phase === "fix" && ruling ? "needs-ruling" : "finished"
    const final = `Complete ${phase} text.\n\n| Result | Value |\n| --- | --- |\n| Round | ${phase} |\nPHASE RESULT: ${JSON.stringify({ status, reason: null })}`
    phases[phase] = {
      document:
        phase === "audit"
          ? { source: report }
          : phase === "vet"
            ? { source: join(f.root, owner, "VET-example.md") }
            : phase === "fix"
              ? ruling
                ? { text: "Written ruling by fix" }
                : undefined
              : { text: `Written ${phase}` },
      commits:
        phase === "fix" && !ruling
          ? [
              {
                cwd: owner === "plan" ? planRoot : repoRoot,
                subject:
                  tier === null
                    ? "example/impl-audit-all oth clean: fixture"
                    : `example/impl-audit-all oth ${owner === "plan" ? tier.toUpperCase() : tier}1 fix(audit-round): fixture`,
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
      /-0-round\.[ao][btu][lmhx]\.(md|log)$/.test(name),
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
    for (const root of [
      outputRoot,
      outputRoot === repoRoot ? planRoot : repoRoot,
    ]) {
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
          const path = (JSON.parse(match[1]) as string[]).find((path) =>
            path.includes(`-${kind}.`),
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
    heads,
    get report() {
      return document("audit", report)
    },
    get brief() {
      return document("brief", "")
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
    runtime: { ...f.runtime, cwd: outputRoot },
  }
}
