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

const listResults: readonly ListResult[] = ["fine", "needs-plan"]
const areaPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const moveHeading = /^### (\S+)\. `([^`]+)`$/
const rangePattern = /^([1-9]\d*)(?:-([1-9]\d*))?$/

/** The document's lines in groups that empty lines separate. */
function blocks(text: string): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  for (const line of text
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())) {
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
  const source = /^Source: `([^`]+)`$/.exec(sourceLine)?.[1]
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
  return text.split(", ").map((range) => {
    const match = rangePattern.exec(range)
    if (match === null)
      throw new Error(`Move list move ${move} has the malformed range ${range}`)
    const start = Number(match[1])
    const end = match[2] === undefined ? start : Number(match[2])
    if (end < start)
      throw new Error(
        `Move list move ${move} has the range ${range}, whose end comes before its start`,
      )
    return { start, end }
  })
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
    const target = named[2]
    const earlier = moves.findIndex((move) => move.target === target)
    if (earlier !== -1)
      throw new Error(
        `Move list names the target ${target} in moves ${earlier + 1} and ${number}`,
      )
    moves.push({
      target,
      responsibility: responsibility[1],
      ranges: readRanges(ranges[1], number),
    })
  }
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
