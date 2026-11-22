import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { stampCommitMessage } from "../commit-msg.js"
import { type Repository, SubjectError } from "../subject.js"

const none = { auditor: null, phases: null, series: null }
const areaKinds = new Map([
  ["tool-audit-round", "partition"],
  ["area-x", "partition"],
  ["cover-llm-runtime", "cover"],
])
const ratings =
  "[growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]"
const codeFinding = `- [C] [area:tool-audit-round] ${ratings} Correct: the record.`
const planFinding = `- C [section:decisions] ${ratings} Correct: the record.`
const planningFinding = planFinding.replace("- C ", "- C [field:missing] ")
const message = (subject: string, body = "", model = "gpt-6-astra high") =>
  `${subject}\n\n${model}\n${body === "" ? "" : `\n${body}\n`}`
const stamp = (text: string, repository: Repository = "repo-edu") =>
  stampCommitMessage(text, repository, none, areaKinds)

test("the hook alone requires current primary and cover IDs, including deferred findings", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding =
      repository === "repo-edu"
        ? codeFinding
        : codeFinding.replace("- [C]", "- C")
    for (const [location, reason] of [
      ["[area:retired]", /unknown primary area/],
      ["[area:cover-llm-runtime]", /unknown primary area/],
      ["[area:area-x] [cover:retired]", /unknown cover area/],
      ["[area:area-x] [cover:area-x]", /unknown cover area/],
    ] as const) {
      assert.throws(
        () =>
          stamp(
            message(
              "oth growth-none fix(x): change",
              finding.replace("[area:tool-audit-round]", location),
            ),
            repository,
          ),
        reason,
      )
    }
    assert.doesNotThrow(() =>
      stamp(
        message(
          "oth growth-none fix(x): change",
          finding.replace(
            "[area:tool-audit-round]",
            "[area:area-x] [cover:cover-llm-runtime]",
          ),
        ),
        repository,
      ),
    )
  }
})

test("both hooks validate graded and untiered deferral citations", () => {
  const citationSha = "a".repeat(40)
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    const applied = finding.replace(
      " [growth-pattern:none]",
      ` [applies:${citationSha}/1] [growth-pattern:none]`,
    )
    const subject = `example/impl-audit-1 oth growth-none${repository === "repo-edu" ? " fix(audit-round)" : " docs(claude)"}: s`
    assert.match(stamp(message(subject, applied), repository), / c1 /)

    const clean = message(
      "example/impl-audit-1 oth: s",
      `- [applies:${citationSha}/1] The plan stands.`,
    )
    assert.match(stamp(clean, repository), / oth clean:/)
    for (const invalid of [
      applied.replace(
        `applies:${citationSha}/1`,
        `applies:${citationSha.toUpperCase()}/1`,
      ),
      `- [applies:${citationSha}/0] The plan stands.`,
      `- [applies:${citationSha.slice(0, 6)}/1] The plan stands.`,
      `- [applies:${citationSha}/1] The plan probably stands.`,
    ])
      assert.throws(
        () =>
          stamp(message("example/impl-audit-1 oth: s", invalid), repository),
        /citation|applies|say exactly/,
      )
  }
})

test("the hook inserts and overwrites severity while preserving the burden mark, prose and model records", () => {
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
      `oth growth-none ${authored}docs(claude): describe the rule`,
      planFinding,
    )
    assert.equal(
      stamp(plan, "plan"),
      message(
        "oth growth-none c1 docs(claude): describe the rule",
        planFinding,
      ),
    )
  }
  const commented = message(
    "oth growth-none docs(repo): s",
    codeFinding,
  ).replace("\n\n", "\n# Git comment\n\n")
  assert.equal(
    stamp(commented),
    commented.replace("oth growth-none docs", "oth growth-none c1 docs"),
  )
  assert.throws(
    () => stamp(message("oth growth-none docs(repo): s", codeFinding, "gpt")),
    /model line/,
  )
  assert.equal(
    stamp(message("oth growth-none docs(repo): s", codeFinding).trimEnd()),
    message("oth growth-none c1 docs(repo): s", codeFinding).trimEnd(),
  )
  assert.equal(
    stamp(
      `oth growth-none docs(repo): s\ngpt-6-astra high\n\n${codeFinding}\n`,
    ),
    message("oth growth-none c1 docs(repo): s", codeFinding),
  )
})

