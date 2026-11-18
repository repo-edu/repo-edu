import { readFindings } from "./findings.js"
import listedFiles from "./listed-files.json" with { type: "json" }
import { stampSequence } from "./sequence.js"
import { parseCoderRecord } from "./settings.js"
import {
  isAuditRole,
  looseRole,
  parseSubject,
  type Repository,
  SubjectError,
  withSeriesForm,
} from "./subject.js"

/**
 * What a round hands the commit hook through the environment: the auditor's
 * tag for a record's subject, the body's phase lines with their time line and,
 * for a commit round, its series label. A session committing on its own hands
 * it nothing and writes its own tag and model line.
 */
export type CommitStamps = {
  readonly auditor: string | null
  readonly phases: string | null
  readonly series: string | null
}

export type CommitAdmission = {
  /** Serious contests that still need the user's winner. */
  readonly openContests: readonly number[]
  /**
   * Every path the commit changes in its own repository, both names of a
   * rename included. The hook collects them; this reader asks Git nothing.
   */
  readonly changedPaths: readonly string[]
}

/**
 * The changed paths that `listed-files.json` names for this repository: a
 * path equal to a listed file or under a listed folder, whose entry ends in
 * `/`. Such a file changes only inside a plan, under the plan repo's
 * Doctrine changes rule.
 */
export function listedPaths(
  paths: readonly string[],
  repository: Repository,
): readonly string[] {
  const entries: readonly string[] = listedFiles[repository]
  return paths.filter((path) =>
    entries.some((entry) =>
      entry.endsWith("/") ? path.startsWith(entry) : path === entry,
    ),
  )
}

const efforts = {
  l: "low",
  m: "medium",
  h: "high",
  x: "xhigh",
} as const

const singleModelLine = /^[A-Za-z0-9][^ ]* (low|medium|high|xhigh)$/
const phaseModelLine =
  /^(?:audit|vet|rebut|fix)(?:, (?:audit|vet|rebut|fix))*: [A-Za-z0-9][^ ]* (low|medium|high|xhigh)$/
const modelLine = new RegExp(
  `(?:${singleModelLine.source})|(?:${phaseModelLine.source})`,
)

/**
 * The round's time line, which follows its phase lines. It belongs to the
 * stamped opening, so a second stamp replaces it rather than repeating it.
 */
const timeLine =
  /^(Audit|Audit and vet|Audit, vet and rebuttal) took \d+ min\.$/
const implementationTimeLine = /^Implementation took (\d+) min\.$/

/** Read the complete leading model record which identifies what produced a commit. */
export function readModelRecord(body: string): readonly string[] {
  const lines = body.split("\n")
  const first = lines.findIndex((line) => line !== "" && !line.startsWith("#"))
  if (first === -1 || !modelLine.test(lines[first]))
    throw new SubjectError(
      `the body must open with a model line${first === -1 ? "" : `, not ${lines[first]}`}`,
    )
  if (singleModelLine.test(lines[first]))
    return implementationTimeLine.test(lines[first + 1] ?? "")
      ? [lines[first], lines[first + 1]]
      : [lines[first]]
  const record: string[] = []
  let at = first
  for (; at < lines.length && phaseModelLine.test(lines[at]); at += 1)
    record.push(lines[at])
  if (!timeLine.test(lines[at] ?? ""))
    throw new SubjectError("a round model record must end with its time line")
  record.push(lines[at])
  return record
}

export type StepModelRecord = {
  readonly model: string
  readonly effort: "low" | "medium" | "high" | "xhigh"
  readonly minutes: number
}

/** Parse the model, effort and active time from one implementation-step record. */
export function readStepModelRecord(body: string): StepModelRecord {
  const record = readModelRecord(body)
  const selection = /^(\S+) (low|medium|high|xhigh)$/.exec(record[0] ?? "")
  const time = implementationTimeLine.exec(record[1] ?? "")
  if (record.length !== 2 || selection === null || time === null)
    throw new SubjectError(
      "an implementation step model record must end with its implementation time",
    )
  return {
    model: selection[1],
    effort: selection[2] as StepModelRecord["effort"],
    minutes: Number(time[1]),
  }
}

/**
 * Stamp and check one commit message. Returns the message to commit, or
 * throws a `SubjectError` naming what the subject grammar or the model record
 * refused. Mirrors what the hook guarantees: a record's subject names the
 * auditor the round holds, every subject parses under the repository's form,
 * a tagged subject's body opens with the model the work ran on, and a
 * single-model record agrees with the tag on the effort. Runner-written settle
 * and ready markers and the user's disprove ruling have neither. A commit
 * round's series label opens the subject with the commit-audit form, so every
 * commit the round lands is its record. A commit audit's record is an audit
 * record like a plan's. A commit that changes a listed file must carry a step
 * or implementation-audit subject, so a commit audit's record is refused one.
 */
