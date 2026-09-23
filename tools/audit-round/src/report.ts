import { fromMarkdown } from "mdast-util-from-markdown"
import type { RoundKind } from "./context.js"
import type { Repository } from "./subject.js"

type Block = ReturnType<typeof fromMarkdown>["children"][number]
type List = Extract<Block, { type: "list" }>
type Paragraph = Extract<Block, { type: "paragraph" }>

/** Finding identities survive the fix consuming the report and its twins. */
export type ReportFindings = readonly number[]

export type AuditReport = {
  readonly findings: ReportFindings
  readonly judgedRepos: readonly Repository[]
}

function judgedRepos(children: readonly Block[]): readonly Repository[] {
  const opening = children.slice(
    0,
    children.findIndex((node) => node.type === "heading" && node.depth === 2),
  )
  const lines = opening.flatMap((node) =>
    node.type === "paragraph"
      ? node.children
          // Mark formatted spans so only complete plain lines can match.
          .map((child) => (child.type === "text" ? child.value : "\0"))
          .join("")
          .split("\n")
          .filter((line) => line.startsWith("Judged repos:"))
      : [],
  )
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

function plain(node: Paragraph | Extract<Block, { type: "heading" }>): string {
  if (node.children.some((child) => child.type !== "text")) return ""
  return node.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
}

function findingNumber(
  item: List["children"][number],
  source: string,
  field: string | null,
): number {
  const start = item.children[0]
  const end = item.children.at(-1)
  const title = start?.type === "paragraph" ? start.children[0] : undefined
  const lines = source
    .slice(item.position?.start.offset, item.position?.end.offset)
    .split("\n")
  const number = /^([1-9]\d*)\. \*\*[A-D]: .+\*\*\s*$/.exec(lines[0])
  const tokens = end?.type === "paragraph" ? (lines.at(-1)?.trim() ?? "") : ""
  if (
    number === null ||
    title?.type !== "strong" ||
    !/^(?:\[[a-z]+:[^\]\n]+\])(?: \[[a-z]+:[^\]\n]+\])*$/.test(tokens)
  )
    throw new Error(
      `Malformed finding at report line ${item.position?.start.line}: expected a bold tier title and closing token line`,
    )
  const has = (key: string) => tokens.includes(`[${key}:`)
  if (
    !["growth", "reach", "complexity"].every(has) ||
    !["area", "section", "plan"].some(has) ||
    (field !== null && !tokens.includes(`[field:${field}]`))
  )
    throw new Error(`Finding ${number[1]} lacks its location or rating tokens`)
  return Number(number[1])
}

/** Read only document-level fields and lists; quoted evidence and code are not findings. */
export function readReport(source: string, kind: RoundKind): AuditReport {
  const definitions =
    kind === "planning"
      ? [
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
      : [{ heading: "Findings", empty: "No findings.", field: null }]
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
  return { findings, judgedRepos: judgedRepos(children) }
}
