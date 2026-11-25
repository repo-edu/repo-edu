import { fromMarkdown } from "mdast-util-from-markdown"
import {
  areaLocationTokenKeys,
  findingLabelSchema,
  findingRatingTokenKeys,
  findingTokenSequenceIssue,
  findingTokenValues,
  type JudgedRepositorySet,
  type ReportLocationToken,
  readFindingRatings,
  readFindingTokenPrefix,
  reportLocationTable,
} from "./finding-tokens.js"
import { readSettlingLine } from "./phase-result.js"
import type { ReportFinding, RoundFindingLocation } from "./round-data.js"
import type { Repository } from "./subject.js"
import { type AuditTarget, planPhase, type RoundKind } from "./target.js"

type Block = ReturnType<typeof fromMarkdown>["children"][number]
type Heading = Extract<Block, { type: "heading" }>
type Paragraph = Extract<Block, { type: "paragraph" }>

function openingEndIndex(children: readonly Block[]): number {
  const end = children.findIndex(
    (node) =>
      node.type === "heading" &&
      node.depth === 2 &&
      ["Excess functionality", "Missing functionality", "Findings"].includes(
        plain(node),
      ),
  )
  return end === -1 ? children.length : end
}

/** The named workflow in the audit report opening owns routing, never its file name. */
export function reportKind(source: string): RoundKind {
  const children = fromMarkdown(source).children
  const opening = children
    .slice(0, openingEndIndex(children))
    .filter((node) => node.type === "heading" || node.type === "paragraph")
    .map((node) =>
      source.slice(node.position?.start.offset, node.position?.end.offset),
    )
    .join("\n")
  const named = (
    [
      ["planning", /\bPlanning round workflow\b/i],
      ["implementation", /\bImplementation audit workflow\b/i],
    ] as const
  ).filter(([, phrase]) => phrase.test(opening))
  if (named.length !== 1)
    throw new Error(
      "Audit report opening must name Planning round workflow or Implementation audit workflow",
    )
  return named[0][0]
}

/** Finding identities and metadata survive the fix consuming the audit report and its vet and rebuttal reports. */
export type ReportFindings = readonly ReportFinding[]

export type AuditReport = {
  /** A widening audit report's closing settling line; empty for every other class. */
  readonly settling: string
  readonly findings: ReportFindings
  readonly judgedRepos: readonly Repository[]
}

export type ReportClass = "widening" | "detailing" | "implementation"

/** The class of audit report a target's audit writes. */
export function targetReportClass(target: AuditTarget): ReportClass {
  if (target.roundKind === "implementation") return "implementation"
  return planPhase(target.plan)
}

/** The workflow each audit report class's opening names. */
const classKinds = {
  widening: "planning",
  detailing: "planning",
  implementation: "implementation",
} as const satisfies Record<ReportClass, RoundKind>

/**
 * A widening audit report ends on its settling line, so its reader meets the advice
 * where the audit report stops. No other audit report class carries one. The line is read
 * from its source, so a formatted span in the reason loses no words, and a
 * wrapped paragraph fails the one-line grammar.
 */
function reportSettling(
  children: readonly Block[],
  source: string,
  reportClass: ReportClass,
): string {
  const last = children.at(-1)
  const line =
    last?.type === "paragraph"
      ? readSettlingLine(
          source.slice(last.position?.start.offset, last.position?.end.offset),
        )
      : null
  if (reportClass === "widening") {
    if (line === null)
      throw new Error("Widening audit report must end with a settling line")
    return line
  }
  if (line !== null)
    throw new Error("Only a widening audit report ends with a settling line")
  return ""
}

function openingLines(
  children: readonly Block[],
  spanText: (child: Paragraph["children"][number]) => string,
): readonly string[] {
  return children.slice(0, openingEndIndex(children)).flatMap((node) => {
    if (node.type !== "paragraph") return []
    return node.children
      .map((child) => (child.type === "break" ? "\n" : spanText(child)))
      .join("")
      .split(/\r?\n/)
  })
}

/** The audit report names the target the runner resolved, so no later phase has to ask which it judged. */
function checkTarget(
  children: readonly Block[],
  source: string,
  target: string,
): void {
  const lines = openingLines(children, (child) => {
    const raw = source.slice(
      child.position?.start.offset,
      child.position?.end.offset,
    )
    // A line inside a formatted span cannot introduce a target.
    return child.type === "text" ? raw : raw.replace(/\r?\n/g, "\0")
  }).filter((line) => line.startsWith("Target:"))
  if (lines.length !== 1 || lines[0] !== `Target: ${target}`)
    throw new Error(`Audit report needs one Target: opening naming ${target}`)
}

