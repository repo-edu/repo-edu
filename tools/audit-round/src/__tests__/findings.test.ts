import assert from "node:assert/strict"
import { test } from "node:test"
import areaModel from "../../../architecture-check/src/area-model.json" with {
  type: "json",
}
import { readFindings } from "../findings.js"
import { findingSequence, printSequence } from "../sequence.js"
import { roundGrammarExamples } from "./round-grammar.js"

const strict = "plan-audit"
const rating = "[growth-pattern:none] [reach:developer] [complexity:none]"

test("the round grammar's record-bullet examples are parser fixtures", () => {
  for (const example of roundGrammarExamples("record/")) {
    assert.equal(example.outcome, "parsed", example.id)
    const repository = example.id.startsWith("record/repo-edu")
      ? "repo-edu"
      : "plan"
    const role =
      example.id === "record/plan-audit" ? "plan-audit" : "impl-audit-1"
    assert.equal(
      readFindings(example.source, repository, role).length,
      1,
      example.id,
    )
  }
})

test("the round grammar's area tokens use current area IDs", () => {
  const areaKinds = new Map(areaModel.areas.map((area) => [area.id, area.kind]))
  const examples = roundGrammarExamples().filter(
    (example) =>
      example.id.startsWith("report/") || example.id.startsWith("record/"),
  )
  for (const example of examples) {
    for (const match of example.source.matchAll(/\[(area|cover):([^\]]+)\]/g)) {
      const [, token, id] = match
      assert.equal(
        areaKinds.get(id),
        token === "area" ? "partition" : "cover",
        `${example.id} [${token}:${id}]`,
      )
    }
  }
})

test("both bullet forms derive sorted tier counts, all reach cases and D findings", () => {
  const cases = [
    ["D", "developer"],
    ["C", "rare"],
    ["A", "developer"],
    ["B", "ordinary"],
    ["C", "very-rare"],
    ["D", "developer"],
  ]
  for (const repository of ["repo-edu", "plan"] as const) {
    const body = cases
      .map(([tier, reach]) =>
        repository === "repo-edu"
          ? `- [${tier}] [area:area-a] [growth-pattern:none] [reach:${reach}] [complexity:none] Concern: Explanation.`
          : `- ${tier} [field:missing] [section:decisions] [growth-pattern:none] [reach:${reach}] [complexity:none] Concern: Explanation.`,
      )
      .join("\n")
    const findings = readFindings(body, repository, strict)
    assert.equal(findings.length, 6)
    assert.equal(printSequence(findingSequence(findings)), "!B1C2a1d2")
    assert.equal(printSequence(findingSequence([])), "clean")
  }
  const rare = readFindings(
    `- [D] [area:area-a] ${rating.replace("developer", "very-rare")} Wording: Explanation.`,
    "repo-edu",
    strict,
  )
  assert.equal(printSequence(findingSequence(rare)), "D1")
})