export function stampCommitMessage(
  text: string,
  repository: Repository,
  stamps: CommitStamps,
  areaKinds: ReadonlyMap<string, string>,
  admission: CommitAdmission = { openContests: [], changedPaths: [] },
): string {
  if (admission.openContests.length > 0)
    throw new SubjectError(
      `the fix cannot commit while ${admission.openContests.length === 1 ? "finding" : "findings"} ${admission.openContests.join(", ")} still ${admission.openContests.length === 1 ? "needs" : "need"} the user's contest winner`,
    )
  const trailing = text.endsWith("\n")
  const lines = (trailing ? text.slice(0, -1) : text).split("\n")
  if (text.length === 0) return text
  // The round supplies its own label. A mistyped one would leave the record
  // outside the round without a sign, because a commit round may land nothing.
  const opening =
    stamps.series === null ? lines[0] : withSeriesForm(lines[0], stamps.series)
  const tokens = opening.split(" ")
  const role = looseRole(opening)
  // A plan or series form opens the subject and takes the first field, so the
  // tag follows it; an ordinary subject opens with the tag itself.
  const slot = role === null ? 0 : 1
  if (tokens.length <= slot)
    throw new SubjectError("the subject needs a capability tag, as atx")
  const record = role !== null && isAuditRole(role)
  // A round record names the audit, whose capability the round holds and the
  // session composing the subject does not.
  if (record && stamps.auditor !== null)
    tokens[slot] = tokens[slot].endsWith(":")
      ? `${stamps.auditor}:`
      : stamps.auditor
  const findings =
    role === "disprove"
      ? []
      : readFindings(lines.slice(1).join("\n"), repository, role)
  for (const finding of findings) {
    const check = (id: string, kind: string, name: string) => {
      if (areaKinds.get(id) !== kind)
        throw new SubjectError(
          `finding bullet on body line ${finding.line} (${finding.text}): unknown ${name} area: ${id}`,
        )
    }
    if (finding.location.key === "area")
      check(finding.location.value, "partition", "primary")
    for (const cover of finding.covers) check(cover, "cover", "cover")
  }
  const subjectLine = stampSequence(tokens.join(" "), findings, repository)
  const subject = parseSubject(subjectLine, repository)
  const listed = listedPaths(admission.changedPaths, repository)
  if (
    listed.length > 0 &&
    subject.form?.role !== "impl" &&
    subject.form?.role !== "impl-audit"
  )
    throw new SubjectError(
      `${listed.join(", ")} ${listed.length === 1 ? "is a listed file" : "are listed files"}, which change only as a plan step (<stem>/impl-<n>) or a fix from that plan's implementation audit (<stem>/impl-audit-<scope>); the change rule is Doctrine changes in .agents/references/planning-rules.md and the failure record is FAILURES.md, both in the plan checkout`,
    )

  // Git strips comment lines and reads the body from the first blank line, so
  // a model record right after the subject would join it in every one-line log
  // and stem scan. The grammar fixes the subject at one line, so anything after
  // it is body and the hook separates it rather than refusing and making the
  // session retry.
  const afterSubject = lines.findIndex(
    (line, at) => at > 0 && !line.startsWith("#"),
  )
  if (afterSubject !== -1 && lines[afterSubject] !== "")
    lines.splice(afterSubject, 0, "")

  const first = lines.findIndex(
    (line, at) => at > 0 && line !== "" && !line.startsWith("#"),
  )
  const body = lines.slice(1).join("\n")
  if (subject.form?.role === "ready" && parseCoderRecord(body) === null)
    throw new SubjectError("a ready marker body must contain its coder record")
  if (subject.form?.role === "disprove" && body.trim().length === 0)
    throw new SubjectError(
      "a disprove ruling body must contain its full reason",
    )
  // A round states what every phase ran on, so its record replaces whatever the
  // session opened the body with.
  if (subject.tag !== null && stamps.phases === null) {
    try {
      const modelRecord = readModelRecord(body)
      if (subject.form?.role === "impl") readStepModelRecord(body)
      else if (implementationTimeLine.test(modelRecord[1] ?? ""))
        throw new SubjectError(
          "implementation time belongs only to an implementation step",
        )
    } catch (error) {
      if (first === -1)
        throw new SubjectError(
          "the body must open with the model the commit ran on",
        )
      throw error
    }
  }
  if (subject.tag !== null) {
    const modelRecord =
      stamps.phases ?? readModelRecord(body)[0] ?? lines[first]
    // One unprefixed record line describes this commit alone, so the two must
    // agree on the effort. A round lists several and states each phase itself,
    // and an audit record names its audit while the record names the fix.
    const said = modelRecord.split(" ").at(-1) ?? ""
    if (
      !record &&
      singleModelLine.test(modelRecord) &&
      Object.values(efforts).some((effort) => effort === said) &&
      said !== efforts[subject.tag.effort]
    )
      throw new SubjectError(
        "the subject tag and the model record disagree on the effort",
      )
  }

  const output = [subjectLine]
  if (stamps.phases === null) output.push(...lines.slice(1))
  else {
    output.push("", stamps.phases)
    let at = first === -1 ? lines.length : first
    while (
      at < lines.length &&
      (modelLine.test(lines[at]) ||
        timeLine.test(lines[at]) ||
        implementationTimeLine.test(lines[at]))
    )
      at += 1
    while (at < lines.length && lines[at] === "") at += 1
    if (at < lines.length) output.push("")
    output.push(...lines.slice(at))
  }
  return output.join("\n") + (trailing ? "\n" : "")
}
