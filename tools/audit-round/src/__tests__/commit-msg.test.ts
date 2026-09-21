import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { stampCommitMessage } from "../commit-msg.js"
import { type Repository, SubjectError } from "../subject.js"

const none = { auditor: null, phases: null }
const primaryAreas = new Set(["tool-audit-round", "area-x"])
const ratings = "[growth:none] [reach:developer] [complexity:none]"
const codeFinding = `- [C] [area:tool-audit-round] ${ratings} Correct the record.`
const planFinding = `- C [field:missing] [section:decisions] ${ratings} Correct the record.`
const message = (subject: string, body = "", model = "gpt-6-astra high") =>
  `${subject}\n\n${model}\n${body === "" ? "" : `\n${body}\n`}`
const stamp = (text: string, repository: Repository = "repo-edu") =>
  stampCommitMessage(text, repository, none, primaryAreas)

test("the hook inserts and overwrites severity while preserving growth, prose and model records", () => {
  for (const authored of ["", "c9 ", "!B2d3 ", "clean ", "D0C2C1 "]) {
    const input = message(
      `oth pruning-high ${authored}docs(repo): describe clean and A9`,
      codeFinding,
    )
    const expected = message(
      "oth pruning-high c1 docs(repo): describe clean and A9",
      codeFinding,
    )
    assert.equal(stamp(input), expected)
    assert.equal(stamp(expected), expected)
    const plan = message(
      `oth ${authored}docs(claude): describe the rule`,
      planFinding,
    )
    assert.equal(
      stamp(plan, "plan"),
      message("oth C1 docs(claude): describe the rule", planFinding),
    )
  }
  const commented = message("oth docs(repo): s", codeFinding).replace(
    "\n\n",
    "\n# Git comment\n\n",
  )
  assert.equal(stamp(commented), commented.replace("oth docs", "oth c1 docs"))
  assert.equal(
    stamp(message("oth docs(repo): s", codeFinding, "gpt")),
    message("oth c1 docs(repo): s", codeFinding, "gpt"),
  )
  assert.equal(
    stamp(message("oth docs(repo): s", codeFinding).trimEnd()),
    message("oth c1 docs(repo): s", codeFinding).trimEnd(),
  )
})

test("every subject class derives only the severity its role admits", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    const sequence = repository === "repo-edu" ? "c1" : "C1"
    for (const subject of [
      "example/impl-1 oth feat(x)",
      "example/implemented oth",
      "example/closed oth",
      ...(repository === "plan"
        ? ["example/init oth", "example/settle oth", "example/ready oth"]
        : []),
    ]) {
      assert.equal(
        stamp(message(`${subject}: s`), repository),
        message(`${subject}: s`),
      )
      assert.throws(
        () => stamp(message(`${subject}: s`, finding), repository),
        /carries no severity/,
      )
    }
    assert.equal(
      stamp(message("example/impl-audit-all oth: s"), repository),
      message("example/impl-audit-all oth clean: s"),
    )
    assert.equal(
      stamp(message("example/impl-audit-1 oth clean: s", finding), repository),
      message(`example/impl-audit-1 oth ${sequence}: s`, finding),
    )
    assert.equal(
      stamp(
        message("example/impl-audit-1-2 oth fix(x): s", finding),
        repository,
      ),
      message(`example/impl-audit-1-2 oth ${sequence} fix(x): s`, finding),
    )
    assert.throws(
      () => stamp(message("example/impl-audit-all oth fix(x): s"), repository),
      /graded finding bullet/,
    )
  }
  assert.equal(
    stamp(message("example/audit oth: s"), "plan"),
    message("example/audit oth clean: s"),
  )
  assert.equal(
    stamp(message("example/audit oth: s", planFinding), "plan"),
    message("example/audit oth C1: s", planFinding),
  )
  assert.equal(
    stamp(message("oth C9 docs(x): s"), "plan"),
    message("oth docs(x): s"),
  )
  assert.throws(() => stamp(message("oth docs(x): s")), /graded finding bullet/)
})

test("a refused subject, missing model and disagreeing effort still stop the commit", () => {
  for (const [input, repository, reason] of [
    [
      message("oth docs(repo): s", codeFinding, "gpt medium"),
      "repo-edu",
      /disagree on the effort/,
    ],
    ["oth docs(repo): s\n\n" + codeFinding, "repo-edu", /model line, not/],
    ["example/impl-1 oth feat(x): s\n", "repo-edu", /open with the model/],
    [
      message("oth update(repo): s", codeFinding),
      "repo-edu",
      /not on the list/,
    ],
    [message("c1 docs(repo): s", codeFinding), "repo-edu", /capability tag/],
    [
      message("oth growth-low docs(x): s", planFinding),
      "plan",
      /growth mark never/,
    ],
    [
      message("example/impl-0 oth feat(x): s"),
      "repo-edu",
      /step .*not a number/,
    ],
    [
      message("example/audit oth docs(x): s", planFinding),
      "plan",
      /no conventional kind/,
    ],
    [
      message("oth unknown docs(x): s", codeFinding),
      "repo-edu",
      /fits no slot/,
    ],
  ] as const) {
    assert.throws(
      () => stamp(input, repository),
      (error: unknown) =>
        error instanceof SubjectError && reason.test(error.message),
      input,
    )
  }
})

