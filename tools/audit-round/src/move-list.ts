import { blobHashPattern, type SplitResultWord } from "./split-result.js"

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
    | { readonly kind: "moves"; readonly moves: readonly ListedMove[] }
    | {
        readonly kind: "no-split"
        readonly result: ListResult
        readonly reason: string
      }
  )

export const listResults = [
  "fine",
  "needs-plan",
] as const satisfies readonly ListResult[]
export const areaPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const pathPattern = /^[^\x60\r\n]+$/
const moveHeading = /^### (\S+)\. `([^`]+)`\.?$/
const rangePattern = /^([1-9]\d*)(?:-([1-9]\d*))?$/

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

function readOpening(lines: readonly string[] | undefined): Opening {
  if (lines?.length !== 4)
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
  return { source, hash, area }
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
    if (body?.length !== 2 || responsibility === null || ranges === null)
      throw new Error(
        `Move list move ${number} needs a Responsibility: line and a Ranges: line`,
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
  const named = readOpening(opening)
  if (section?.length === 1 && section[0] === "## Moves")
    return { ...named, kind: "moves", moves: readMoves(rest) }
  if (section?.length === 1 && section[0] === "## No split")
    return { ...named, kind: "no-split", ...readNoSplit(rest) }
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
  ].join("\n")
  if (list.kind === "no-split")
    return `${opening}\n\n## No split\n\nResult: ${list.result}. ${list.reason}\n`
  checkMoves(list.moves)
  const moves = list.moves.map(({ target, responsibility, ranges }, index) => {
    const lines = ranges
      .map(({ start, end }) => (start === end ? `${start}` : `${start}-${end}`))
      .join(", ")
    return `### ${index + 1}. \`${target}\`\n\nResponsibility: ${responsibility}\nRanges: ${lines}`
  })
  return `${[opening, "## Moves", ...moves].join("\n\n")}\n`
}