function judgedRepos(
  children: readonly Block[],
  reportClass: ReportClass,
): readonly Repository[] {
  const lines = openingLines(children, (child) =>
    child.type === "text" ? child.value : "\0",
  ).filter((line) => line.startsWith("Judged repos:"))
  const pattern =
    reportClass === "implementation"
      ? /^Judged repos: (?:plan@[0-9a-f]+(?:, repo-edu@[0-9a-f]+)?|repo-edu@[0-9a-f]+)$/
      : /^Judged repos: plan@[0-9a-f]+$/
  if (lines.length !== 1 || !pattern.test(lines[0]))
    throw new Error(
      "Audit report needs one Judged repos: opening with each audited head",
    )
  return lines[0]
    .slice("Judged repos: ".length)
    .split(", ")
    .map((entry) => entry.split("@")[0] as Repository)
}

function plain(node: Paragraph | Heading): string {
  if (node.children.some((child) => child.type !== "text")) return ""
  return node.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
}

function tokenLine(node: Block | undefined): string {
  if (node?.type !== "paragraph") return ""
  return node.children
    .map((child) => (child.type === "text" ? child.value : "\0"))
    .join("")
    .trimStart()
    .split("\n")[0]
    .trimEnd()
}

function findingData(
  title: Heading,
  next: Block | undefined,
  source: string,
  field: string | null,
  reportClass: ReportClass,
  repositories: readonly Repository[],
): ReportFinding {
  const line = source.slice(
    title.position?.start.offset,
    title.position?.end.offset,
  )
  const heading = /^### ([1-9]\d*)\. ([A-D]): (.+?)\s*$/.exec(line)
  const tokenPrefix = readFindingTokenPrefix(tokenLine(next))
  if (heading === null || tokenPrefix === null || tokenPrefix.remainder !== "")
    throw new Error(
      `Malformed finding at audit report line ${title.position?.start.line}: expected a tier heading followed by a token line`,
    )
  if (heading[3].includes(": "))
    throw new Error(`Finding ${heading[1]} title cannot contain ": "`)
  const { tokens } = tokenPrefix
  const locationTokenKeys =
    reportClass !== "implementation"
      ? (["field", "section"] as const)
      : tokens[0]?.key === "section" || tokens[0]?.key === "plan"
        ? ([tokens[0].key] as const)
        : areaLocationTokenKeys(tokens, 0)
  const expectedTokenKeys = [
    ...locationTokenKeys,
    ...findingRatingTokenKeys(tokens, locationTokenKeys.length),
  ] as const
  const fail: (reason: string) => never = (reason) => {
    throw new Error(`Finding ${heading[1]} has ${reason}`)
  }
  const tokenIssue = findingTokenSequenceIssue(tokens, expectedTokenKeys)
  if (tokenIssue !== null) fail(tokenIssue)
  const values = (key: string) => findingTokenValues(tokens, key)
  const one = (key: string): string => {
    const found = values(key)
    if (found.length !== 1)
      throw new Error(
        `Finding ${heading[1]} needs exactly one [${key}:...] token`,
      )
    return found[0]
  }
  const ratings = readFindingRatings(tokens, fail)

  let location: RoundFindingLocation
  if (reportClass !== "implementation") {
    const foundField = one("field")
    const section = one("section")
    if (
      foundField !== field ||
      !findingLabelSchema.safeParse(section).success ||
      values("area").length > 0 ||
      values("cover").length > 0 ||
      values("plan").length > 0
    )
      throw new Error(`Finding ${heading[1]} lacks its planning location`)
    location = {
      kind: "planning",
      field: foundField as "excess" | "missing",
      section,
    }
  } else {
    const areas = values("area")
    const sections = values("section")
    const plans = values("plan")
    const covers = values("cover")
    if (plans.some((plan) => plan.trim().length === 0))
      throw new Error(`Finding ${heading[1]} has an empty plan target`)
    const locationCount =
      Number(areas.length > 0) +
      Number(sections.length > 0) +
      Number(plans.length > 0)
    if (
      locationCount !== 1 ||
      areas.length > 1 ||
      sections.length > 1 ||
      plans.length > 1 ||
      [...areas, ...covers].some(
        (value) => !findingLabelSchema.safeParse(value).success,
      ) ||
      sections.some((value) => !findingLabelSchema.safeParse(value).success)
    )
      throw new Error(`Finding ${heading[1]} lacks one implementation location`)
    const token: ReportLocationToken =
      plans.length === 1 ? "plan" : sections.length === 1 ? "section" : "area"
    const judgedSet = repositories.join(", ") as JudgedRepositorySet
    const admission = reportLocationTable[judgedSet][token]
    if (admission.outcome === "refused")
      throw new Error(`Finding ${heading[1]} has an ${admission.refusal}`)
    switch (admission.admission) {
      case "plan":
        location = { kind: "plan", section: sections[0] }
        break
      case "repo-edu":
        location = { kind: "repo-edu", area: areas[0], covers: [...covers] }
        break
      case "deferred-plan":
        location = {
          kind: "deferred",
          repository: "plan",
          plan: plans[0],
        }
        break
      case "deferred-repo-edu":
        location = {
          kind: "deferred",
          repository: "repo-edu",
          area: areas[0],
          covers: [...covers],
        }
        break
    }
  }
  return {
    number: Number(heading[1]),
    title: heading[3],
    tier: heading[2] as ReportFinding["tier"],
    reach: ratings.reach,
    rarity: ratings.rarity,
    ...(ratings.harm === undefined ? {} : { harm: ratings.harm }),
    complexity: ratings.complexity,
    growthPattern: ratings["growth-pattern"],
    location,
  }
}

