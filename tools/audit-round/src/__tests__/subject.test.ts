import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { readModelRecord, readStepModelRecord } from "../commit-msg.js"
import {
  isAuditRole,
  looseRole,
  parseSubject,
  planForm,
  type Repository,
  type SubjectClass,
  SubjectError,
  seriesForm,
  seriesLabel,
  withSeriesForm,
} from "../subject.js"

const grammar = fileURLToPath(
  new URL("../../../../.agents/references/subject-grammar.md", import.meta.url),
)

/**
 * The grammar's own examples, read from the document so that the parser and
 * the reference cannot drift: each fenced block under a repository heading
 * lists one class label and one subject per line.
 */
type Example = {
  readonly repository: Repository
  readonly class: SubjectClass
  readonly subject: string
}

async function examples(): Promise<Example[]> {
  const text = await readFile(grammar, "utf8")
  const section = text.slice(text.indexOf("## Subject examples"))
  const found: Example[] = []
  for (const [, heading, block] of section.matchAll(
    /\n(Plan repo|Repo Edu):\n\n```text\n([\s\S]*?)```/g,
  )) {
    const repository: Repository = heading === "Plan repo" ? "plan" : "repo-edu"
    for (const line of block.split("\n").filter((line) => line.length > 0)) {
      const match = /^([PICOS]\d)(?: plan| Repo Edu)?\s+(.+)$/.exec(line)
      assert.ok(match, `unreadable example line: ${line}`)
      found.push({
        repository,
        class: match[1] as SubjectClass,
        subject: match[2],
      })
    }
  }
  return found
}

test("the subject grammar's model-record examples are parser fixtures", async () => {
  const text = await readFile(grammar, "utf8")
  const section = text.slice(
    text.indexOf("### Model record examples"),
    text.indexOf("## Terminals and small non-terminals"),
  )
  const examples = [
    ...section.matchAll(
      /#### `model-record\/([^`]+)` — parsed\n\n```text\n([\s\S]*?)\n```/g,
    ),
  ]
  assert.deepEqual(
    examples.map((example) => example[1]),
    ["single", "step", "round"],
  )
  for (const [, id, source] of examples) {
    const lines = readModelRecord(source)
    assert.equal(lines.length, id === "single" ? 1 : id === "step" ? 2 : 3, id)
    assert.equal(source, lines.join("\n"), id)
  }
  assert.deepEqual(
    readStepModelRecord("gpt-6.1-sol xhigh\nImplementation took 17 min."),
    { model: "gpt-6.1-sol", effort: "xhigh", minutes: 17 },
  )
})

test("range examples parse and obsolete all examples are refused", async () => {
  const lines = await examples()
  assert.ok(lines.length >= 23)
  for (const { repository, class: expected, subject } of lines) {
    if (subject.includes("/impl-audit-all ")) {
      assert.throws(
        () => parseSubject(`${subject} the sentence`, repository),
        /step scope/,
      )
    } else {
      assert.equal(
        parseSubject(
          expected === "P4" ? subject : `${subject} the sentence`,
          repository,
        ).class,
        expected,
        subject,
      )
    }
  }
})

test("the parser reads every slot of a marked subject", () => {
  assert.deepEqual(
    parseSubject(
      "round-file-naming/impl-audit-2-3 oth pruning-high !B1C1c2d1 fix(audit-round): record reported phase models",
      "repo-edu",
    ),
    {
      class: "I2",
      form: { stem: "round-file-naming", role: "impl-audit", scope: "2-3" },
      tag: { vendor: "o", tier: "t", effort: "h" },
      burden: { direction: "pruning", level: "high" },
      severity: {
        ordinary: true,
        upper: [
          { tier: "b", count: 1 },
          { tier: "c", count: 1 },
        ],
        lower: [
          { tier: "c", count: 2 },
          { tier: "d", count: 1 },
        ],
      },
      kind: { conventional: "fix", scope: "audit-round" },
      sentence: "record reported phase models",
    },
  )
  assert.deepEqual(parseSubject("plan/impl-12 abl docs(x): s", "plan").form, {
    stem: "plan",
    role: "impl",
    scope: "12",
  })
  for (const repository of ["repo-edu", "plan"] as const) {
    assert.deepEqual(
      parseSubject(
        "commit-733686..d081b7+8d6f95/commit-audit abx pruning-low c3 docs(audit-round): s",
        repository,
      ),
      {
        class: "C1",
        form: { series: "commit-733686..d081b7+8d6f95", role: "commit-audit" },
        tag: { vendor: "a", tier: "b", effort: "x" },
        burden: { direction: "pruning", level: "low" },
        severity: {
          ordinary: false,
          upper: [],
          lower: [{ tier: "c", count: 3 }],
        },
        kind: { conventional: "docs", scope: "audit-round" },
        sentence: "s",
      },
    )
    assert.equal(
      parseSubject("commit-804833/commit-audit obx clean: s", repository).class,
      "C2",
    )
  }
  // The sentence may hold colons of its own; only the first tag-ending colon splits.
  assert.equal(
    parseSubject(
      "atx growth-none c1 docs(repo): note: keep the colon",
      "repo-edu",
    ).sentence,
    "note: keep the colon",
  )
})