test("every subject class derives only the severity its role admits", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    for (const subject of [
      "example/impl-1 oth feat(x)",
      "example/implemented oth",
      "example/closed oth",
      ...(repository === "plan" ? ["example/init oth"] : []),
    ]) {
      const model = subject.includes("/impl-1 ")
        ? "gpt-6-astra high\nImplementation took 3 min."
        : "gpt-6-astra high"
      assert.equal(
        stamp(message(`${subject}: s`, "", model), repository),
        message(`${subject}: s`, "", model),
      )
      assert.throws(
        () => stamp(message(`${subject}: s`, finding), repository),
        /carries no severity/,
      )
    }
    assert.equal(
      stamp(message("example/impl-audit-1 oth: s"), repository),
      message("example/impl-audit-1 oth clean: s"),
    )
    assert.equal(
      stamp(message("example/impl-audit-1 oth clean: s", finding), repository),
      message("example/impl-audit-1 oth c1: s", finding),
    )
    assert.equal(
      stamp(
        message("example/impl-audit-1-2 oth growth-none fix(x): s", finding),
        repository,
      ),
      message("example/impl-audit-1-2 oth growth-none c1 fix(x): s", finding),
    )
    assert.throws(
      () => stamp(message("example/impl-audit-1 oth fix(x): s"), repository),
      /graded finding bullet/,
    )
    // A commit audit's record takes a fix's or a clean record's severity, and
    // no deferral record exists for it.
    const series = "commit-83bde0+3095d1/commit-audit"
    assert.equal(
      stamp(message(`${series} oth: s`), repository),
      message(`${series} oth clean: s`),
    )
    assert.equal(
      stamp(message(`${series} oth growth-low fix(x): s`, finding), repository),
      message(`${series} oth growth-low c1 fix(x): s`, finding),
    )
    assert.throws(
      () => stamp(message(`${series} oth growth-none fix(x): s`), repository),
      /graded finding bullet/,
    )
    assert.throws(
      () => stamp(message(`${series} oth: s`, finding), repository),
      /conventional kind/,
    )
  }
  assert.equal(
    stamp(message("example/plan-audit oth: s"), "plan"),
    message("example/plan-audit oth clean: s"),
  )
  assert.equal(
    stamp(
      message("example/plan-audit oth growth-none: s", planningFinding),
      "plan",
    ),
    message("example/plan-audit oth growth-none c1: s", planningFinding),
  )
  assert.equal(
    stamp(message("oth C9 docs(x): s"), "plan"),
    message("oth docs(x): s"),
  )
  assert.throws(() => stamp(message("oth docs(x): s")), /graded finding bullet/)
})

test("the hook accepts plan-repo lifecycle subjects without attribution", () => {
  for (const role of ["settle", "ready"] as const) {
    const input =
      role === "ready"
        ? "example/ready: record the marker\n\nCoder: codex gpt-6.1-sol high\n"
        : "example/settle: record the marker\n"
    assert.equal(stamp(input, "plan"), input)
    assert.throws(
      () => stamp(input, "repo-edu"),
      /belongs to the plan repository/,
    )
  }
  assert.throws(
    () => stamp(message("example/settle oth: record the marker"), "plan"),
    /carries no capability tag/,
  )
  assert.throws(
    () => stamp("example/ready: record the marker\n", "plan"),
    /coder record/,
  )
  const disprove =
    "example/disprove: example-plan-audit round 2 finding 3\n\nThe evidence disproves this claim.\n"
  assert.equal(stamp(disprove, "plan"), disprove)
  const disprovedVet =
    "example/disprove: example-plan-audit round 2 vet finding 3\n\nThe vet verdict disproves the finding.\n"
  assert.equal(stamp(disprovedVet, "plan"), disprovedVet)
  const detailed =
    "example/disprove: example-plan-audit by gpt-5.6-sol xhigh\n\n- The first claim was wrong.\n- The second claim was wrong.\n"
  assert.equal(stamp(detailed, "plan"), detailed)
  assert.throws(() => stamp(disprove, "repo-edu"), /belongs to the plan/)
  assert.throws(
    () =>
      stamp("example/disprove: example-plan-audit round 2 finding 3\n", "plan"),
    /full reason/,
  )
  assert.throws(
    () =>
      stamp(
        message(
          "example/disprove oth: example-plan-audit round 2 finding 3",
          "The evidence disproves this claim.",
        ),
        "plan",
      ),
    /carries no capability tag/,
  )
})

