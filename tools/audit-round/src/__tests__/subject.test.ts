import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  isAuditRole,
  looseForm,
  parseSubject,
  type Repository,
  type SubjectClass,
  SubjectError,
  stemTopic,
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
  const section = text.slice(text.indexOf("## Examples"))
  const found: Example[] = []
  for (const [, heading, block] of section.matchAll(
    /\n(Plan repo|Repo Edu):\n\n```text\n([\s\S]*?)```/g,
  )) {
    const repository: Repository = heading === "Plan repo" ? "plan" : "repo-edu"
    for (const line of block.split("\n").filter((line) => line.length > 0)) {
      const match = /^([PIO]\d)(?: plan| Repo Edu)?\s+(.+)$/.exec(line)
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

test("every example in the subject grammar parses under the class it names", async () => {
  const lines = await examples()
  assert.ok(lines.length >= 19)
  for (const { repository, class: expected, subject } of lines)
    assert.equal(
      parseSubject(`${subject} the sentence`, repository).class,
      expected,
      subject,
    )
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
      growth: { direction: "pruning", level: "high" },
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
  // The sentence may hold colons of its own; only the first tag-ending colon splits.
  assert.equal(
    parseSubject("atx c1 docs(repo): note: keep the colon", "repo-edu")
      .sentence,
    "note: keep the colon",
  )
})

const refusals: [Repository, string, RegExp][] = [
  // The tag.
  ["repo-edu", "c1 docs(repo): s", /capability tag/],
  ["repo-edu", "adx c1 docs(repo): s", /capability tag/],
  ["repo-edu", "docs(repo): s", /capability tag/],
  ["plan", "example/audit C1: s", /capability tag/],
  // The colon and the sentence.
  ["repo-edu", "atx c1 docs(repo) s", /colon/],
  ["repo-edu", "atx c1 docs(repo):", /sentence/],
  ["repo-edu", "atx  c1 docs(repo): s", /single spaces/],
  // The order of the slots.
  ["repo-edu", "c1 atx docs(repo): s", /capability tag/],
  ["repo-edu", "atx c1 growth-low docs(repo): s", /fits no slot/],
  ["repo-edu", "atx docs(repo) c1: s", /fits no slot/],
  // The sequence.
  ["repo-edu", "atx !c1 docs(repo): s", /opens with !/],
  ["repo-edu", "atx B1A1 docs(repo): s", /ascending/],
  ["repo-edu", "atx c1b1 docs(repo): s", /ascending/],
  ["repo-edu", "atx B01 docs(repo): s", /fits no slot/],
  ["repo-edu", "atx B1c1 B2 docs(repo): s", /fits no slot/],
  ["repo-edu", "atx docs(repo): s", /carries a severity sequence/],
  ["repo-edu", "atx clean docs(repo): s", /never clean/],
  ["plan", "atm clean docs(claude): s", /never clean/],
  // Repo Edu marks never reach the plan repo.
  ["plan", "atx c1 docs(claude): s", /bare/],
  ["plan", "atx !B1 docs(claude): s", /bare/],
  ["plan", "atx growth-low B1 docs(claude): s", /never appears in the plan/],
  ["plan", "example/audit atx growth-low B1: s", /never appears in the plan/],
  ["plan", "example/impl-audit-all atx B1c1 docs(vet): s", /bare/],
  // A growth mark needs a marked sequence beside it.
  ["repo-edu", "example/impl-3 atx growth-low feat(x): s", /marked sequence/],
  [
    "repo-edu",
    "example/impl-audit-all atx growth-low clean: s",
    /marked sequence/,
  ],
  ["repo-edu", "example/impl-audit-all atx growth-low B1: s", /no growth mark/],
  // The kind.
  ["repo-edu", "atx c1 update(repo): s", /not on the list/],
  ["repo-edu", "atx c1 docs(Repo): s", /fits no slot/],
  ["repo-edu", "atx c1 docs: s", /fits no slot/],
  // The roles and where they belong.
  ["repo-edu", "example/init atx: s", /belongs to the plan/],
  ["repo-edu", "example/audit atx B1: s", /belongs to the plan/],
  ["repo-edu", "example/ready atx: s", /belongs to the plan/],
  ["plan", "example/audit atx: s", /needs a severity/],
  ["plan", "example/audit atx B1 docs(x): s", /no conventional kind/],
  ["plan", "example/init atx docs(x): s", /nothing after its tag/],
  ["plan", "example/closed atx B1: s", /nothing after its tag/],
  ["repo-edu", "example/implemented atx c1: s", /nothing after its tag/],
  [
    "repo-edu",
    "example/impl-3 atx c1 feat(x): s",
    /step subject carries no severity/,
  ],
  ["repo-edu", "example/impl-3 atx: s", /needs a conventional kind/],
  ["repo-edu", "example/impl-audit-all atx feat(x): s", /needs a severity/],
  [
    "repo-edu",
    "example/impl-audit-all atx clean feat(x): s",
    /clean record carries no kind/,
  ],
  ["repo-edu", "example/impl-audit-all atx: s", /needs a severity/],
  ["repo-edu", "example/impl-audit-0 atx c1 fix(x): s", /audit scope/],
  ["repo-edu", "example/impl-audit-3-2x atx c1 fix(x): s", /audit scope/],
  ["repo-edu", "example/impl-0 atx fix(x): s", /step/],
  ["repo-edu", "example/impl-all atx fix(x): s", /step/],
  ["repo-edu", "example/deploy atx: s", /role deploy/],
  ["repo-edu", "/impl-3 atx fix(x): s", /empty stem/],
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
    looseForm("desktop-application-architecture/impl-23: docs(desktop): x"),
    {
      stem: "desktop-application-architecture",
      role: "impl-23",
    },
  )
  assert.deepEqual(
    looseForm(
      "implementation-audit-rounds-ts/impl-audit-all/C4D1: fix(audit-round): x",
    ),
    {
      stem: "implementation-audit-rounds-ts",
      role: "impl-audit-all/C4D1",
    },
  )
  assert.equal(looseForm("abx c1 fix(repo): x"), null)
  assert.equal(looseForm("/impl-3 abx fix(repo): x"), null)
  assert.equal(stemTopic("plan-lexer"), "lexer")
  assert.equal(stemTopic("topology-lexer"), "lexer")
  assert.equal(stemTopic("lexer"), "lexer")
  assert.equal(isAuditRole("audit"), true)
  assert.equal(isAuditRole("impl-audit-2-3"), true)
  assert.equal(isAuditRole("impl-audit-all/C4D1"), true)
  assert.equal(isAuditRole("impl-3"), false)
  assert.equal(isAuditRole("audit-x"), false)
})