/** Read only document-level fields and headings; quoted evidence and code are not findings. */
export function readReport(
  source: string,
  reportClass: ReportClass,
  target: string,
): AuditReport {
  const namedKind = reportKind(source)
  const expectedKind = classKinds[reportClass]
  if (namedKind !== expectedKind)
    throw new Error(
      `Audit report opening names the ${namedKind} workflow but the reader expected ${expectedKind}`,
    )
  const definitions =
    reportClass === "implementation"
      ? [{ heading: "Findings", empty: "No findings.", field: null }]
      : [
          {
            heading: "Excess functionality",
            empty: "No excess findings.",
            field: "excess",
          },
          {
            heading: "Missing functionality",
            empty: "No missing findings.",
            field: "missing",
          },
        ]
  const children = fromMarkdown(source).children
  checkTarget(children, source, target)
  const repositories = judgedRepos(children, reportClass)
  const settling = reportSettling(children, source, reportClass)
  // The settling line closes the document, not the last field.
  const body = settling === "" ? children : children.slice(0, -1)
  const findings: ReportFinding[] = []
  for (const definition of definitions) {
    const headings = body.flatMap((node, index) =>
      node.type === "heading" &&
      node.depth === 2 &&
      plain(node) === definition.heading
        ? [index]
        : [],
    )
    if (headings.length !== 1)
      throw new Error(
        `Audit report needs exactly one ## ${definition.heading} field`,
      )
    const start = headings[0] + 1
    const next = body.findIndex(
      (node, index) =>
        index >= start && node.type === "heading" && node.depth <= 2,
    )
    const nodes = body.slice(start, next === -1 ? undefined : next)
    let empty = 0
    const fieldFindings: ReportFinding[] = []
    // A depth-3 heading opens a finding; every later block is its evidence.
    nodes.forEach((node, index) => {
      if (node.type === "heading" && node.depth === 3)
        fieldFindings.push(
          findingData(
            node,
            nodes[index + 1],
            source,
            definition.field,
            reportClass,
            repositories,
          ),
        )
      else if (
        fieldFindings.length === 0 &&
        node.type === "paragraph" &&
        plain(node).trim() === definition.empty
      )
        empty += 1
    })
    if (
      !(
        (empty === 1 && fieldFindings.length === 0) ||
        (empty === 0 && fieldFindings.length > 0)
      )
    )
      throw new Error(
        `${definition.heading} needs findings or exactly "${definition.empty}", never both`,
      )
    findings.push(...fieldFindings)
  }
  if (findings.some((finding, index) => finding.number !== index + 1))
    throw new Error(
      "Audit report finding numbers must run from 1 without gaps or duplicates",
    )
  const titles = new Set<string>()
  for (const finding of findings) {
    if (titles.has(finding.title))
      throw new Error(
        `Audit report finding title appears more than once: ${finding.title}`,
      )
    titles.add(finding.title)
  }
  return { settling, findings, judgedRepos: repositories }
}