test("settle and ready omit the capability tag only in the plan repository", () => {
  for (const role of ["settle", "ready"] as const) {
    assert.deepEqual(
      parseSubject(`example/${role}: record the marker`, "plan"),
      {
        class: "P3",
        form: { stem: "example", role, scope: null },
        tag: null,
        burden: null,
        severity: null,
        kind: null,
        sentence: "record the marker",
      },
    )
    assert.throws(
      () => parseSubject(`example/${role}: record the marker`, "repo-edu"),
      /belongs to the plan repository/,
    )
    assert.throws(
      () => parseSubject(`example/${role} atx: record the marker`, "plan"),
      /carries no capability tag/,
    )
  }
})

test("disprove names an attached or detached user ruling only in the plan repository", () => {
  for (const sentence of [
    "example-plan-audit round 2 finding 3",
    "example-plan-audit round 2 vet finding 3",
    "example-plan-audit by gpt-5.6-sol xhigh",
  ]) {
    assert.deepEqual(parseSubject(`example/disprove: ${sentence}`, "plan"), {
      class: "P4",
      form: { stem: "example", role: "disprove", scope: null },
      tag: null,
      burden: null,
      severity: null,
      kind: null,
      sentence,
    })
    assert.throws(
      () => parseSubject(`example/disprove: ${sentence}`, "repo-edu"),
      /belongs to the plan repository/,
    )
  }
  assert.throws(
    () =>
      parseSubject(
        "example/disprove: example-plan-audit round 0 finding 1",
        "plan",
      ),
    /round <n> \[vet\] finding <n>/,
  )
  assert.throws(
    () =>
      parseSubject(
        "example/disprove: example-plan-audit by gpt-5.6-sol",
        "plan",
      ),
    /by <model> <effort>/,
  )
})

