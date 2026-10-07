import { fromMarkdown } from "mdast-util-from-markdown"
import type { Repository } from "./subject.js"
import type { RoundKind } from "./target.js"

type Block = ReturnType<typeof fromMarkdown>["children"][number]
type List = Extract<Block, { type: "list" }>
type Paragraph = Extract<Block, { type: "paragraph" }>

/** The named workflow in the report opening owns routing, never its file name. */
export function reportKind(source: string): RoundKind {
  const children = fromMarkdown(source).children
  const end = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2,
  )
  const opening = children
    .slice(0, end === -1 ? undefined : end)
    .filter((node) => node.type === "heading" || node.type === "paragraph")
    .map((node) =>
      source.slice(node.position?.start.offset, node.position?.end.offset),
    )
    .join("\n")
  const planning = /\bPlanning round workflow\b/i.test(opening)
  const implementation = /\bImplementation audit workflow\b/i.test(opening)
  if (planning === implementation)
    throw new Error(
      "Report opening must name either Planning round workflow or Implementation audit workflow",
    )
  return planning ? "planning" : "implementation"
}

/** Finding identities survive the fix consuming the report and its twins. */
export type ReportFindings = readonly number[]

export type AuditReport = {
  readonly findings: ReportFindings
  readonly judgedRepos: readonly Repository[]
  readonly recommendation: RoundRecommendation | null
}

export type RoundRecommendation =
  | { readonly decision: "stop"; readonly reason: string }
  | {
      readonly decision: "continue"
      readonly assistant: "claude" | "codex"
      readonly reason: string
    }

export type ReportClass = "widening" | "detailing" | "implementation"

type OpeningLine = {
  /** Formatted spans read as a marker, so only plain text can match. */
  readonly plain: string
  /** Formatted spans keep their source, so a reason loses no words. */
  readonly text: string
}

function openingLines(
  children: readonly Block[],
  source: string,
): readonly OpeningLine[] {
  const end = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2,
  )
  return children.slice(0, end === -1 ? undefined : end).flatMap((node) => {
    if (node.type !== "paragraph") return []
    // Only text and breaks end lines, so both readings split alike.
    const lines = (
      formatted: (child: Paragraph["children"][number]) => string,
    ) =>
      node.children
        .map((child) =>
          child.type === "text"
            ? child.value
            : child.type === "break"
              ? "\n"
              : formatted(child),
        )
        .join("")
        .split(/\r?\n/)
    const text = lines((child) =>
      source
        .slice(child.position?.start.offset, child.position?.end.offset)
        .replace(/\s*\n\s*/g, " "),
    )
    return lines(() => "\0").map((plain, index) => ({
      plain,
      text: text[index],
    }))
  })
}

function judgedRepos(
  children: readonly Block[],
  source: string,
): readonly Repository[] {
  const lines = openingLines(children, source)
    .map((line) => line.plain)
    .filter((line) => line.startsWith("Judged repos:"))
  if (
    lines.length !== 1 ||
    !/^Judged repos: (?:plan@[0-9a-f]+(?:, repo-edu@[0-9a-f]+)?|repo-edu@[0-9a-f]+)$/.test(
      lines[0],
    )
  )
    throw new Error(
      "Report needs one Judged repos: opening with each audited head",
    )
  return lines[0]
    .slice("Judged repos: ".length)
    .split(", ")
    .map((entry) => entry.split("@")[0] as Repository)
}

function recommendationFromLine(line: OpeningLine): RoundRecommendation | null {
  const match =
    /^Recommendation: (?:(stop)|(continue with (Claude|Codex)))\. (?=.)/.exec(
      line.plain,
    )
  if (match === null) return null
  const reason = line.text.slice(match[0].length)
  const assistant = match[3]
  if (match[1] !== "stop" && assistant === undefined) return null
  return match[1] === "stop"
    ? { decision: "stop", reason }
    : {
        decision: "continue",
        assistant: assistant === "Claude" ? "claude" : "codex",
        reason,
      }
}

function reportRecommendation(
  children: readonly Block[],
  source: string,
  reportClass: ReportClass,
): RoundRecommendation | null {
  if (reportClass === "widening") return null
  const lines = openingLines(children, source).filter((line) =>
    line.plain.startsWith("Recommendation:"),
  )
  const recommendation =
    lines.length === 1 ? recommendationFromLine(lines[0]) : null
  if (recommendation === null)
    throw new Error(
      `${reportClass === "detailing" ? "Detailing" : "Implementation"} report needs one opening line with a plain "Recommendation: stop. ", "Recommendation: continue with Claude. " or "Recommendation: continue with Codex. " prefix and a reason`,
    )
  return recommendation
}

