/**
 * The commit subject grammar, as `.agents/references/subject-grammar.md`
 * states it. That file is the normative shape; this module is its one reader
 * and the commit hooks of both repositories refuse what it refuses. A change
 * to the shape lands there, here and in the tests in one commit.
 */

/** Which repository's form a subject is read under. */
export type Repository = "repo-edu" | "plan"

export const roles = [
  "init",
  "audit",
  "settle",
  "ready",
  "impl",
  "impl-audit",
  "implemented",
  "closed",
] as const
export type RoleName = (typeof roles)[number]

/** `<form> ::= <stem>/<role>`, with the step or audit scope the role carries. */
export type Form = {
  readonly stem: string
  readonly role: RoleName
  /** `<n>` for a step, `<scope>` for an audit record, null for the other roles. */
  readonly scope: string | null
}

export type Tag = {
  readonly vendor: "a" | "o"
  readonly tier: "b" | "t" | "u"
  readonly effort: "l" | "m" | "h" | "x"
}

export type Growth = {
  readonly direction: "growth" | "pruning"
  readonly level: "low" | "medium" | "high"
}

export type TierLetter = "a" | "b" | "c" | "d"

/** One `<upper><n>` or `<lowercase><n>` pair of a sequence. */
export type Run = {
  readonly tier: TierLetter
  readonly count: number
}

/** `<sequence>`: the bare form is a marked one with no `!` and no lower run. */
export type Sequence = {
  /** The leading `!`, which says at least one concern has ordinary reach. */
  readonly ordinary: boolean
  readonly upper: readonly Run[]
  readonly lower: readonly Run[]
}

export type Severity = Sequence | "clean"

export const conventionalKinds = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
  "redesign",
] as const
export type ConventionalKind = (typeof conventionalKinds)[number]

export type Kind = {
  readonly conventional: ConventionalKind
  readonly scope: string
}

/** The subject classes the grammar names, one production each. */
export type SubjectClass =
  | "P1"
  | "P2"
  | "P3"
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "O1"
  | "O2"

export type Subject = {
  readonly class: SubjectClass
  readonly form: Form | null
  readonly tag: Tag
  readonly growth: Growth | null
  readonly severity: Severity | null
  readonly kind: Kind | null
  readonly sentence: string
}

export class SubjectError extends Error {}

const tagPattern = /^([ao])([btu])([lmhx])$/
const growthPattern = /^(growth|pruning)-(low|medium|high)$/
const sequencePattern =
  /^(!)?((?:[A-D](?:[1-9]\d*))+)?((?:[a-d](?:[1-9]\d*))+)?$/
// The hook replaces authored counts before strict sequence validation.
const authoredSeverityPattern = /^(?:clean|!?(?:[A-Da-d]\d+)+)$/
const runPattern = /([A-Da-d])([1-9]\d*)/g
const kindPattern = /^([a-z]+)\(([a-z0-9-]+)\)$/
const stepPattern = /^[1-9]\d*$/
const auditScopePattern = /^(?:[1-9]\d*|[1-9]\d*-[1-9]\d*|all)$/

function fail(message: string): never {
  throw new SubjectError(message)
}

function parseForm(token: string): Form {
  const slash = token.indexOf("/")
  const stem = token.slice(0, slash)
  const role = token.slice(slash + 1)
  if (stem.length === 0) fail(`the form ${token} has an empty stem`)
  if (role.startsWith("impl-audit-")) {
    const scope = role.slice("impl-audit-".length)
    if (!auditScopePattern.test(scope))
      fail(`the audit scope ${scope} is not <n>, <n>-<n> or all`)
    return { stem, role: "impl-audit", scope }
  }
  if (role.startsWith("impl-")) {
    const scope = role.slice("impl-".length)
    if (!stepPattern.test(scope)) fail(`the step ${scope} is not a number`)
    return { stem, role: "impl", scope }
  }
  const named = roles.find((name) => name === role)
  if (named === undefined || named === "impl" || named === "impl-audit")
    fail(`the role ${role} is not one the grammar names`)
  return { stem, role: named, scope: null }
}