const refusals: [Repository, string, RegExp][] = [
  // The tag.
  ["repo-edu", "c1 docs(repo): s", /capability tag/],
  ["repo-edu", "adx c1 docs(repo): s", /capability tag/],
  ["repo-edu", "docs(repo): s", /capability tag/],
  ["plan", "example/plan-audit C1: s", /capability tag/],
  // The colon and the sentence.
  ["repo-edu", "atx growth-none c1 docs(repo) s", /colon/],
  ["repo-edu", "atx growth-none c1 docs(repo):", /sentence/],
  ["repo-edu", "atx  c1 docs(repo): s", /single spaces/],
  // The order of the slots.
  ["repo-edu", "c1 atx docs(repo): s", /capability tag/],
  ["repo-edu", "atx c1 growth-low docs(repo): s", /fits no slot/],
  ["repo-edu", "atx docs(repo) c1: s", /fits no slot/],
  // The sequence.
  ["repo-edu", "atx growth-none !c1 docs(repo): s", /opens with !/],
  ["repo-edu", "atx growth-none B1A1 docs(repo): s", /ascending/],
  ["repo-edu", "atx growth-none c1b1 docs(repo): s", /ascending/],
  ["repo-edu", "atx growth-none B01 docs(repo): s", /fits no slot/],
  ["repo-edu", "atx B1c1 B2 docs(repo): s", /fits no slot/],
  ["repo-edu", "atx docs(repo): s", /carries a severity sequence/],
  ["repo-edu", "atx clean docs(repo): s", /never clean/],
  ["plan", "atm clean docs(claude): s", /never clean/],
  // A growth or pruning mark needs a sequence beside it, in either repo.
  ["repo-edu", "example/impl-3 atx growth-low feat(x): s", /beside a severity/],
  [
    "repo-edu",
    "example/impl-audit-1 atx growth-low clean: s",
    /beside a severity/,
  ],
  ["plan", "example/plan-audit atx growth-low clean: s", /beside a severity/],
  ["plan", "atx growth-low docs(claude): s", /beside a severity/],
  [
    "repo-edu",
    "example/impl-audit-1 atx growth-low B1: s",
    /no growth or pruning mark/,
  ],
  // Every other sequence carries a mark, and the floor has no direction.
  ["repo-edu", "atx c1 docs(repo): s", /carries a growth or pruning mark/],
  ["plan", "example/plan-audit atx B1: s", /carries a growth or pruning mark/],
  ["plan", "atx c1 docs(claude): s", /carries a growth or pruning mark/],
  ["repo-edu", "atx pruning-none c1 docs(repo): s", /write growth-none/],
  // The kind.
  ["repo-edu", "atx growth-none c1 update(repo): s", /not on the list/],
  ["repo-edu", "atx growth-none c1 docs(Repo): s", /fits no slot/],
  ["repo-edu", "atx c1 docs: s", /fits no slot/],
  // The roles and where they belong.
  ["repo-edu", "example/init atx: s", /belongs to the plan/],
  ["repo-edu", "example/plan-audit atx B1: s", /belongs to the plan/],
  ["repo-edu", "example/ready atx: s", /belongs to the plan/],
  ["plan", "example/plan-audit atx: s", /needs a severity/],
  [
    "plan",
    "example/plan-audit atx growth-none B1 docs(x): s",
    /no conventional kind/,
  ],
  ["plan", "example/init atx docs(x): s", /nothing after its tag/],
  // A chat's plan-file commit takes an off-plan plan-repo commit's slots
  // without its kind.
  ["repo-edu", "example/chat atx: s", /belongs to the plan/],
  ["repo-edu", "example/chat atx growth-none c1: s", /belongs to the plan/],
  ["plan", "example/chat: s", /capability tag/],
  ["plan", "example/chat atx docs(plan): s", /no conventional kind/],
  [
    "plan",
    "example/chat atx growth-none c1 docs(plan): s",
    /no conventional kind/,
  ],
  ["plan", "example/chat atx clean: s", /never clean/],
  ["plan", "example/chat atx c1: s", /carries a growth or pruning mark/],
  ["plan", "example/chat atx growth-low: s", /beside a severity/],
  ["plan", "example/closed atx B1: s", /nothing after its tag/],
  ["repo-edu", "example/implemented atx c1: s", /nothing after its tag/],
  [
    "repo-edu",
    "example/impl-3 atx growth-none c1 feat(x): s",
    /step subject carries no severity/,
  ],
  ["repo-edu", "example/impl-3 atx: s", /needs a conventional kind/],
  ["repo-edu", "example/impl-audit-1 atx feat(x): s", /needs a severity/],
  [
    "repo-edu",
    "example/impl-audit-1 atx clean feat(x): s",
    /clean record carries no kind/,
  ],
  ["repo-edu", "example/impl-audit-1 atx: s", /needs a severity/],
  [
    "repo-edu",
    "example/impl-audit-all atx growth-none c1 fix(x): s",
    /step scope/,
  ],
  [
    "repo-edu",
    "example/impl-audit-0 atx growth-none c1 fix(x): s",
    /step scope/,
  ],
  [
    "repo-edu",
    "example/impl-audit-3-2x atx growth-none c1 fix(x): s",
    /step scope/,
  ],
  ["repo-edu", "example/impl-0 atx fix(x): s", /step/],
  ["repo-edu", "example/impl-all atx fix(x): s", /step/],
  ["repo-edu", "example/deploy atx: s", /role deploy/],
  ["repo-edu", "/impl-3 atx fix(x): s", /empty stem/],
  // A commit audit's record and its series label.
  ["repo-edu", "example/commit-audit atx clean: s", /series label example/],
  [
    "repo-edu",
    "commit-80483/commit-audit atx clean: s",
    /series label commit-80483/,
  ],
  [
    "plan",
    "commit-8048339f/commit-audit atx clean: s",
    /series label commit-8048339f/,
  ],
  [
    "repo-edu",
    "commit-80483A/commit-audit atx clean: s",
    /series label commit-80483A/,
  ],
  [
    "repo-edu",
    "commit-733686..d081b7+8d6f95+2de91d/commit-audit atx clean: s",
    /series label/,
  ],
  ["repo-edu", "commit-804833/commit-audit clean: s", /capability tag/],
  ["repo-edu", "commit-804833/commit-audit atx: s", /needs a severity/],
  ["repo-edu", "commit-804833/commit-audit atx docs(x): s", /needs a severity/],
  [
    "plan",
    "commit-804833/commit-audit atx clean docs(x): s",
    /clean record carries no kind/,
  ],
  [
    "repo-edu",
    "commit-804833/commit-audit atx B1: s",
    /conventional kind after its severity sequence/,
  ],
  [
    "repo-edu",
    "commit-804833/commit-audit atx c1 docs(x): s",
    /carries a growth or pruning mark/,
  ],
  [
    "plan",
    "commit-804833/commit-audit atx growth-none clean: s",
    /beside a severity/,
  ],
  // A move-list series' forms and their label.
  ["plan", "example/design abx: s", /series label example/],
  ["plan", "split-a/b.ts/design abx: s", /role b.ts\/design/],
  ["plan", "split-b%2f.ts-868d9/design abx: s", /series label/],
  ["plan", "split-b.ts/design abx: s", /series label/],
  ["plan", "split-b.ts-868D9/design abx: s", /series label/],
  ["plan", "split-a+b.ts-868d9/design abx: s", /series label/],
  ["repo-edu", "split-b.ts-868d9/design abx: s", /belongs to the plan/],
  ["plan", "split-b.ts-868d9/design: s", /capability tag/],
  ["plan", "split-b.ts-868d9/design abx docs(x): s", /nothing after its tag/],
  [
    "repo-edu",
    "split-b.ts-868d9/split-audit abx clean: s",
    /belongs to the plan/,
  ],
  ["plan", "split-b.ts-868d9/split-audit abx: s", /needs a severity/],
  [
    "plan",
    "split-b.ts-868d9/split-audit abx growth-none b1 docs(x): s",
    /no conventional kind/,
  ],
  ["plan", "split-b.ts-868d9/split-audit abx b1: s", /growth or pruning mark/],
  [
    "plan",
    "split-b.ts-868d9/split abx refactor(x): s",
    /belongs to the Repo Edu/,
  ],
  [
    "repo-edu",
    "split-b.ts-868d9/split abx growth-none c1 refactor(x): s",
    /split subject carries no severity/,
  ],
  ["repo-edu", "split-b.ts-868d9/split abx: s", /needs a conventional kind/],
]