/** The resumed auditor returns this one line without a runner-result suffix. */
export function readFinalRecommendation(source: string): RoundRecommendation {
  const children = fromMarkdown(source).children
  const lines = openingLines(children, source)
  const recommendation =
    children.length === 1 &&
    children[0]?.type === "paragraph" &&
    lines.length === 1
      ? recommendationFromLine(lines[0])
      : null
  if (recommendation === null)
    throw new Error(
      "Final recommendation must contain exactly one recommendation line and no other text",
    )
  return recommendation
}

export function formatRecommendation(
  recommendation: RoundRecommendation,
): string {
  const decision =
    recommendation.decision === "stop"
      ? "stop"
      : `continue with ${recommendation.assistant === "claude" ? "Claude" : "Codex"}`
  return `Recommendation: ${decision}. ${recommendation.reason}`
}

function plain(node: Paragraph | Extract<Block, { type: "heading" }>): string {
  if (node.children.some((child) => child.type !== "text")) return ""
  return node.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
}

function openingTokens(item: List["children"][number]): string {
  const start = item.children[0]
  if (start?.type !== "paragraph") return ""
  // Comments carry formatting directives rather than finding content.
  const next = item.children
    .slice(1)
    .find(
      (node) =>
        node.type !== "html" ||
        node.value.replace(/<!--[\s\S]*?-->/g, "").trim() !== "",
    )
  // The token line may share the title's paragraph or follow a blank line.
  const children =
    start.children.length > 1
      ? start.children.slice(1)
      : next?.type === "paragraph"
        ? next.children
        : []
  return children
    .map((child) => (child.type === "text" ? child.value : "\0"))
    .join("")
    .trimStart()
    .split("\n")[0]
    .trimEnd()
}

function findingNumber(
  item: List["children"][number],
  source: string,
  field: string | null,
): number {
  const start = item.children[0]
  const title = start?.type === "paragraph" ? start.children[0] : undefined
  const lines = source
    .slice(item.position?.start.offset, item.position?.end.offset)
    .split("\n")
  const number = /^([1-9]\d*)\. \*\*[A-D]: .+\*\*\s*$/.exec(lines[0])
  const tokens = openingTokens(item)
  if (
    number === null ||
    title?.type !== "strong" ||
    !/^(?:\[[a-z-]+:[^\]\n]+\])(?: \[[a-z-]+:[^\]\n]+\])*$/.test(tokens)
  )
    throw new Error(
      `Malformed finding at report line ${item.position?.start.line}: expected a bold tier title followed by a token line`,
    )
  const has = (key: string) => tokens.includes(`[${key}:`)
  if (
    !["growth-pattern", "reach", "complexity"].every(has) ||
    !["area", "section", "plan"].some(has) ||
    (field !== null && !tokens.includes(`[field:${field}]`))
  )
    throw new Error(`Finding ${number[1]} lacks its location or rating tokens`)
  return Number(number[1])
}

/** Read only document-level fields and lists; quoted evidence and code are not findings. */
export function readReport(
  source: string,
  reportClass: ReportClass,
): AuditReport {
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
  const findings: number[] = []
  for (const definition of definitions) {
    const headings = children.flatMap((node, index) =>
      node.type === "heading" &&
      node.depth === 2 &&
      plain(node) === definition.heading
        ? [index]
        : [],
    )
    if (headings.length !== 1)
      throw new Error(`Report needs exactly one ## ${definition.heading} field`)
    const start = headings[0] + 1
    const next = children.findIndex(
      (node, index) =>
        index >= start && node.type === "heading" && node.depth <= 2,
    )
    const nodes = children.slice(start, next === -1 ? undefined : next)
    let empty = 0
    const numbers: number[] = []
    for (const node of nodes) {
      if (node.type === "paragraph" && plain(node).trim() === definition.empty)
        empty += 1
      if (node.type === "list") {
        if (!node.ordered)
          throw new Error(
            `${definition.heading} findings must be numbered blocks`,
          )
        for (const item of node.children)
          numbers.push(findingNumber(item, source, definition.field))
      }
    }
    if (
      !(
        (empty === 1 && numbers.length === 0) ||
        (empty === 0 && numbers.length > 0)
      )
    )
      throw new Error(
        `${definition.heading} needs findings or exactly "${definition.empty}", never both`,
      )
    findings.push(...numbers)
  }
  if (findings.some((number, index) => number !== index + 1))
    throw new Error(
      "Report finding numbers must run from 1 without gaps or duplicates",
    )
  return {
    findings,
    judgedRepos: judgedRepos(children, source),
    recommendation: reportRecommendation(children, source, reportClass),
  }
}
