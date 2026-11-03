import { fromMarkdown } from "mdast-util-from-markdown"
import type { Repository } from "./subject.js"
import { parseStepScope } from "./target.js"

type Block = ReturnType<typeof fromMarkdown>["children"][number]
type Heading = Extract<Block, { type: "heading" }>
type List = Extract<Block, { type: "list" }>
type Paragraph = Extract<Block, { type: "paragraph" }>

export type PlanStep = {
  readonly number: number
  readonly repositories: readonly Repository[]
}

const hostForms: readonly {
  readonly sentence: string
  readonly repositories: readonly Repository[]
}[] = [
  { sentence: "Hosted in Repo Edu.", repositories: ["repo-edu"] },
  { sentence: "Hosted in the plan repo.", repositories: ["plan"] },
  {
    sentence: "Hosted in both repos.",
    repositories: ["plan", "repo-edu"],
  },
]

function headingText(heading: Heading): string {
  if (heading.children.some((child) => child.type !== "text")) return ""
  return heading.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
}

function implementationSection(children: readonly Block[]): readonly Block[] {
  const headings = children.flatMap((node, index) =>
    node.type === "heading" &&
    node.depth === 2 &&
    headingText(node) === "Implementation plan"
      ? [index]
      : [],
  )
  if (headings.length !== 1)
    throw new Error(
      "Plan needs exactly one depth-2 Implementation plan heading.",
    )

  const start = headings[0] + 1
  const nextHeading = children.findIndex(
    (node, index) =>
      index >= start && node.type === "heading" && node.depth <= 2,
  )
  return children.slice(start, nextHeading === -1 ? undefined : nextHeading)
}

function implementationList(children: readonly Block[]): List {
  const list = implementationSection(children).find(
    (node): node is List => node.type === "list" && node.ordered === true,
  )
  if (list === undefined)
    throw new Error("Implementation plan needs an ordered step list.")
  return list
}

function nodeText(node: unknown): string {
  if (typeof node !== "object" || node === null) return ""
  if ("value" in node && typeof node.value === "string") return node.value
  if ("children" in node && Array.isArray(node.children))
    return node.children.map(nodeText).join("")
  return ""
}

function auditRangeParagraph(children: readonly Block[]): {
  readonly text: string
  readonly marker: number
} {
  const implementation = implementationSection(children)
  const headings = implementation.flatMap((node, index) =>
    node.type === "heading" &&
    node.depth === 3 &&
    headingText(node) === "Execution and audits"
      ? [index]
      : [],
  )
  if (headings.length !== 1)
    throw new Error(
      "Implementation plan needs exactly one depth-3 Execution and audits subsection.",
    )

  const start = headings[0] + 1
  const nextHeading = implementation.findIndex(
    (node, index) =>
      index >= start && node.type === "heading" && node.depth <= 3,
  )
  const marker = "Audit ranges:"
  const paragraphs = implementation
    .slice(start, nextHeading === -1 ? undefined : nextHeading)
    .filter((node): node is Paragraph => node.type === "paragraph")
    .map((paragraph) => nodeText(paragraph).replace(/\s+/g, " ").trim())
    .flatMap((text) => {
      const first = text.indexOf(marker)
      if (first === -1) return []
      const second = text.indexOf(marker, first + marker.length)
      return second === -1
        ? [{ text, marker: first }]
        : [
            { text, marker: first },
            { text, marker: second },
          ]
    })
  if (paragraphs.length !== 1)
    throw new Error(
      "Execution and audits subsection needs exactly one Audit ranges: sentence.",
    )
  return paragraphs[0]
}

/** Read the ordered implementation steps and the repositories that host them. */
export function readPlanSteps(source: string): readonly PlanStep[] {
  const list = implementationList(fromMarkdown(source).children)
  return list.children.map((item, index) => {
    const first = item.children[0]
    const title = first?.type === "paragraph" ? first.children[0] : undefined
    const hostText =
      first?.type === "paragraph" && first.children[1]?.type === "text"
        ? first.children[1].value.replace(/\s+/g, " ").trimStart()
        : ""
    const host = hostForms.find(({ sentence }) => hostText.startsWith(sentence))
    const titleEnd =
      title?.type === "strong" ? title.children.at(-1) : undefined
    if (
      title?.type !== "strong" ||
      titleEnd?.type !== "text" ||
      !titleEnd.value.endsWith(".")
    )
      throw new Error(
        `Implementation plan item ${index + 1} needs a bold title ending in a full stop.`,
      )
    if (host === undefined)
      throw new Error(
        `Implementation plan item ${index + 1} must open with a bold title followed by "Hosted in Repo Edu.", "Hosted in the plan repo." or "Hosted in both repos."`,
      )
    return { number: index + 1, repositories: host.repositories }
  })
}

/** Read the ordered audit scopes that tile every listed implementation step. */
export function readAuditRanges(
  source: string,
  stepCount: number,
): readonly string[] {
  const paragraph = auditRangeParagraph(fromMarkdown(source).children)
  const sentence = paragraph.text.slice(paragraph.marker)
  const match = /^Audit ranges: ([^.]+)\.(?:\s|$)/.exec(sentence)
  if (match === null)
    throw new Error(
      'Audit ranges sentence must use "Audit ranges: 1-3, 4, 5-6.".',
    )

  const ranges = match[1].split(", ").map((scope) => {
    const range = parseStepScope(scope)
    if (!range.ok && range.reason === "shape")
      throw new Error(
        `Audit range "${scope}" must be a positive step number or an increasing range.`,
      )
    if (!range.ok)
      throw new Error(
        `Audit range "${scope}" must use safe positive integers in increasing order.`,
      )
    return { scope, first: range.first, last: range.last }
  })

  let expected = 1
  for (const [index, range] of ranges.entries()) {
    if (range.first !== expected) {
      if (index === 0)
        throw new Error(
          `Audit ranges must start at step 1; found step ${range.first}.`,
        )
      if (range.first > expected)
        throw new Error(
          `Audit ranges leave a gap before step ${range.first}; expected step ${expected}.`,
        )
      throw new Error(
        `Audit ranges overlap at step ${range.first}; expected step ${expected}.`,
      )
    }
    expected = range.last + 1
  }
  const end = expected - 1
  if (end !== stepCount)
    throw new Error(
      `Audit ranges end at step ${end}; implementation plan ends at step ${stepCount}.`,
    )
  return ranges.map(({ scope }) => scope)
}
