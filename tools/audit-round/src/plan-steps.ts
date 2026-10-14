import { fromMarkdown } from "mdast-util-from-markdown"
import type { Repository } from "./subject.js"

type Block = ReturnType<typeof fromMarkdown>["children"][number]
type Heading = Extract<Block, { type: "heading" }>
type List = Extract<Block, { type: "list" }>

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

function implementationList(children: readonly Block[]): List {
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
  const list = children
    .slice(start, nextHeading === -1 ? undefined : nextHeading)
    .find((node): node is List => node.type === "list" && node.ordered === true)
  if (list === undefined)
    throw new Error("Implementation plan needs an ordered step list.")
  return list
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
