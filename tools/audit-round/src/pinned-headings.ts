import { stripVTControlCharacters } from "node:util"
import {
  Marked,
  sliceByColumn,
  type Tokens,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui"

/**
 * A run of document lines that keeps its heading lines in view: a section
 * under its heading or a table under its column headings.
 */
export type Region = {
  /** The first line of the region's own heading lines. */
  readonly start: number
  /** The line after the region's last line. */
  readonly end: number
  /** The lines that stay at the top while the region is under the top edge. */
  readonly header: readonly string[]
  readonly children: readonly Region[]
}

/**
 * A table row that belongs to the group an earlier row names: its own first
 * cell is empty.
 */
export type GroupedRow = {
  /** The row's first text line. */
  readonly start: number
  /** The line after the row's last text line. */
  readonly end: number
  /**
   * The group's name as the lines of the naming row's first cell, each from
   * the table's left edge through the cell's right edge.
   */
  readonly name: readonly string[]
}

export type DocumentLayout = {
  readonly lines: string[]
  readonly regions: readonly Region[]
  readonly groupedRows: readonly GroupedRow[]
}

/** Renders Markdown to terminal lines at a width, without outer blank lines. */
export type RenderLines = (markdown: string, width: number) => string[]

type OpenRegion = {
  start: number
  end: number
  header: readonly string[]
  children: Region[]
}

function isBlank(line: string): boolean {
  return stripVTControlCharacters(line).trim() === ""
}

/**
 * The rows that continue a named group. A row whose first cell is empty
 * continues the group of the last row that named one, which is how a table
 * lists further rows under one name without repeating it. The name is kept as
 * the naming row's first-cell lines, through the last one that holds text.
 */
function groupedRows(
  rows: Tokens.Table["rows"],
  lines: readonly string[],
  separators: readonly number[],
  start: number,
): GroupedRow[] {
  if (separators.length !== rows.length) return []
  const edge = lines[0].search(/[┬┐]/)
  const holdsText = (cell: string) =>
    stripVTControlCharacters(cell).slice(1, -1).trim() !== ""
  const grouped: GroupedRow[] = []
  let name: string[] = []
  for (const [row, cells] of rows.entries()) {
    const first = separators[row] + 1
    const end = separators[row + 1] ?? lines.length - 1
    if (cells[0]?.text.trim() === "") {
      if (name.length > 0)
        grouped.push({ start: start + first, end: start + end, name })
      continue
    }
    const cell = lines
      .slice(first, end)
      .map((line) => truncateToWidth(line, edge + 1, ""))
    name = cell.slice(0, cell.findLastIndex(holdsText) + 1)
  }
  return grouped
}

/**
 * The table's region and grouped rows, read from its drawn lines: the heading
 * runs from the top border through the first rule, and each further rule ends
 * one row. A table too narrow to draw as a grid has no such lines and gets
 * neither.
 */
function tableLayout(
  token: Tokens.Table,
  lines: readonly string[],
  start: number,
): {
  readonly region: Region
  readonly groupedRows: readonly GroupedRow[]
} | null {
  const separators = lines.flatMap((line, index) =>
    line.startsWith("├") ? [index] : [],
  )
  if (!lines[0]?.startsWith("┌") || separators.length === 0) return null
  return {
    region: {
      start,
      end: start + lines.length - 1,
      header: lines.slice(0, separators[0] + 1),
      children: [],
    },
    groupedRows: groupedRows(token.rows, lines, separators, start),
  }
}

/**
 * Render the document and find its regions. Each top-level block is rendered
 * again on its own to learn how many lines it takes, because the renderer
 * draws a block the same way alone as inside the document. The document's
 * title is no region: it would stay in view for the whole document and say
 * nothing about the lines under it.
 */
export function layoutDocument(
  markdown: string,
  width: number,
  render: RenderLines,
): DocumentLayout {
  const lines = render(markdown, width)
  const regions: Region[] = []
  const grouped: GroupedRow[] = []
  const open: { readonly depth: number; readonly region: OpenRegion }[] = []
  let cursor = 0
  const siblings = () => open.at(-1)?.region.children ?? regions
  const closeFrom = (depth: number) => {
    while ((open.at(-1)?.depth ?? 0) >= depth) {
      const closed = open.pop()
      if (closed === undefined) return
      closed.region.end = cursor
    }
  }
  for (const token of new Marked().lexer(markdown)) {
    if (token.type === "space") continue
    const start = lines.findIndex(
      (line, index) => index >= cursor && !isBlank(line),
    )
    if (start === -1) break
    const own = render(token.raw, width)
    if (token.type === "heading") {
      const depth = (token as Tokens.Heading).depth
      closeFrom(depth)
      if (depth > 1) {
        const region: OpenRegion = {
          start,
          end: start,
          header: own,
          children: [],
        }
        siblings().push(region)
        open.push({ depth, region })
      }
    } else if (token.type === "table") {
      const table = tableLayout(token as Tokens.Table, own, start)
      if (table !== null) {
        siblings().push(table.region)
        grouped.push(...table.groupedRows)
      }
    }
    cursor = start + own.length
  }
  closeFrom(1)
  return { lines, regions, groupedRows: grouped }
}

/**
 * A name line that ends in "…", for a name the row has no room to finish.
 * The line runs from the table's left edge through the cell's right edge.
 */
function cutName(line: string): string {
  const plain = stripVTControlCharacters(line)
  const text = `${plain.slice(2, -2).trimEnd()}…`
  return `│ ${truncateToWidth(text, visibleWidth(plain) - 4, "…", true)} │`
}

/**
 * The lines that show a group's name in the first row under the headings,
 * when that row leaves its own first cell empty. `first` is the first line
 * under the headings and `room` is how many lines may still be drawn. The
 * row's name lines are drawn again with the name in the first cell, so the
 * row keeps every other cell and scrolls as one whole. The row's later lines
 * are not drawn again, because they show as they are. A rule that still shows
 * above the row is kept as it is. When the name has more lines than the row
 * shows or the room allows, its last drawn line ends in "…".
 */
function namedRow(
  layout: DocumentLayout,
  first: number,
  room: number,
): string[] {
  const row = layout.groupedRows.find(
    (candidate) => candidate.start - 1 <= first && first < candidate.end,
  )
  if (row === undefined) return []
  const from = Math.max(first, row.start)
  const count = Math.min(row.name.length, row.end - from, room - (from - first))
  if (count <= 0) return []
  return [
    ...layout.lines.slice(first, from),
    ...layout.lines.slice(from, from + count).map((line, index) => {
      const name =
        index === count - 1 && row.name.length > count
          ? cutName(row.name[index])
          : row.name[index]
      const width = visibleWidth(name)
      return `${name}${sliceByColumn(line, width, visibleWidth(line) - width)}`
    }),
  ]
}

/**
 * How many lines may stay at the top of a view `viewport` lines high: half
 * of it. The rest of the view always shows the document, so a step of one
 * line never skips a line, however many headings are pinned.
 */
function pinnedCapacity(viewport: number): number {
  return Math.floor(viewport / 2)
}

/**
 * The heading lines that stay at the top when the document is scrolled to
 * `top` in a view `viewport` lines high. They cover the first lines of the
 * view, so each level
 * asks which region holds the first line its heading would cover. A heading
 * is pinned from the moment its own lines reach that place, which draws the
 * same lines where they already are, until its region's last line has passed
 * it. When fewer lines of the region remain than the heading has, only the
 * heading's last lines stay. A heading therefore leaves together with its
 * region and never covers the lines after it. Lines beyond the view's
 * capacity are not pinned.
 */
function pinnedAt(
  regions: readonly Region[],
  top: number,
  viewport: number,
): string[] {
  const lines: string[] = []
  let level = regions
  for (;;) {
    const line = top + lines.length
    const region = level.find(
      (candidate) => candidate.start <= line && line < candidate.end,
    )
    if (region === undefined) break
    lines.push(...region.header.slice(-(region.end - line)))
    level = region.children
  }
  return lines.slice(0, pinnedCapacity(viewport))
}

/**
 * The lines drawn over the first lines of a view `viewport` lines high when
 * the document is scrolled to `top`: the pinned headings, then the first row
 * under them when it needs its group's name. They never exceed the view's
 * capacity.
 */
export function pinnedLines(
  layout: DocumentLayout,
  top: number,
  viewport: number,
): string[] {
  const headings = pinnedAt(layout.regions, top, viewport)
  return [
    ...headings,
    ...namedRow(
      layout,
      top + headings.length,
      pinnedCapacity(viewport) - headings.length,
    ),
  ]
}

/**
 * The scroll position a step of `lines` from `top` ends at, in a view that is
 * `viewport` lines high. A step moves the lines it asks for, so the view
 * follows the trackpad, the wheel and the keys at their own pace. It is
 * shortened only where it would skip a line: the lines in view under the
 * headings before and after the step must join. A page step needs this,
 * because the headings cover the first lines of the view. The pinned capacity
 * keeps a step of half the view joined, so every step moves.
 */
export function steppedTop(
  layout: DocumentLayout,
  top: number,
  lines: number,
  viewport: number,
): number {
  const direction = Math.sign(lines)
  const last = Math.max(0, layout.lines.length - viewport)
  const firstShown = (position: number) =>
    position + pinnedAt(layout.regions, position, viewport).length
  const joins = (position: number) =>
    direction > 0
      ? firstShown(position) <= top + viewport
      : position + viewport >= firstShown(top)
  let position = Math.max(0, Math.min(last, top + lines))
  while (direction * (position - top) > 1 && !joins(position))
    position -= direction
  return position
}