test("only planning-audit findings carry a search direction", () => {
  for (const location of ["[section:decisions]", "[area:area-x]"]) {
    const finding = planFinding.replace("[section:decisions]", location)
    for (const field of ["excess", "missing"]) {
      const planning = finding.replace("- C ", `- C [field:${field}] `)
      assert.equal(
        stamp(
          message("example/plan-audit oth growth-none: s", planning),
          "plan",
        ),
        message("example/plan-audit oth growth-none c1: s", planning),
      )
      for (const subject of [
        "example/impl-audit-1 oth growth-none docs(x)",
        "example/impl-audit-1-2 oth",
        "commit-804833/commit-audit oth growth-none docs(x)",
        "oth growth-none docs(x)",
      ]) {
        assert.doesNotThrow(() =>
          stamp(message(`${subject}: s`, finding), "plan"),
        )
        assert.throws(
          () => stamp(message(`${subject}: s`, planning), "plan"),
          /field.*only to a planning audit/,
        )
      }
    }
    for (const fields of [
      "",
      "[field:other] ",
      "[field:missing] [field:excess] ",
    ]) {
      assert.throws(
        () =>
          stamp(
            message(
              "example/plan-audit oth: s",
              finding.replace("- C ", `- C ${fields}`),
            ),
            "plan",
          ),
        /field/,
      )
    }
  }
})

test("a refused subject, missing model and disagreeing effort still stop the commit", () => {
  for (const [input, repository, reason] of [
    [
      message("oth growth-none docs(repo): s", codeFinding, "gpt medium"),
      "repo-edu",
      /disagree on the effort/,
    ],
    [
      `oth growth-none docs(repo): s\n\n${codeFinding}`,
      "repo-edu",
      /model line, not/,
    ],
    ["example/impl-1 oth feat(x): s\n", "repo-edu", /open with the model/],
    [
      message("oth update(repo): s", codeFinding),
      "repo-edu",
      /not on the list/,
    ],
    [message("c1 docs(repo): s", codeFinding), "repo-edu", /capability tag/],
    [
      message("example/plan-audit oth growth-low: s"),
      "plan",
      /beside a severity/,
    ],
    [
      message("example/impl-0 oth feat(x): s"),
      "repo-edu",
      /step .*not a number/,
    ],
    [
      message("example/plan-audit oth docs(x): s", planningFinding),
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
    series: null,
  }
  assert.equal(
    stampCommitMessage(
      message(
        "example/impl-audit-1 o growth-none clean fix(x): s",
        codeFinding,
      ),
      "repo-edu",
      stamps,
      areaKinds,
    ),
    message(
      "example/impl-audit-1 otx growth-none c1 fix(x): s",
      codeFinding,
      stamps.phases,
    ),
  )
  assert.equal(
    stampCommitMessage("example/plan-audit o: s\n", "plan", stamps, areaKinds),
    message("example/plan-audit otx clean: s", "", stamps.phases),
  )
  assert.equal(
    stampCommitMessage(
      `example/impl-audit-2 a growth-none docs(x): s\n\n${planFinding}\n`,
      "plan",
      { ...stamps, auditor: "ath" },
      areaKinds,
    ),
    message(
      "example/impl-audit-2 ath growth-none c1 docs(x): s",
      planFinding,
      stamps.phases,
    ),
  )
  assert.equal(
    stampCommitMessage(
      message("commit-804833/commit-audit a growth-low fix(x): s", codeFinding),
      "repo-edu",
      stamps,
      areaKinds,
    ),
    message(
      "commit-804833/commit-audit otx growth-low c1 fix(x): s",
      codeFinding,
      stamps.phases,
    ),
  )
  const step = message(
    "example/impl-3 obm feat(x): s",
    "",
    "gpt medium\nImplementation took 5 min.",
  )
  assert.equal(
    stampCommitMessage(
      step,
      "repo-edu",
      { auditor: "otx", phases: null, series: null },
      areaKinds,
    ),
    step,
  )
  assert.throws(
    () =>
      stampCommitMessage(
        step.replace("gpt medium", "gpt high"),
        "repo-edu",
        { auditor: "otx", phases: null, series: null },
        areaKinds,
      ),
    /disagree/,
  )
  for (const repository of ["repo-edu", "plan"] as const)
    assert.throws(
      () =>
        stamp(
          message("example/impl-3 obm feat(x): s", "", "gpt medium"),
          repository,
        ),
      /implementation time/,
    )
})

test("a commit round's label opens every record its fix lands, in place of any form the fix wrote", () => {
  const stamps = {
    auditor: "otx",
    phases: "audit, rebut: gpt-6-astra xhigh\nfix: gpt-6-astra high",
    series: "commit-83bde0+3095d1",
  }
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    const expected = message(
      "commit-83bde0+3095d1/commit-audit otx growth-none c1 docs(x): s",
      finding,
      stamps.phases,
    )
    for (const subject of [
      "a growth-none docs(x): s",
      "commit-804833/commit-audit a growth-none docs(x): s",
      "example/impl-audit-1 a growth-none docs(x): s",
    ]) {
      const stamped = stampCommitMessage(
        message(subject, finding),
        repository,
        stamps,
        areaKinds,
      )
      assert.equal(stamped, expected)
      assert.equal(
        stampCommitMessage(stamped, repository, stamps, areaKinds),
        expected,
      )
    }
  }
  assert.throws(
    () =>
      stampCommitMessage(
        message("a growth-none docs(x): s"),
        "repo-edu",
        stamps,
        areaKinds,
      ),
    /graded/,
  )
})

test("round stamps replace the whole opening model record and time line without changing on a second stamp", () => {
  const stamps = {
    auditor: "ath",
    phases:
      "audit: claude-fable-5-1 high\nvet, fix: gpt-6-astra high\nAudit and vet took 7 min.",
    series: null,
  }
  const previous =
    "audit: claude-fable-5-1 medium\nvet, fix: gpt-6-astra medium\nAudit and vet took 9 min."
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    for (const body of [
      "",
      `${finding}\n\nRecord details\n\ngpt-6-astra low`,
    ]) {
      const input = message("example/impl-audit-1 ath: s", body, previous)
      const expected = message(
        `example/impl-audit-1 ath ${body === "" ? "clean" : "c1"}: s`,
        body,
        stamps.phases,
      )
      const first = stampCommitMessage(input, repository, stamps, areaKinds)
      assert.equal(first, expected)
      assert.equal(
        stampCommitMessage(first, repository, stamps, areaKinds),
        expected,
      )
      assert.equal(stamp(first, repository), expected)
    }
  }
})

