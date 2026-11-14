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
  /**
   * The table lines that continue the row above them: the further lines of a
   * wrapped row, the rule under a row and the bottom border. The column
   * headings count as one row, from the top border through the first rule.
   */
  readonly rowTails: ReadonlySet<number>
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
 * The table's region, row tails and grouped rows, read from its drawn lines:
 * the heading runs from the top border through the first rule, and each
 * further rule ends one row. A row starts at the top border and after every
 * rule that a row follows. A table too narrow to draw as a grid has no such
 * lines and gets none of the three.
 */
function tableLayout(
  token: Tokens.Table,
  lines: readonly string[],
  start: number,
): {
  readonly region: Region
  readonly rowTails: readonly number[]
  readonly groupedRows: readonly GroupedRow[]
} | null {
  const separators = lines.flatMap((line, index) =>
    line.startsWith("├") ? [index] : [],
  )
  if (!lines[0]?.startsWith("┌") || separators.length === 0) return null
  const startsRow = (index: number) =>
    index === 0 ||
    (lines[index - 1].startsWith("├") && index < lines.length - 1)
  return {
    region: {
      start,
      end: start + lines.length - 1,
      header: lines.slice(0, separators[0] + 1),
      children: [],
    },
    rowTails: lines.flatMap((_line, index) =>
      startsRow(index) ? [] : [start + index],
    ),
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
  const rowTails = new Set<number>()
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
        for (const line of table.rowTails) rowTails.add(line)
        grouped.push(...table.groupedRows)
      }
    }
    cursor = start + own.length
  }
  closeFrom(1)
  return { lines, regions, groupedRows: grouped, rowTails }
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
 * under the headings. The row's lines are drawn again with the name in the
 * first cell, so the row keeps every other cell and scrolls as one whole. A
 * rule that still shows above the row is kept as it is. When the name has
 * more lines than the row shows, its last line there ends in "…".
 */
function namedRow(layout: DocumentLayout, first: number): string[] {
  const row = layout.groupedRows.find(
    (candidate) => candidate.start - 1 <= first && first < candidate.end,
  )
  if (row === undefined) return []
  const from = Math.max(first, row.start)
  const shown = row.end - from
  return [
    ...layout.lines.slice(first, from),
    ...layout.lines.slice(from, row.end).map((line, index) => {
      if (index >= row.name.length) return line
      const name =
        index === shown - 1 && row.name.length > shown
          ? cutName(row.name[index])
          : row.name[index]
      const width = visibleWidth(name)
      return `${name}${sliceByColumn(line, width, visibleWidth(line) - width)}`
    }),
  ]
}

/**
 * The heading lines that stay at the top when the document is scrolled to
 * `top`, and whether every one of those headings shows whole. They cover the
 * first lines of the view, so each level asks which region holds the first
 * line its heading would cover. A heading is pinned from the moment its own
 * lines reach that place, which draws the same lines where they already are,
 * until its region's last line has passed it. When fewer lines of the region
 * remain than the heading has, only the heading's last lines stay. A heading
 * therefore leaves together with its region and never covers the lines after
 * it.
 */
function pinnedAt(
  regions: readonly Region[],
  top: number,
): { readonly lines: string[]; readonly whole: boolean } {
  const lines: string[] = []
  let whole = true
  let level = regions
  for (;;) {
    const line = top + lines.length
    const region = level.find(
      (candidate) => candidate.start <= line && line < candidate.end,
    )
    if (region === undefined) return { lines, whole }
    const shown = region.header.slice(-(region.end - line))
    whole &&= shown.length === region.header.length
    lines.push(...shown)
    level = region.children
  }
}

/**
 * The lines drawn over the first lines of the view when the document is
 * scrolled to `top`: the pinned headings, then the first row under them when
 * it needs its group's name.
 */
export function pinnedLines(layout: DocumentLayout, top: number): string[] {
  const headings = pinnedAt(layout.regions, top).lines
  return [...headings, ...namedRow(layout, top + headings.length)]
}

/**
 * The scroll position a step of `lines` from `top` ends at, in a view that is
 * `viewport` lines high. A position is a resting place when every pinned
 * heading shows whole and the first line under them starts a row, so the
 * reader never rests on half a row or half a heading. The start and the end
 * of the document are resting places too.
 *
 * A step ends at the furthest resting place within `lines` that skips no
 * line: the lines in view under the headings before and after the step must
 * join. A page step is longer than that, because the headings cover the first
 * lines of the view. When no resting place qualifies, the step goes to the
 * nearest one, which is how one line of scrolling becomes one whole row.
 */
export function steppedTop(
  layout: DocumentLayout,
  top: number,
  lines: number,
  viewport: number,
): number {
  const direction = Math.sign(lines)
  if (direction === 0) return top
  const last = Math.max(0, layout.lines.length - viewport)
  const clamp = (position: number) => Math.max(0, Math.min(last, position))
  const firstShown = (position: number) =>
    position + pinnedAt(layout.regions, position).lines.length
  const rests = (position: number) => {
    if (position <= 0 || position >= last) return true
    const pinned = pinnedAt(layout.regions, position)
    return pinned.whole && !layout.rowTails.has(position + pinned.lines.length)
  }
  const joins = (position: number) =>
    direction > 0
      ? firstShown(position) <= top + viewport
      : position + viewport >= firstShown(top)
  let nearest = top + direction
  while (!rests(nearest)) nearest += direction
  for (
    let position = clamp(top + lines);
    direction * (position - nearest) > 0;
    position -= direction
  )
    if (rests(position) && joins(position)) return position
  return clamp(nearest)
}