test("the parser refuses what the grammar refuses and names the slot", () => {
  for (const [repository, subject, message] of refusals)
    assert.throws(
      () => parseSubject(subject, repository),
      (error: unknown) =>
        error instanceof SubjectError && message.test(error.message),
      `${repository}: ${subject}`,
    )
})

test("the loose form read reaches subjects older than the settled grammar", () => {
  assert.deepEqual(
    planForm("desktop-application-architecture/impl-23: docs(desktop): x"),
    {
      stem: "desktop-application-architecture",
      role: "impl-23",
    },
  )
  assert.deepEqual(
    planForm(
      "implementation-audit-rounds-ts/impl-audit-all/C4D1: fix(audit-round): x",
    ),
    {
      stem: "implementation-audit-rounds-ts",
      role: "impl-audit-all/C4D1",
    },
  )
  assert.equal(planForm("abx growth-none c1 fix(repo): x"), null)
  assert.equal(planForm("/impl-3 abx fix(repo): x"), null)
  assert.equal(looseRole("/impl-3 abx fix(repo): x"), null)
  assert.equal(
    looseRole("example/impl-audit-2-3 abx clean: x"),
    "impl-audit-2-3",
  )
  assert.equal(isAuditRole("plan-audit"), true)
  assert.equal(isAuditRole("audit"), false)
  assert.equal(isAuditRole("impl-audit-2-3"), true)
  assert.equal(isAuditRole("impl-audit-all/C4D1"), true)
  assert.equal(isAuditRole("commit-audit"), true)
  assert.equal(isAuditRole("impl-3"), false)
  assert.equal(isAuditRole("audit-x"), false)
})

test("the role, not the label's spelling, tells a series form from a plan form", () => {
  // A commit audit's record names no plan, so no reader that groups commits by
  // plan meets its label, while the hook still reads its role.
  for (const record of [
    "commit-804833/commit-audit abx pruning-low c3 docs(audit-round): x",
    "commit-83bde0+3095d1/commit-audit obx clean: x",
    "anything/commit-audit abx clean: x",
  ]) {
    assert.equal(planForm(record), null, record)
    assert.equal(looseRole(record), "commit-audit", record)
  }
  // A plan whose stem looks like a series label keeps its plan forms.
  for (const role of ["impl-2", "plan-audit", "ready"])
    assert.deepEqual(planForm(`commit-804833/${role} abx: x`), {
      stem: "commit-804833",
      role,
    })
  assert.equal(
    parseSubject("commit-804833/impl-audit-1 abx clean: x", "repo-edu").class,
    "I4",
  )
})