function parseTag(token: string | undefined): Tag {
  const match = token === undefined ? null : tagPattern.exec(token)
  if (match === null)
    fail(
      `the subject needs a capability tag in place of ${token ?? "nothing"}, as atx`,
    )
  return {
    vendor: match[1] as Tag["vendor"],
    tier: match[2] as Tag["tier"],
    effort: match[3] as Tag["effort"],
  }
}

function parseGrowth(token: string): Growth | null {
  const match = growthPattern.exec(token)
  return match === null
    ? null
    : {
        direction: match[1] as Growth["direction"],
        level: match[2] as Growth["level"],
      }
}

function runs(text: string | undefined): Run[] {
  if (text === undefined) return []
  const found = [...text.matchAll(runPattern)].map((match) => ({
    tier: match[1].toLowerCase() as TierLetter,
    count: Number(match[2]),
  }))
  for (let at = 1; at < found.length; at += 1)
    if (found[at].tier <= found[at - 1].tier)
      fail(`the sequence ${text} does not list its tiers in ascending order`)
  return found
}

function parseSequence(token: string): Sequence | null {
  const match = sequencePattern.exec(token)
  if (match === null) return null
  const ordinary = match[1] === "!"
  const upper = runs(match[2])
  const lower = runs(match[3])
  if (upper.length === 0 && lower.length === 0) return null
  if (ordinary && upper.length === 0)
    fail(`the sequence ${token} opens with ! but names no uppercase tier`)
  return { ordinary, upper, lower }
}

function parseKind(token: string): Kind | null {
  const match = kindPattern.exec(token)
  if (match === null) return null
  const conventional = conventionalKinds.find((kind) => kind === match[1])
  if (conventional === undefined)
    fail(
      `the kind ${match[1]} is not on the list the grammar admits: ${conventionalKinds.join(", ")}`,
    )
  return { conventional, scope: match[2] }
}

function isBare(sequence: Sequence): boolean {
  return !sequence.ordinary && sequence.lower.length === 0
}

type Slots = Omit<Subject, "class">

/** The class whose production the filled slots match, or a refusal. */
function classify(slots: Slots, repository: Repository): SubjectClass {
  const { form, growth, severity, kind } = slots
  const sequence = severity === null || severity === "clean" ? null : severity
  const empty = growth === null && severity === null && kind === null
  const where =
    form === null
      ? "an off-plan subject"
      : `a subject with the ${form.role} role`
  if (growth !== null) {
    if (repository === "plan")
      fail("a growth mark never appears in the plan repository")
    if (sequence === null)
      fail("a growth mark appears only beside a marked sequence")
  }
  if (sequence !== null && repository === "plan" && !isBare(sequence))
    fail(
      "a plan-repository sequence is bare: no leading ! and no lowercase tiers",
    )
  if (form === null) {
    if (kind === null) fail(`${where} needs a conventional kind`)
    if (severity === "clean")
      fail(`${where} carries a severity sequence or nothing, never clean`)
    if (repository === "plan") return "O2"
    if (sequence === null)
      fail(`${where} in Repo Edu carries a severity sequence`)
    return "O1"
  }
  switch (form.role) {
    case "init":
    case "settle":
    case "ready":
      if (repository !== "plan") fail(`${where} belongs to the plan repository`)
      if (!empty) fail(`${where} carries nothing after its tag`)
      return form.role === "init" ? "P1" : "P3"
    case "audit":
      if (repository !== "plan") fail(`${where} belongs to the plan repository`)
      if (severity === null) fail(`${where} needs a severity sequence or clean`)
      if (kind !== null) fail(`${where} carries no conventional kind`)
      return "P2"
    case "closed":
      if (!empty) fail(`${where} carries nothing after its tag`)
      return repository === "plan" ? "P3" : "I5"
    case "implemented":
      if (!empty) fail(`${where} carries nothing after its tag`)
      return "I5"
    case "impl":
      if (severity !== null) fail("a step subject carries no severity")
      if (kind === null) fail(`${where} needs a conventional kind`)
      return "I1"
    case "impl-audit":
      if (severity === null) fail(`${where} needs a severity sequence or clean`)
      if (kind !== null) {
        if (severity === "clean") fail("a clean record carries no kind")
        return "I2"
      }
      if (growth !== null)
        fail("a record without a kind carries no growth mark")
      return severity === "clean" ? "I4" : "I3"
  }
}