test("an amendment recalculates removed and regraded findings", () => {
  const original = message("example/impl-audit-1 oth: s", codeFinding)
  const first = stamp(original)
  const regraded = first
    .replace("[C]", "[D]")
    .replace("reach:developer", "reach:end-user")
  assert.match(stamp(regraded), /^example\/impl-audit-1 oth !D1: s/)
  assert.equal(
    stamp(first.replace(`\n${codeFinding}\n`, "")),
    "example/impl-audit-1 oth clean: s\n\ngpt-6-astra high\n",
  )
})

test("the hook blocks both repositories while serious contests need winners", () => {
  for (const repository of ["repo-edu", "plan"] as const)
    assert.throws(
      () =>
        stampCommitMessage(
          message("example/impl-audit-1 oth clean: s"),
          repository,
          none,
          areaKinds,
          { openContests: [2, 5], changedPaths: [] },
        ),
      /findings 2, 5 still need the user's contest winner/,
    )
})

test("a plan step or an implementation-audit fix changes a listed path of its repository", () => {
  const changing = (
    subject: string,
    repository: Repository,
    changedPaths: readonly string[],
    model = "gpt-6-astra high",
  ) =>
    stampCommitMessage(
      message(
        subject,
        subject.startsWith("oth ")
          ? repository === "repo-edu"
            ? codeFinding
            : planFinding
          : "",
        model,
      ),
      repository,
      none,
      areaKinds,
      { openContests: [], changedPaths },
    )
  const listed = {
    "repo-edu": ".agents/references/round-protocol.md",
    plan: ".agents/references/planning-rules.md",
  } as const
  const otherRepository = {
    "repo-edu": "GROWTH-PATTERNS.md",
    plan: "tools/audit-round/src/listed-files.json",
  } as const
  for (const repository of ["repo-edu", "plan"] as const) {
    const offPlan = "oth growth-none docs(x): s"
    for (const path of [
      listed[repository],
      ".agents/skills/vet/references/new-judgement.md",
    ])
      assert.throws(
        () => changing(offPlan, repository, ["README.md", path]),
        (error: unknown) =>
          error instanceof SubjectError &&
          error.message.startsWith(`${path} is a listed file`) &&
          /FAILURES\.md/.test(error.message) &&
          /Doctrine changes in \.agents\/references\/planning-rules\.md/.test(
            error.message,
          ),
      )
    assert.doesNotThrow(() =>
      changing(
        "example/impl-3 oth docs(x): s",
        repository,
        [listed[repository]],
        "gpt-6-astra high\nImplementation took 3 min.",
      ),
    )
    assert.doesNotThrow(() =>
      changing("example/impl-audit-1-3 oth: s", repository, [
        listed[repository],
      ]),
    )
    assert.throws(
      () =>
        changing("commit-804833/commit-audit oth: s", repository, [
          listed[repository],
        ]),
      (error: unknown) =>
        error instanceof SubjectError &&
        error.message.startsWith(`${listed[repository]} is a listed file`),
    )
    for (const path of [
      ".agents/skills/implement/references/workflow.md",
      ".agents/skills/vet/referencesx/workflow.md",
      otherRepository[repository],
    ])
      assert.doesNotThrow(() => changing(offPlan, repository, [path]))
  }
  assert.throws(
    () =>
      changing("example/plan-audit oth: s", "plan", [
        "GROWTH-PATTERNS.md",
        ".agents/skills/fix/references/workflow.md",
      ]),
    /GROWTH-PATTERNS\.md, \.agents\/skills\/fix\/references\/workflow\.md are listed files/,
  )
})