test("strict reads require each token and name the offending bullet", () => {
  const valid = `- [C] [area:area-a] ${rating} Correct: the record.`
  for (const [body, reason] of [
    ["- [C]", /needs location/],
    [valid.replace("[area:area-a] ", ""), /location/],
    [valid.replace("area-a", "Area A"), /location/],
    [valid.replace("[area:area-a]", "[area:area-a] [area:area-b]"), /location/],
    [
      valid.replace("[area:area-a]", "[area:area-a] [plan:elsewhere]"),
      /location/,
    ],
    [
      valid.replace("[area:area-a]", "[area:area-a] [section:elsewhere]"),
      /location/,
    ],
    ...["growth-pattern", "reach", "complexity"].flatMap((key) => [
      [valid.replace(new RegExp(`\\[${key}:[^\\]]+\\] `), ""), new RegExp(key)],
      [valid.replace(" Correct", ` [${key}:none] Correct`), new RegExp(key)],
    ]),
    [valid.replace("reach:developer", "reach:none"), /invalid \[reach/],
    [valid.replace(" Correct", " [reach:] Correct"), /reach/],
    [valid.replace(" Correct", " [area:] Correct"), /location/],
    [valid.replace("area:area-a", "plan: "), /location/],
    [
      valid.replace("complexity:none", "complexity:state"),
      /invalid \[complexity/,
    ],
    [
      valid.replace("growth-pattern:none", "growth-pattern:bad label"),
      /invalid \[growth/,
    ],
    [valid.replace(" Correct: the record.", ""), /followed by prose/],
    [valid.replace("Correct: the", "Correct the"), /Title: prose/],
    [valid.replace("Correct: the", ": the"), /Title: prose/],
    [valid.replace("Correct: the record.", "Correct: "), /Title: prose/],
    [valid.replace("[C]", "[D]").replace("[reach:developer] ", ""), /reach/],
  ] as const) {
    assert.throws(
      () => readFindings(`Model\n${body}`, "repo-edu", strict),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /finding bullet on body line 2/)
        assert.match(error.message, reason as RegExp)
        return true
      },
    )
  }
  for (const field of [
    "",
    "[field:other] ",
    "[field:missing] [field:excess] ",
  ]) {
    assert.throws(
      () =>
        readFindings(
          `- C ${field}[section:decisions] ${rating} Correct: it.`,
          "plan",
          strict,
        ),
      /field/,
    )
  }
  const plan = `- C [field:missing] [section:decisions] ${rating} Correct: it.`
  for (const key of ["section", "growth-pattern", "reach", "complexity"]) {
    assert.throws(
      () =>
        readFindings(
          plan.replace(new RegExp(`\\[${key}:[^\\]]+\\] `), ""),
          "plan",
          strict,
        ),
      key === "section" ? /location/ : new RegExp(key),
    )
  }
})

test("a Repo Edu tier opening cannot hide a finding as prose", () => {
  for (const tier of ["A", "B", "C", "D"]) {
    for (const remainder of [
      `[area:area-a] ${rating} Missing: space.`,
      "Prose without tokens.",
    ]) {
      assert.throws(
        () =>
          readFindings(
            `- [C] [area:area-a] ${rating} Valid: bullet.\n- [${tier}]${remainder}`,
            "repo-edu",
            strict,
          ),
        /finding bullet on body line 2.*needs location/,
      )
    }
  }
})

test("strict reads retain retired area and cover IDs without consulting the model", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const opening = repository === "repo-edu" ? "- [C]" : "- C [field:missing]"
    const valid = `${opening} [area:area-a] [cover:cover-x] [cover:cover-y] ${rating} Correct: it.`
    assert.equal(readFindings(valid, repository, strict).length, 1)
    for (const [from, to] of [
      ["area:area-a", "area:retired-area"],
      ["area:area-a", "area:cover-x"],
      ["cover:cover-y", "cover:retired-cover"],
      ["cover:cover-y", "cover:area-a"],
    ] as const) {
      const findings = readFindings(valid.replace(from, to), repository, strict)
      assert.equal(findings.length, 1, to)
    }
  }
})

test("deferred findings retain ratings but contribute no local corrections", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const body =
      repository === "repo-edu"
        ? `- [B] [plan:../plan/example.md#decisions] ${rating} Defer: it.\n- [C] [area:area-a] [cover:cover-x] ${rating} Correct: it.`
        : `- B [field:excess] [area:area-a] ${rating} Defer: it.\n- C [field:missing] [section:decisions] ${rating} Correct: it.`
    const findings = readFindings(body, repository, strict)
    assert.equal(findings[0].title, "Defer")
    assert.equal(findings[0].deferred, true)
    assert.equal(findings[0].reach, "developer")
    assert.equal(findings[1].deferred, false)
  }
})

test("old bullets without ratings are unreadable under the one current form", () => {
  const body =
    "- [C] [area:retired-area] First.\n- [C] [area:retired-area] Second.\n- [D] Wording."
  assert.throws(() => readFindings(body, "repo-edu", null), /growth/)
})

test("ungraded prose and the other repository's bullet opening are not findings", () => {
  const body =
    "Model\n\n- A decision.\n- [Note] Explanation.\n- Ordinary prose."
  assert.deepEqual(readFindings(body, "repo-edu", strict), [])
  assert.deepEqual(readFindings(body, "plan", strict), [])
  for (const tier of ["A", "B", "C", "D"]) {
    assert.deepEqual(
      readFindings(`- ${tier} prose bullet.`, "plan", strict),
      [],
    )
  }
  assert.deepEqual(
    readFindings("- C Prose in the other form.", "repo-edu", strict),
    [],
  )
  assert.deepEqual(
    readFindings("- [C] Prose in the other form.", "plan", strict),
    [],
  )
})