/** Locate the tag slots before the hook replaces severity or the parser validates them. */
export function locateSubjectSlots(line: string) {
  const tokens = line.split(" ")
  const colon = tokens.findIndex((token) => token.endsWith(":"))
  if (colon === -1) fail("the subject needs a colon after its last tag")
  const tags = tokens.slice(0, colon + 1)
  tags[colon] = tags[colon].slice(0, -1)
  const sentence = tokens.slice(colon + 1).join(" ")
  const tag = tags[0]?.includes("/") ? 1 : 0
  let at = tag + 1
  const growth = growthPattern.test(tags[at] ?? "") ? at++ : null
  const severity = at
  const hasSeverity = authoredSeverityPattern.test(tags[at] ?? "")
  if (hasSeverity) at += 1
  const kind = kindPattern.test(tags[at] ?? "") ? at++ : null
  return { tags, sentence, tag, growth, severity, hasSeverity, kind, end: at }
}

/**
 * Parse one subject line under the repository's form. Throws a `SubjectError`
 * naming the first slot that does not fit.
 */
export function parseSubject(line: string, repository: Repository): Subject {
  const located = locateSubjectSlots(line)
  const { tags, sentence } = located
  if (sentence.trim().length === 0) fail("the subject needs a sentence")
  if (tags.some((token) => token.length === 0))
    fail("the tags are separated by single spaces")
  const form = located.tag === 1 ? parseForm(tags[0]) : null
  const tag = parseTag(tags[located.tag])
  const growth =
    located.growth === null ? null : parseGrowth(tags[located.growth])
  const severity = located.hasSeverity
    ? tags[located.severity] === "clean"
      ? "clean"
      : parseSequence(tags[located.severity])
    : null
  if (located.hasSeverity && severity === null)
    fail(
      `the tag ${tags[located.severity]} fits no slot; the sequence is invalid`,
    )
  const kind = located.kind === null ? null : parseKind(tags[located.kind])
  if (located.end < tags.length)
    fail(
      `the tag ${tags[located.end]} fits no slot; the order is form, tag, growth, severity, kind`,
    )
  const slots: Slots = { form, tag, growth, severity, kind, sentence }
  return { class: classify(slots, repository), ...slots }
}

/** The topic a stem names, reading the historical `plan-` and `topology-` prefixes as one topic. */
export function stemTopic(stem: string): string {
  return stem.replace(/^(?:plan|topology)-/, "")
}

/** A form read loosely: the stem and the role token as written, unchecked. */
export type LooseForm = {
  readonly stem: string
  readonly role: string
}

/**
 * The form a subject opens with, read loosely: the first token split at its
 * first slash. This is the one read that reaches subjects older than the
 * settled grammar, because the form has kept its place through every revision
 * and episode scoping and auditor stamping need nothing else from it.
 */
export function looseForm(line: string): LooseForm | null {
  const first = (line.split(" ")[0] ?? "").replace(/:$/, "")
  const slash = first.indexOf("/")
  return slash > 0
    ? { stem: first.slice(0, slash), role: first.slice(slash + 1) }
    : null
}

/** Whether a loosely read role is an audit record's: a plan round or an implementation-audit round. */
export function isAuditRole(role: string): boolean {
  return role === "audit" || role.startsWith("impl-audit-")
}
