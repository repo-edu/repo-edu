import type { Effort } from "./phase.js"
import { blobHashPattern, type SplitResultWord } from "./split-result.js"
import { fullTagPattern } from "./subject.js"

/** One range of lines, both ends included, in the source content the list names. */
export type LineRange = {
  readonly start: number
  readonly end: number
}

/** One move: a target file, the one responsibility it holds and its ranges. */
export type ListedMove = {
  readonly target: string
  readonly responsibility: string
  readonly ranges: readonly LineRange[]
}

/** One model selection that wrote or repaired a move list. */
export type MoveListWriter = {
  readonly tag: string
  readonly model: string
  readonly effort: Effort
}

/** The two results a list without moves records. */
export type ListResult = Extract<SplitResultWord, "fine" | "needs-plan">

type Opening = {
  readonly source: string
  readonly hash: string
  readonly area: string
}

/**
 * A move list as the round grammar's Move list form holds it: the source it
 * divides and either its moves, in the order the statement move tool carries
 * them out, or the result it records instead.
 */
export type MoveList = Opening &
  (
    | {
        readonly kind: "moves"
        readonly designer: MoveListWriter
        readonly picker?: MoveListWriter
        readonly moves: readonly ListedMove[]
      }
    | ({
        readonly kind: "no-split"
        readonly result: ListResult
        readonly reason: string
      } & (
        | { readonly designer: MoveListWriter; readonly picker?: never }
        | { readonly designer?: never; readonly picker: MoveListWriter }
      ))
  )

export const listResults = [
  "fine",
  "needs-plan",
] as const satisfies readonly ListResult[]
export const areaPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const pathPattern = /^[^\x60\r\n]+$/
const moveHeading = /^### (\S+)\. `([^`]+)`\.?$/
const rangePattern = /^([1-9]\d*)(?:-([1-9]\d*))?$/
const writerLinePattern =
  /^([a-z]{3}) \(([A-Za-z0-9][^\s)]*) (low|medium|high|xhigh)\)$/

function readWriter(
  line: string,
  label: "Designer" | "Picker",
): MoveListWriter {
  const prefix = `${label}: `
  const match = line.startsWith(prefix)
    ? writerLinePattern.exec(line.slice(prefix.length))
    : null
  if (match === null || !fullTagPattern.test(match[1]))
    throw new Error(`Move list ${label}: line must name tag (model effort)`)
  return {
    tag: match[1],
    model: match[2],
    effort: match[3] as Effort,
  }
}

function formatWriter({ tag, model, effort }: MoveListWriter): string {
  return `${tag} (${model} ${effort})`
}

function movedLines(ranges: readonly LineRange[]): number {
  return ranges.reduce((total, { start, end }) => total + (end - start + 1), 0)
}

/** The document's lines in groups that empty lines separate. */
function blocks(text: string): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  for (const line of text
    .trim()
    .split("\n")
    .map((line) => line.trim())) {
    if (line !== "") {
      current.push(line)
      continue
    }
    if (current.length > 0) groups.push(current)
    current = []
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function readOpening(lines: readonly string[] | undefined): {
  named: Opening
  extra: readonly string[]
} {
  if (!lines || lines.length < 4)
    throw new Error(
      "Move list needs Source:, Hash:, Area: and Size: lines after its heading",
    )
  const [sourceLine, hashLine, areaLine, sizeLine] = lines
  const source = /^Source: `([^`]+)`\.?$/.exec(sourceLine)?.[1]
  if (source === undefined)
    throw new Error("Move list Source: line must name one path in backticks")
  const hash = /^Hash: (.*)$/.exec(hashLine)?.[1]
  if (hash === undefined)
    throw new Error("Move list needs its Hash: line after its Source: line")
  if (!blobHashPattern.test(hash))
    throw new Error(
      "Move list hash must be forty lowercase hexadecimal characters",
    )
  const area = /^Area: (.*)$/.exec(areaLine)?.[1]
  if (area === undefined || !areaPattern.test(area))
    throw new Error("Move list Area: line must name one area ID")
  if (!/^Size: (?:0|[1-9]\d*) lines$/.test(sizeLine))
    throw new Error(
      "Move list Size: line must give the source line count as n lines",
    )
  return { named: { source, hash, area }, extra: lines.slice(4) }
}

function readRanges(text: string, move: number): LineRange[] {
  return text.split(/,[ \t]*/).map((range) => {
    const match = rangePattern.exec(range)
    if (match === null)
      throw new Error(`Move list move ${move} has the malformed range ${range}`)
    const start = Number(match[1])
    return { start, end: match[2] === undefined ? start : Number(match[2]) }
  })
}

function checkMoves(moves: readonly ListedMove[]): void {
  const targets = new Map<string, number>()
  for (const [index, { target, ranges }] of moves.entries()) {
    const number = index + 1
    const earlier = targets.get(target)
    if (earlier !== undefined)
      throw new Error(
        `Move list names the target ${target} in moves ${earlier} and ${number}`,
      )
    targets.set(target, number)
    for (const { start, end } of ranges)
      if (end < start)
        throw new Error(
          `Move list move ${number} has the range ${start}-${end}, whose end comes before its start`,
        )
  }
}

function readMoves(groups: readonly string[][]): ListedMove[] {
  if (groups.length === 0)
    throw new Error("Move list needs at least one move under ## Moves")
  const moves: ListedMove[] = []
  for (let index = 0; index < groups.length; index += 2) {
    const number = moves.length + 1
    const [heading, body] = [groups[index], groups[index + 1]]
    const named = heading.length === 1 ? moveHeading.exec(heading[0]) : null
    if (named === null)
      throw new Error(
        `Move list move ${number} needs the heading ### ${number}. and its target in backticks`,
      )
    if (named[1] !== `${number}`)
      throw new Error(`Move list move ${number} is numbered ${named[1]}`)
    const responsibility = /^Responsibility: (\S.*)$/.exec(body?.[0] ?? "")
    const ranges = /^Ranges: (.+)$/.exec(body?.[1] ?? "")
    if (body?.length !== 3 || responsibility === null || ranges === null)
      throw new Error(
        `Move list move ${number} needs Responsibility:, Ranges: and Size: lines`,
      )
    if (!/^Size: [1-9]\d* lines$/.test(body[2]))
      throw new Error(
        `Move list move ${number} Size: line must give the target line count as n lines`,
      )
    moves.push({
      target: named[2],
      responsibility: responsibility[1],
      ranges: readRanges(ranges[1], number),
    })
  }
  checkMoves(moves)
  return moves
}

