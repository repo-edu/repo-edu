import { readFindings } from "./findings.js"
import { stampSequence } from "./sequence.js"
import {
  isAuditRole,
  looseForm,
  parseSubject,
  type Repository,
  SubjectError,
} from "./subject.js"

/**
 * What a round hands the commit hook through the environment: the auditor's
 * tag for a record's subject and the body's phase lines. A session committing
 * on its own hands it nothing and writes both itself.
 */
export type CommitStamps = {
  readonly auditor: string | null
  readonly phases: string | null
}

const efforts = {
  l: "low",
  m: "medium",
  h: "high",
  x: "xhigh",
} as const

/**
 * A model record line: an optional phase list, the model, and an optional
 * effort. The shape is checked rather than a list of model names, so a new
 * model family needs no edit here.
 */
const modelLine =
  /^([a-z]+(, [a-z]+)*: )?[A-Za-z0-9][^ ]*( (low|medium|high|xhigh))?$/

/**
 * Stamp and check one commit message. Returns the message to commit, or
 * throws a `SubjectError` naming what the subject grammar or the model record
 * refused. Mirrors what the hook guarantees: a record's subject names the
 * auditor the round holds, every subject parses under the repository's form,
 * the body opens with the model the work ran on, and a single-model record
 * agrees with the tag on the effort.
 */
export function stampCommitMessage(
  text: string,
  repository: Repository,
  stamps: CommitStamps,
  areaKinds: ReadonlyMap<string, string>,
): string {
  const trailing = text.endsWith("\n")
  const lines = (trailing ? text.slice(0, -1) : text).split("\n")
  if (text.length === 0) return text
  const tokens = lines[0].split(" ")
  const form = looseForm(lines[0])
  // A plan form opens the subject and takes the first field, so the tag follows
  // it; an ordinary subject opens with the tag itself.
  const slot = form === null ? 0 : 1
  if (tokens.length <= slot)
    throw new SubjectError("the subject needs a capability tag, as atx")
  const record = form !== null && isAuditRole(form.role)
  // A round record names the audit, whose capability the round holds and the
  // session composing the subject does not.
  if (record && stamps.auditor !== null)
    tokens[slot] = tokens[slot].endsWith(":")
      ? `${stamps.auditor}:`
      : stamps.auditor
  const findings = readFindings(lines.slice(1).join("\n"), repository, {
    strict: true,
    areaKinds,
    role: form?.role ?? null,
  })
  const subjectLine = stampSequence(tokens.join(" "), findings, repository)
  const subject = parseSubject(subjectLine, repository)

  const first = lines.findIndex(
    (line, at) => at > 0 && line !== "" && !line.startsWith("#"),
  )
  // A round states what every phase ran on, so its record replaces whatever the
  // session opened the body with.
  if (stamps.phases === null) {
    if (first === -1)
      throw new SubjectError(
        "the body must open with the model the commit ran on",
      )
    if (!modelLine.test(lines[first]))
      throw new SubjectError(
        `the body must open with a model line, not ${lines[first]}`,
      )
  }
  const modelRecord = stamps.phases ?? lines[first]
  // One unprefixed record line describes this commit alone, so the two must
  // agree on the effort. A round lists several and states each phase itself,
  // and an audit record names its audit while the record names the fix.
  const said = modelRecord.split(" ").at(-1) ?? ""
  if (
    !record &&
    !modelRecord.includes(":") &&
    Object.values(efforts).some((effort) => effort === said) &&
    said !== efforts[subject.tag.effort]
  )
    throw new SubjectError(
      "the subject tag and the model record disagree on the effort",
    )

  const output = [subjectLine]
  if (stamps.phases === null) output.push(...lines.slice(1))
  else {
    output.push("", stamps.phases)
    let at =
      first === -1
        ? lines.length
        : modelLine.test(lines[first])
          ? first + 1
          : first
    while (at < lines.length && lines[at] === "") at += 1
    if (at < lines.length) output.push("")
    output.push(...lines.slice(at))
  }
  return output.join("\n") + (trailing ? "\n" : "")
}
