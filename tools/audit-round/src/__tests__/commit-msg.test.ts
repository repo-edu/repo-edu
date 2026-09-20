import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { stampCommitMessage } from "../commit-msg.js"
import { SubjectError } from "../subject.js"

const none = { auditor: null, phases: null }
const primaryAreas = new Set(["tool-audit-round", "area-x"])

test("a session's own commit passes through once its subject and model line check out", () => {
  const message =
    "atm growth-low c1 docs(repo): own the grammar\n\nclaude-fable-5-1 medium\n\n- [C] [area:tool-audit-round] Own the grammar.\n"
  assert.equal(
    stampCommitMessage(message, "repo-edu", none, primaryAreas),
    message,
  )
  const plan =
    "atm C1 docs(claude): link the grammar\n\nclaude-fable-5-1 medium\n\n- C [section:commits] Link the grammar.\n"
  assert.equal(stampCommitMessage(plan, "plan", none, primaryAreas), plan)
  // Git's comment lines are skipped when looking for the model line.
  const commented =
    "atm c1 docs(repo): s\n# Please enter the commit message\n\nclaude-fable-5-1 medium\n\n- [C] [area:tool-audit-round] Correct the record.\n"
  assert.equal(
    stampCommitMessage(commented, "repo-edu", none, primaryAreas),
    commented,
  )
})

test("a refused subject, a missing model line and a disagreeing effort each stop the commit", () => {
  const refuse = (
    text: string,
    repository: "repo-edu" | "plan",
    message: RegExp,
  ) =>
    assert.throws(
      () => stampCommitMessage(text, repository, none, primaryAreas),
      (error: unknown) =>
        error instanceof SubjectError && message.test(error.message),
      text,
    )
  refuse(
    "atm c1 docs(repo): s\n\nclaude-fable-5-1 high\n",
    "repo-edu",
    /disagree on the effort/,
  )
  refuse("atm c1 docs(repo): s\n", "repo-edu", /open with the model/)
  refuse(
    "atm c1 docs(repo): s\n\n- Bullet first.\n",
    "repo-edu",
    /model line, not - Bullet first\./,
  )
  refuse("atm c1 docs(claude): s\n\nclaude-fable-5-1 medium\n", "plan", /bare/)
  refuse(
    "atm clean docs(claude): s\n\nclaude-fable-5-1 medium\n",
    "plan",
    /never clean/,
  )
  refuse(
    "atm c1 update(repo): s\n\nclaude-fable-5-1 medium\n",
    "repo-edu",
    /not on the list/,
  )
  refuse(
    "c1 docs(repo): s\n\nclaude-fable-5-1 medium\n",
    "repo-edu",
    /capability tag/,
  )
  refuse(
    "example/impl-3 atm feat(x): s\n\nclaude-fable-5-1 xhigh\n",
    "repo-edu",
    /disagree on the effort/,
  )
  // A record line with phases or without an effort word says nothing about the tag's effort.
  assert.equal(
    stampCommitMessage(
      "atm c1 docs(repo): s\n\nclaude-fable-5-1\n\n- [C] [area:tool-audit-round] Correct the record.\n",
      "repo-edu",
      none,
      primaryAreas,
    ),
    "atm c1 docs(repo): s\n\nclaude-fable-5-1\n\n- [C] [area:tool-audit-round] Correct the record.\n",
  )
})

test("a round's record takes the auditor's tag and the phases replace the body's opening", () => {
  const stamps = {
    auditor: "otx",
    phases:
      "audit, rebut: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: gpt-6-astra high",
  }
  // The fix writes the auditor's letter alone and the hook widens it.
  assert.equal(
    stampCommitMessage(
      "example/impl-audit-all o c1 fix(x): s\n\ngpt-6-astra high\n\n- [C] [area:area-x] Correct the record.\n",
      "repo-edu",
      stamps,
      primaryAreas,
    ),
    `example/impl-audit-all otx c1 fix(x): s\n\n${stamps.phases}\n\n- [C] [area:area-x] Correct the record.\n`,
  )
  // A clean record carries the tag as the colon's own token.
  assert.equal(
    stampCommitMessage(
      "example/audit o clean: s\n",
      "plan",
      stamps,
      primaryAreas,
    ),
    `example/audit otx clean: s\n\n${stamps.phases}\n`,
  )
  // A body that opened with no model line keeps every line after the phases.
  assert.equal(
    stampCommitMessage(
      "example/impl-audit-2 a D1 docs(x): s\n\n- Bullet.\n",
      "plan",
      { ...stamps, auditor: "ath" },
      primaryAreas,
    ),
    `example/impl-audit-2 ath D1 docs(x): s\n\n${stamps.phases}\n\n- Bullet.\n`,
  )
  // A step commit is not a record, so the auditor never reaches its tag and
  // its effort still has to agree with a single-model record.
  assert.equal(
    stampCommitMessage(
      "example/impl-3 obm feat(x): s\n\ngpt medium\n",
      "repo-edu",
      {
        auditor: "otx",
        phases: null,
      },
      primaryAreas,
    ),
    "example/impl-3 obm feat(x): s\n\ngpt medium\n",
  )
  assert.throws(() =>
    stampCommitMessage(
      "example/impl-3 obm feat(x): s\n\ngpt high\n",
      "repo-edu",
      {
        auditor: "otx",
        phases: null,
      },
      primaryAreas,
    ),
  )
})

test("the hook entry stamps the file in place and names the grammar on a refusal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "commit-msg-"))
  try {
    const file = join(directory, "COMMIT_EDITMSG")
    const main = fileURLToPath(
      new URL("../commit-msg-main.ts", import.meta.url),
    )
    const run = (env: Record<string, string>, repository = "plan") =>
      execa(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), main, repository, file],
        {
          env,
          reject: false,
        },
      )
    await writeFile(
      file,
      "example/audit o B1: s\n\n- B [section:decisions] Correct the decision.\n",
    )
    const stamped = await run({
      COMMIT_AUDITOR: "otx",
      COMMIT_PHASES: "audit: gpt-6-astra xhigh",
    })
    assert.equal(stamped.exitCode, 0, stamped.stderr)
    assert.equal(
      await readFile(file, "utf8"),
      "example/audit otx B1: s\n\naudit: gpt-6-astra xhigh\n\n- B [section:decisions] Correct the decision.\n",
    )
    await writeFile(file, "atm c1 docs(claude): s\n\nclaude-fable-5-1 medium\n")
    const refused = await run({})
    assert.equal(refused.exitCode, 1)
    assert.match(
      refused.stderr,
      /commit-msg: a plan-repository sequence is bare/,
    )
    assert.match(refused.stderr, /subject-grammar\.md/)
    assert.equal(
      await readFile(file, "utf8"),
      "atm c1 docs(claude): s\n\nclaude-fable-5-1 medium\n",
    )
    for (const area of [
      "tool-audit-round",
      "tool-audit-rounds",
      "cover-llm-runtime",
    ]) {
      await writeFile(
        file,
        `oth c1 fix(audit-round): correct the record\n\ngpt-6-astra high\n\n- [C] [area:${area}] Correct the detail.\n`,
      )
      const result = await run(
        { COMMIT_AUDITOR: "", COMMIT_PHASES: "" },
        "repo-edu",
      )
      assert.equal(
        result.exitCode,
        area === "tool-audit-round" ? 0 : 1,
        result.stderr,
      )
      if (area !== "tool-audit-round")
        assert.match(result.stderr, /unknown primary area/)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