test("round stamps compose with the derived sequence and retain every finding", () => {
  const stamps = {
    auditor: "otx",
    phases:
      "audit, rebut: gpt-6-astra xhigh\nvet: claude-fable-5-1 high\nfix: gpt-6-astra high",
  }
  assert.equal(
    stampCommitMessage(
      message("example/impl-audit-all o clean fix(x): s", codeFinding),
      "repo-edu",
      stamps,
      primaryAreas,
    ),
    message(
      "example/impl-audit-all otx c1 fix(x): s",
      codeFinding,
      stamps.phases,
    ),
  )
  assert.equal(
    stampCommitMessage("example/audit o: s\n", "plan", stamps, primaryAreas),
    message("example/audit otx clean: s", "", stamps.phases),
  )
  assert.equal(
    stampCommitMessage(
      `example/impl-audit-2 a docs(x): s\n\n${planFinding}\n`,
      "plan",
      { ...stamps, auditor: "ath" },
      primaryAreas,
    ),
    message(
      "example/impl-audit-2 ath C1 docs(x): s",
      planFinding,
      stamps.phases,
    ),
  )
  const step = message("example/impl-3 obm feat(x): s", "", "gpt medium")
  assert.equal(
    stampCommitMessage(
      step,
      "repo-edu",
      { auditor: "otx", phases: null },
      primaryAreas,
    ),
    step,
  )
  assert.throws(
    () =>
      stampCommitMessage(
        step.replace("gpt medium", "gpt high"),
        "repo-edu",
        { auditor: "otx", phases: null },
        primaryAreas,
      ),
    /disagree/,
  )
})

test("an amendment recalculates removed and regraded findings", () => {
  const original = message("example/impl-audit-all oth: s", codeFinding)
  const first = stamp(original)
  const regraded = first
    .replace("[C]", "[D]")
    .replace("reach:developer", "reach:ordinary")
  assert.match(stamp(regraded), /^example\/impl-audit-all oth !D1: s/)
  assert.equal(
    stamp(first.replace(`\n${codeFinding}\n`, "")),
    "example/impl-audit-all oth clean: s\n\ngpt-6-astra high\n",
  )
})

test("the hook entry writes the derived sequence and leaves a refused file untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "commit-msg-"))
  try {
    const file = join(directory, "COMMIT_EDITMSG")
    const main = fileURLToPath(
      new URL("../commit-msg-main.ts", import.meta.url),
    )
    const run = (repository: Repository, env: Record<string, string> = {}) =>
      execa(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), main, repository, file],
        {
          env: { COMMIT_AUDITOR: "", COMMIT_PHASES: "", ...env },
          reject: false,
        },
      )
    await writeFile(file, `example/audit o !a9: s\n\n${planFinding}\n`)
    const result = await run("plan", {
      COMMIT_AUDITOR: "otx",
      COMMIT_PHASES: "audit: gpt-6-astra xhigh",
    })
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(
      await readFile(file, "utf8"),
      message(
        "example/audit otx C1: s",
        planFinding,
        "audit: gpt-6-astra xhigh",
      ),
    )
    for (const area of [
      "tool-audit-round",
      "tool-audit-rounds",
      "cover-llm-runtime",
    ]) {
      const input = message(
        "oth fix(audit-round): correct the record",
        codeFinding.replace("area:tool-audit-round", `area:${area}`),
      )
      await writeFile(file, input)
      const checked = await run("repo-edu")
      assert.equal(
        checked.exitCode,
        area === "tool-audit-round" ? 0 : 1,
        checked.stderr,
      )
      if (area === "tool-audit-round")
        assert.match(await readFile(file, "utf8"), /^oth c1 fix/)
      else {
        assert.match(checked.stderr, /unknown primary area/)
        assert.match(checked.stderr, /subject-grammar\.md/)
        assert.equal(await readFile(file, "utf8"), input)
      }
    }
    const missing = message(
      "oth fix(audit-round): correct the record",
      codeFinding.replace("[reach:developer] ", ""),
    )
    await writeFile(file, missing)
    const refused = await run("repo-edu")
    assert.equal(refused.exitCode, 1)
    assert.match(refused.stderr, /finding bullet.*reach/)
    assert.equal(await readFile(file, "utf8"), missing)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
