import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { completeClean } from "../clean.js"
import { stampCommitMessage } from "../commit-msg.js"
import { planStem } from "../target.js"
import { runCommand } from "./configured-runner.js"
import { roundFixture } from "./round-fixture.js"

for (const working of ["plan", "repo-edu"] as const) {
  for (const owner of working === "plan"
    ? (["plan"] as const)
    : (["plan", "repo-edu"] as const)) {
    test(`clean ${working} audit records at ${owner} without touching staged work or running a due watch`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        owner,
        false,
        null,
        true,
        working,
        true,
      )
      const cwd = owner === "plan" ? f.planRoot : f.repoRoot
      const git = async (...args: string[]) =>
        (await execa("git", args, { cwd })).stdout
      await writeFile(join(cwd, "staged.txt"), "User work\n")
      await git("add", "staged.txt")
      const staged = await git("diff", "--cached")
      const handoff = join(
        f.planRoot,
        `example-handoff.${f.heads.plan.slice(0, 6)}.md`,
      )
      await writeFile(handoff, "Prior reasoning\n")
      const report = await readFile(f.report, "utf8")
      assert.equal(
        await runCommand(
          working === "plan"
            ? ["example-widen.md"]
            : ["../plan/example.md", "2-3"],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      assert.equal(await git("diff", "--cached"), staged)
      assert.equal(
        await git("rev-parse", "HEAD^{tree}"),
        await git("rev-parse", "HEAD^^{tree}"),
      )
      const message = await git("log", "-1", "--format=%B")
      assert.match(
        message,
        new RegExp(
          `^example/${working === "plan" ? "audit" : "impl-audit-2-3"} otx clean:`,
        ),
      )
      assert.equal(
        stampCommitMessage(
          message,
          owner,
          { auditor: null, phases: null },
          new Map(),
        ),
        message,
      )
      assert.equal(
        message.includes("Round yield: 0 ordinary; 0 rare; 0 developer."),
        owner === "repo-edu",
      )
      assert.equal(await readFile(f.report, "utf8"), report)
      assert.equal(await readFile(handoff, "utf8"), "Prior reasoning\n")
      const { log, markdown } = await f.records()
      assert.doesNotMatch(
        log,
        /\[(?:vet|rebut|fix|brief|watch|watch-edit)\] starting|\[glance\]/,
      )
      assert.match(markdown, /Clean audit recorded/)
    })
  }
}

test("clean commit audit keeps the report and makes no commit", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    true,
    "repo-edu",
    true,
  )
  assert.equal(await runCommand(["HEAD"], f.runtime, f.options), 0)
  assert.equal(
    (await execa("git", ["rev-parse", "--short", "HEAD"], { cwd: f.repoRoot }))
      .stdout,
    f.heads["repo-edu"],
  )
  assert.match(await readFile(f.report, "utf8"), /No findings/)
  const { log, markdown } = await f.records()
  assert.doesNotMatch(log, /\[(?:vet|rebut|fix|brief|watch)\] starting/)
  assert.match(markdown, /Clean audit\. Report retained/)
})

test("two clean audits still complete the explicitly requested chain with no other sessions", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    true,
    "plan",
    true,
  )
  assert.equal(
    await runCommand(["example.md", "--chain"], f.runtime, f.options),
    0,
  )
  const calls = (await f.calls()).filter(
    (call) =>
      call.args[0] === "exec" ||
      (call.args[0] === "-p" &&
        !call.args.includes("--no-session-persistence")),
  )
  assert.deepEqual(
    calls.map((call) => call.assistant),
    ["codex", "claude"],
  )
  const subjects = (
    await execa("git", ["log", "-2", "--format=%s"], { cwd: f.planRoot })
  ).stdout
  assert.match(subjects, /^example\/audit ath clean:/)
  assert.match(subjects, /\nexample\/audit otx clean:/)
})

test("a refused clean commit fails without starting a fix or deleting the evidence", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    true,
    "plan",
    true,
  )
  const hooks = join(f.planRoot, ".test-hooks")
  await mkdir(hooks)
  await writeFile(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755,
  })
  await execa("git", ["config", "core.hooksPath", hooks], { cwd: f.planRoot })
  assert.equal(
    await runCommand(["example.md", "--chain"], f.runtime, f.options),
    1,
  )
  const { log } = await f.records()
  assert.match(log, /\[complete\] failed/)
  assert.doesNotMatch(log, /\[(?:fix|brief|watch)\] starting|Resume:/)
  assert.match(await readFile(f.report, "utf8"), /No missing findings/)
})

test("clean records share archived and widening plan identities with output files", async () => {
  assert.equal(planStem("../plan/archive/topic/plan.md"), "topic")
  assert.equal(planStem("../plan/topic-widen.md"), "topic")
  await assert.rejects(
    completeClean(
      {
        cwd: "/repo",
        repoEduRoot: "/repo",
        planRoot: "/plan",
        roundKind: "planning",
        plan: "topic.md",
        report: "/elsewhere/topic-audit.md",
      },
      { auditor: "oth", phases: "audit: gpt-6-astra high" },
    ),
    /clean report must belong/,
  )
})