function readNoSplit(
  groups: readonly string[][],
): Pick<Extract<MoveList, { kind: "no-split" }>, "result" | "reason"> {
  const line = groups.length === 1 && groups[0].length === 1 ? groups[0][0] : ""
  const match = /^Result: (.+?)\. (\S.*)$/.exec(line)
  if (match === null)
    throw new Error(
      "Move list ## No split section needs one line Result: with its word and reason",
    )
  const result = listResults.find((word) => word === match[1])
  if (result === undefined)
    throw new Error("Move list result must be fine or needs-plan")
  return { result, reason: match[2] }
}

/** Read a move list under the round grammar's Move list form. */
export function readMoveList(text: string): MoveList {
  const [heading, opening, section, ...rest] = blocks(text)
  if (heading?.length !== 1 || heading[0] !== "# Move list")
    throw new Error("Move list must open with the heading # Move list")
  const { named, extra } = readOpening(opening)
  if (section?.length === 1 && section[0] === "## Moves") {
    if (
      extra.length === 0 ||
      !/^Remaining: (?:0|[1-9]\d*) lines$/.test(extra[0])
    )
      throw new Error(
        "Move list Remaining: line must give the remaining source line count as n lines",
      )
    if (extra.length < 2)
      throw new Error(
        "Move list needs a Designer: line after its Remaining: line",
      )
    if (extra.length > 3)
      throw new Error(
        "Move list opening may hold only Designer: and an optional Picker: after Remaining:",
      )
    const designer = readWriter(extra[1], "Designer")
    const picker =
      extra.length === 3 ? readWriter(extra[2], "Picker") : undefined
    return {
      ...named,
      kind: "moves",
      designer,
      ...(picker === undefined ? {} : { picker }),
      moves: readMoves(rest),
    }
  }
  if (section?.length === 1 && section[0] === "## No split") {
    if (extra.length !== 1)
      throw new Error(
        "Move list needs one Designer: or Picker: line after its Size: line",
      )
    if (extra[0].startsWith("Designer: "))
      return {
        ...named,
        kind: "no-split",
        designer: readWriter(extra[0], "Designer"),
        ...readNoSplit(rest),
      }
    if (extra[0].startsWith("Picker: "))
      return {
        ...named,
        kind: "no-split",
        picker: readWriter(extra[0], "Picker"),
        ...readNoSplit(rest),
      }
    throw new Error(
      "Move list needs one Designer: or Picker: line after its Size: line",
    )
  }
  throw new Error(
    "Move list needs a ## Moves or a ## No split section after its opening",
  )
}

/** Write the Move list form shared by saved answers and committed lists. */
export function moveListText(list: MoveList, size: number): string {
  if (!pathPattern.test(list.source))
    throw new Error("Move list Source: line must name one path in backticks")
  const opening = [
    "# Move list",
    "",
    `Source: \`${list.source}\``,
    `Hash: ${list.hash}`,
    `Area: ${list.area}`,
    `Size: ${size} lines`,
  ]
  if (list.kind === "no-split") {
    opening.push(
      list.designer !== undefined
        ? `Designer: ${formatWriter(list.designer)}`
        : `Picker: ${formatWriter(list.picker)}`,
    )
    return `${opening.join("\n")}\n\n## No split\n\nResult: ${list.result}. ${list.reason}\n`
  }
  checkMoves(list.moves)
  const targetSizes = list.moves.map(({ ranges }) => movedLines(ranges))
  const remaining = Math.max(
    0,
    size - targetSizes.reduce((total, count) => total + count, 0),
  )
  opening.push(
    `Remaining: ${remaining} lines`,
    `Designer: ${formatWriter(list.designer)}`,
  )
  if (list.picker !== undefined)
    opening.push(`Picker: ${formatWriter(list.picker)}`)
  const moves = list.moves.map(({ target, responsibility, ranges }, index) => {
    const lines = ranges
      .map(({ start, end }) => (start === end ? `${start}` : `${start}-${end}`))
      .join(", ")
    return `### ${index + 1}. \`${target}\`\n\nResponsibility: ${responsibility}\nRanges: ${lines}\nSize: ${targetSizes[index]} lines`
  })
  return `${[opening.join("\n"), "## Moves", ...moves].join("\n\n")}\n`
}
