import assert from "node:assert/strict"
import { test } from "node:test"
import { correctionAreas, readFindings } from "../findings.js"
import { findingSequence, printSequence } from "../sequence.js"
import { parseSubject } from "../subject.js"

const strict = {
  strict: true,
  areaKinds: new Map([
    ["area-a", "partition"],
    ["area-b", "partition"],
    ["cover-x", "cover"],
    ["cover-y", "cover"],
  ]),
  role: "audit",
} as const
const rating = "[growth:none] [reach:developer] [complexity:none]"

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
          ? `- [${tier}] [area:area-a] [growth:none] [reach:${reach}] [complexity:none] Concern.`
          : `- ${tier} [field:missing] [section:decisions] [growth:none] [reach:${reach}] [complexity:none] Concern.`,
      )
      .join("\n")
    const findings = readFindings(body, repository, strict)
    assert.equal(findings.length, 6)
    assert.equal(
      printSequence(findingSequence(findings, repository)),
      repository === "repo-edu" ? "!B1C2a1d2" : "A1B1C2D2",
    )
    assert.equal(printSequence(findingSequence([], repository)), "clean")
  }
  const rare = readFindings(
    `- [D] [area:area-a] ${rating.replace("developer", "very-rare")} Wording.`,
    "repo-edu",
    strict,
  )
  assert.equal(printSequence(findingSequence(rare, "repo-edu")), "D1")
})

test("strict reads require each token and name the offending bullet", () => {
  const valid = `- [C] [area:area-a] ${rating} Correct the record.`
  for (const [body, reason] of [
    ["- [C]", /needs location/],
    [valid.replace("[area:area-a] ", ""), /location/],
    [valid.replace("area-a", "Area A"), /location/],
    [valid.replace("area-a", "retired-area"), /unknown primary area/],
    [valid.replace("[area:area-a]", "[area:area-a] [area:area-b]"), /location/],
    [
      valid.replace("[area:area-a]", "[area:area-a] [plan:elsewhere]"),
      /location/,
    ],
    [
      valid.replace("[area:area-a]", "[area:area-a] [section:elsewhere]"),
      /location/,
    ],
    ...["growth", "reach", "complexity"].flatMap((key) => [
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
    [valid.replace("growth:none", "growth:bad label"), /invalid \[growth/],
    [valid.replace(" Correct the record.", ""), /followed by prose/],
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
          `- C ${field}[section:decisions] ${rating} Correct.`,
          "plan",
          strict,
        ),
      /field/,
    )
  }
  const plan = `- C [field:missing] [section:decisions] ${rating} Correct.`
  for (const key of ["section", "growth", "reach", "complexity"]) {
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
      `[area:area-a] ${rating} Missing space.`,
      "Prose without tokens.",
    ]) {
      assert.throws(
        () =>
          readFindings(
            `- [C] [area:area-a] ${rating} Valid.\n- [${tier}]${remainder}`,
            "repo-edu",
            strict,
          ),
        /finding bullet on body line 2.*needs location/,
      )
    }
  }
})

test("strict reads check every area and cover ID against its model kind", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const opening = repository === "repo-edu" ? "- [C]" : "- C [field:missing]"
    const valid = `${opening} [area:area-a] [cover:cover-x] [cover:cover-y] ${rating} Correct.`
    assert.equal(readFindings(valid, repository, strict).length, 1)
    for (const [from, to, reason] of [
      ["area:area-a", "area:retired-area", /unknown primary area/],
      ["area:area-a", "area:cover-x", /unknown primary area/],
      ["cover:cover-y", "cover:retired-cover", /unknown cover area/],
      ["cover:cover-y", "cover:area-a", /unknown cover area/],
    ] as const) {
      assert.throws(
        () => readFindings(valid.replace(from, to), repository, strict),
        reason,
      )
    }
  }
})

test("deferred findings retain ratings but contribute no local corrections", () => {
  for (const repository of ["repo-edu", "plan"] as const) {
    const body =
      repository === "repo-edu"
        ? `- [B] [plan:../plan/example.md#decisions] ${rating} Defer.\n- [C] [area:area-a] [cover:cover-x] ${rating} Correct.`
        : `- B [field:excess] [area:area-a] ${rating} Defer.\n- C [field:missing] [section:decisions] ${rating} Correct.`
    const findings = readFindings(body, repository, strict)
    assert.equal(findings[0].deferred, true)
    assert.equal(findings[0].reach, "developer")
    assert.equal(findings[1].deferred, false)
    const sequence = printSequence(findingSequence(findings, repository))
    const subject = parseSubject(
      `example/impl-audit-all oth ${sequence} fix(x): correction`,
      repository,
    )
    assert.deepEqual(
      [...correctionAreas(subject, body, repository)],
      repository === "repo-edu" ? ["area:area-a"] : ["section:decisions"],
    )
  }
})

test("historical reads keep A-C counts without ratings, including retired areas", () => {
  const subject = parseSubject(
    "oth C1c1d1 fix(x): correct the record",
    "repo-edu",
  )
  const body =
    "- [C] [area:retired-area] First.\n- [C] [area:retired-area] Second.\n- [D] Wording."
  assert.deepEqual(
    [...correctionAreas(subject, body, "repo-edu")],
    ["area:retired-area"],
  )
  assert.throws(
    () => correctionAreas(subject, "- [C] [area:area-a] Only one.", "repo-edu"),
    /tier-and-location/,
  )
  assert.throws(
    () =>
      correctionAreas(
        subject,
        "- [C] [area:area-a] [area:area-b] Ambiguous.",
        "repo-edu",
      ),
    /location/,
  )
  const plan = parseSubject("example/audit oth C2: correct and defer", "plan")
  assert.deepEqual(
    [
      ...correctionAreas(
        plan,
        "- C [section:decisions] Correct.\n- C [area:area-a] Defer.",
        "plan",
      ),
    ],
    ["section:decisions"],
  )
  const deferral = parseSubject(
    "example/impl-audit-all oth B1: defer",
    "repo-edu",
  )
  assert.deepEqual(
    [...correctionAreas(deferral, "- [B] [plan:other] Defer.", "repo-edu")],
    [],
  )
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