test("an off-plan commit whose graded bullets are all tier D changes a listed path", () => {
  const listed = {
    "repo-edu": ".agents/references/round-protocol.md",
    plan: ".agents/references/planning-rules.md",
  } as const
  const changing = (
    subject: string,
    body: string,
    repository: Repository,
    series: string | null = null,
  ) =>
    stampCommitMessage(
      message(subject, body),
      repository,
      { ...none, series },
      areaKinds,
      { openContests: [], changedPaths: [listed[repository]] },
    )
  const refused = (repository: Repository) => (error: unknown) =>
    error instanceof SubjectError &&
    error.message.startsWith(`${listed[repository]} is a listed file`) &&
    /off-plan commit with at least one graded bullet and every graded bullet at tier D/.test(
      error.message,
    )
  for (const repository of ["repo-edu", "plan"] as const) {
    const finding = repository === "repo-edu" ? codeFinding : planFinding
    const wording = (
      repository === "repo-edu"
        ? finding.replace("- [C] ", "- [D] ")
        : finding.replace("- C ", "- D ")
    ).replace("Correct: the record.", "Wording: the sentence reads plainer.")
    assert.match(
      changing(
        "oth growth-none docs(x): s",
        `${wording}\n${wording}`,
        repository,
      ),
      /^oth growth-none d2 docs\(x\): s\n/,
    )
    assert.throws(
      () =>
        changing(
          "oth growth-none docs(x): s",
          `${wording}\n${finding}`,
          repository,
        ),
      refused(repository),
    )
    // The round hands its series label to the hook, which opens the subject
    // with the commit-audit form whatever the fix session typed.
    assert.throws(
      () =>
        changing(
          "oth growth-none docs(x): s",
          wording,
          repository,
          "commit-804833",
        ),
      refused(repository),
    )
  }
  assert.throws(() => changing("oth docs(x): s", "", "plan"), refused("plan"))
  assert.throws(
    () =>
      changing(
        "example/plan-audit oth growth-none: s",
        planningFinding.replace("- C ", "- D "),
        "plan",
      ),
    refused("plan"),
  )
})