test("a chat's form names its plan for the reader while no plan reader counts it", () => {
  assert.deepEqual(
    parseSubject(
      "source-file-split/chat atx growth-low b1: keep three constraints",
      "plan",
    ),
    {
      class: "P5",
      form: { stem: "source-file-split", role: "chat", scope: null },
      tag: { vendor: "a", tier: "t", effort: "x" },
      burden: { direction: "growth", level: "low" },
      severity: {
        ordinary: false,
        upper: [],
        lower: [{ tier: "b", count: 1 }],
      },
      kind: null,
      sentence: "keep three constraints",
    },
  )
  assert.equal(
    parseSubject("source-file-split/chat atx: reopen the plan", "plan").class,
    "P5",
  )
  // No reader that groups commits by plan counts a chat's edit as the plan's
  // own, while the hook still reads its role. A reader that needs the edit
  // finds it by the plan file's path, as it finds an off-plan one.
  const chat = "source-file-split/chat atx: reopen the plan"
  assert.equal(planForm(chat), null)
  assert.equal(looseRole(chat), "chat")
  assert.equal(seriesLabel(chat), null)
  assert.equal(isAuditRole("chat"), false)
})

test("a commit round reads its records by their series label and writes that label itself", () => {
  assert.equal(
    seriesLabel("commit-83bde0+3095d1/commit-audit obx clean: x"),
    "commit-83bde0+3095d1",
  )
  for (const other of [
    "commit-804833/impl-2 abx feat(x): x",
    "example/impl-audit-1 abx clean: x",
    "abx growth-none c1 fix(repo): x",
  ])
    assert.equal(seriesLabel(other), null, other)
  for (const subject of [
    "abx growth-none c1 fix(repo): x",
    "commit-733686..d081b7/commit-audit abx growth-none c1 fix(repo): x",
    "example/impl-audit-1 abx growth-none c1 fix(repo): x",
  ])
    assert.equal(
      withSeriesForm(subject, "commit-804833"),
      "commit-804833/commit-audit abx growth-none c1 fix(repo): x",
      subject,
    )
})

test("a move-list series' forms open with its label and name no plan", () => {
  const label = "split-roster.ts-58b58"
  assert.deepEqual(parseSubject(`${label}/design abx: s`, "plan"), {
    class: "S1",
    form: { series: label, role: "design" },
    tag: { vendor: "a", tier: "b", effort: "x" },
    burden: null,
    severity: null,
    kind: null,
    sentence: "s",
  })
  assert.deepEqual(
    parseSubject(`${label}/split-audit obx growth-none b1c1: s`, "plan"),
    {
      class: "S2",
      form: { series: label, role: "split-audit" },
      tag: { vendor: "o", tier: "b", effort: "x" },
      burden: { direction: "growth", level: "none" },
      severity: {
        ordinary: false,
        upper: [],
        lower: [
          { tier: "b", count: 1 },
          { tier: "c", count: 1 },
        ],
      },
      kind: null,
      sentence: "s",
    },
  )
  assert.equal(
    parseSubject(`${label}/split-audit obx clean: s`, "plan").class,
    "S2",
  )
  assert.deepEqual(
    parseSubject(`${label}/split abx refactor(pkg-domain): s`, "repo-edu"),
    {
      class: "S3",
      form: { series: label, role: "split" },
      tag: { vendor: "a", tier: "b", effort: "x" },
      burden: null,
      severity: null,
      kind: { conventional: "refactor", scope: "pkg-domain" },
      sentence: "s",
    },
  )
  // A percent-encoded name keeps the label one token.
  assert.equal(
    parseSubject("split-c%25d.ts-977a1/design abx: s", "plan").class,
    "S1",
  )
  for (const role of ["design", "split-audit", "split"]) {
    const subject = `${label}/${role} abx: s`
    assert.equal(planForm(subject), null, role)
    assert.equal(looseRole(subject), role, role)
    assert.deepEqual(seriesForm(subject), { label, role }, role)
    assert.equal(isAuditRole(role), role === "split-audit", role)
  }
  assert.equal(seriesForm("example/impl-2 abx feat(x): x"), null)
  assert.equal(seriesLabel(`${label}/split-audit obx clean: x`), label)
  assert.equal(seriesLabel(`${label}/design abx: x`), null)
  assert.equal(seriesLabel(`${label}/split abx refactor(x): x`), null)
  assert.equal(
    withSeriesForm("example/plan-audit abx growth-none b1: x", label),
    `${label}/split-audit abx growth-none b1: x`,
  )
  assert.equal(
    withSeriesForm("abx clean: x", label),
    `${label}/split-audit abx clean: x`,
  )
})