test("the hook entry writes the derived sequence and leaves a refused file untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "commit-msg-"))
  try {
    const file = join(directory, "COMMIT_EDITMSG")
    const main = fileURLToPath(
      new URL("../commit-msg-main.ts", import.meta.url),
    )
    const run = (
      repository: Repository,
      env: Record<string, string> = {},
      changedPaths = "",
    ) =>
      execa(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), main, repository, file],
        {
          env: {
            COMMIT_AUDITOR: "",
            COMMIT_PHASES: "",
            COMMIT_SERIES: "",
            COMMIT_OPEN_CONTESTS: "",
            ...env,
          },
          input: changedPaths,
          reject: false,
        },
      )
    await writeFile(
      file,
      `example/plan-audit o growth-none !a9: s\n\n${planningFinding}\n`,
    )
    const result = await run("plan", {
      COMMIT_AUDITOR: "otx",
      COMMIT_PHASES: "audit: gpt-6-astra xhigh",
    })
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(
      await readFile(file, "utf8"),
      message(
        "example/plan-audit otx growth-none c1: s",
        planningFinding,
        "audit: gpt-6-astra xhigh",
      ),
    )
    const blockedInput = message("example/impl-audit-1 oth clean: blocked")
    for (const repository of ["repo-edu", "plan"] as const) {
      await writeFile(file, blockedInput)
      const blocked = await run(repository, { COMMIT_OPEN_CONTESTS: "2,5" })
      assert.equal(blocked.exitCode, 1)
      assert.match(blocked.stderr, /findings 2, 5 still need/)
      assert.equal(await readFile(file, "utf8"), blockedInput)
    }
    for (const subject of [
      "example/impl-audit-1 oth growth-none docs(x)",
      "example/impl-audit-1 oth",
      "oth growth-none docs(x)",
    ]) {
      await writeFile(file, message(`${subject}: s`, planFinding))
      const accepted = await run("plan")
      assert.equal(accepted.exitCode, 0, accepted.stderr)
      assert.equal(
        await readFile(file, "utf8"),
        stamp(message(`${subject}: s`, planFinding), "plan"),
      )
      const input = message(`${subject}: s`, planningFinding)
      await writeFile(file, input)
      const refused = await run("plan")
      assert.equal(refused.exitCode, 1)
      assert.match(refused.stderr, /field.*only to a planning audit/)
      assert.equal(await readFile(file, "utf8"), input)
    }
    for (const repository of ["repo-edu", "plan"] as const) {
      const finding =
        repository === "repo-edu"
          ? codeFinding
          : codeFinding.replace("- [C]", "- C")
      for (const [location, accepted, reason] of [
        ["[area:tool-audit-round]", true, null],
        ["[area:tool-audit-rounds]", false, /unknown primary area/],
        ["[area:cover-llm-runtime]", false, /unknown primary area/],
        ["[area:tool-audit-round] [cover:cover-llm-runtime]", true, null],
        [
          "[area:tool-audit-round] [cover:tool-audit-round]",
          false,
          /unknown cover area/,
        ],
        [
          "[area:tool-audit-round] [cover:retired-cover]",
          false,
          /unknown cover area/,
        ],
      ] as const) {
        const input = message(
          "oth growth-none fix(audit-round): correct the record",
          finding.replace("[area:tool-audit-round]", location),
        )
        await writeFile(file, input)
        const checked = await run(repository)
        assert.equal(checked.exitCode, accepted ? 0 : 1, checked.stderr)
        if (accepted)
          assert.equal(await readFile(file, "utf8"), stamp(input, repository))
        else {
          assert.match(checked.stderr, reason)
          assert.match(checked.stderr, /subject-grammar\.md/)
          assert.equal(await readFile(file, "utf8"), input)
        }
      }
    }
    const offPlan = message("oth growth-none docs(repo): s", codeFinding)
    await writeFile(file, offPlan)
    const listed = await run(
      "repo-edu",
      {},
      "README.md\0.agents/skills/watch/references/new.md\0",
    )
    assert.equal(listed.exitCode, 1)
    assert.match(
      listed.stderr,
      /\.agents\/skills\/watch\/references\/new\.md is a listed file/,
    )
    assert.equal(await readFile(file, "utf8"), offPlan)
    const unlisted = await run("repo-edu", {}, "README.md\0")
    assert.equal(unlisted.exitCode, 0, unlisted.stderr)
    for (const repository of ["repo-edu", "plan"] as const) {
      const finding = repository === "repo-edu" ? codeFinding : planFinding
      await writeFile(file, message("oth growth-none docs(repo): s", finding))
      const series = await run(repository, { COMMIT_SERIES: "commit-804833" })
      assert.equal(series.exitCode, 0, series.stderr)
      assert.equal(
        await readFile(file, "utf8"),
        message(
          "commit-804833/commit-audit oth growth-none c1 docs(repo): s",
          finding,
        ),
      )
    }
    const joined = message(
      "oth fix(audit-round): correct the record",
      `${codeFinding}\n${codeFinding.replace("[C] ", "[C]")}`,
    )
    await writeFile(file, joined)
    const joinedResult = await run("repo-edu")
    assert.equal(joinedResult.exitCode, 1)
    assert.match(joinedResult.stderr, /finding bullet.*needs location/)
    assert.equal(await readFile(file, "utf8"), joined)
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
