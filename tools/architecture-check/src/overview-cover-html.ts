import { escape as escapeHtml } from "html-escaper"

import type {
  AreaStructureAggregate,
  PartitionOverview,
  SourceRootId,
} from "./overview-aggregate.js"
import { formatLinesShort } from "./overview-format.js"

type CoverSegment = {
  readonly name: string
  readonly sourceRoot: SourceRootId
  readonly count: number
}

type CoverConcentration = {
  readonly id: string
  readonly name: string
  readonly totalFiles: number
  readonly partitionsTouched: number
  readonly topSharePct: number
  readonly segments: readonly CoverSegment[]
}

type CoverColumn = {
  readonly id: string
  readonly name: string
  readonly totalFiles: number
}

type MatrixRow = {
  readonly partition: PartitionOverview
  readonly coverCount: number
  readonly cells: readonly number[]
}

type CoverMatrix = {
  readonly columns: readonly CoverColumn[]
  readonly rows: readonly MatrixRow[]
  readonly omittedPartitions: number
  readonly maxCount: number
}

export function renderCoverSection(structure: AreaStructureAggregate): string {
  const concentration = buildConcentration(structure)
  const matrix = buildMatrix(structure)

  return `<div class="cover">
  <div class="cover-legend">
    <span><span class="swatch" style="background:var(--apps)"></span>apps</span>
    <span><span class="swatch" style="background:var(--packages)"></span>packages</span>
    <span><span class="swatch" style="background:var(--tools)"></span>tools</span>
  </div>
  <div class="cover-block">
    <h3>Concentration: is the concern owned or homeless?</h3>
    ${renderConcentration(concentration)}
  </div>
  <div class="cover-block">
    <h3>Matrix: files per partition</h3>
    <div class="matrix-wrap">${renderMatrix(matrix)}</div>
    <p class="cover-note">${matrix.omittedPartitions} of ${structure.partitions.length} partitions sit in no cover and are omitted. Bars scale to the global maximum of ${matrix.maxCount} files. A partition in two or more covers is a split candidate.</p>
  </div>
</div>`
}

function buildConcentration(
  structure: AreaStructureAggregate,
): readonly CoverConcentration[] {
  const partitionById = new Map(
    structure.partitions.map((partition) => [partition.id, partition]),
  )

  return structure.covers.map((cover) => {
    const segments = cover.counts
      .filter((count) => count.count > 0)
      .map((count) => {
        const partition = partitionById.get(count.partitionId)
        return {
          name: partition?.name ?? count.partitionId,
          sourceRoot: partition?.sourceRoot ?? "packages",
          count: count.count,
        } satisfies CoverSegment
      })
      .sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name),
      )
    const topCount = segments[0]?.count ?? 0

    return {
      id: cover.id,
      name: cover.name,
      totalFiles: cover.totalFiles,
      partitionsTouched: segments.length,
      topSharePct:
        cover.totalFiles > 0
          ? Math.round((topCount / cover.totalFiles) * 100)
          : 0,
      segments,
    } satisfies CoverConcentration
  })
}

function buildMatrix(structure: AreaStructureAggregate): CoverMatrix {
  const countByCover = new Map(
    structure.covers.map((cover) => [
      cover.id,
      new Map(cover.counts.map((count) => [count.partitionId, count.count])),
    ]),
  )
  const columns = structure.covers.map((cover) => ({
    id: cover.id,
    name: cover.name,
    totalFiles: cover.totalFiles,
  }))
  const rows = structure.partitions
    .map((partition) => {
      const cells = structure.covers.map(
        (cover) => countByCover.get(cover.id)?.get(partition.id) ?? 0,
      )
      return {
        partition,
        coverCount: cells.filter((cell) => cell > 0).length,
        cells,
      } satisfies MatrixRow
    })
    .filter((row) => row.coverCount > 0)
  const maxCount = Math.max(1, ...rows.flatMap((row) => row.cells))

  return {
    columns,
    rows,
    omittedPartitions: structure.partitions.length - rows.length,
    maxCount,
  }
}

function renderConcentration(covers: readonly CoverConcentration[]): string {
  const items = covers
    .map((cover) => {
      const segments = cover.segments
        .map((segment) => renderSegment(segment, cover.totalFiles))
        .join("")
      const stat = `${cover.totalFiles} files · ${cover.partitionsTouched} partitions · top ${cover.topSharePct}%`

      return `<div class="conc-item">
  <div class="conc-head">
    <span class="conc-name">${escapeHtml(cover.name)}</span>
    <span class="conc-stat">${escapeHtml(stat)}</span>
  </div>
  <div class="conc-bar">${segments}</div>
</div>`
    })
    .join("\n")

  return `<div class="conc-list">${items}</div>`
}

function renderSegment(segment: CoverSegment, total: number): string {
  const basis = total > 0 ? (segment.count / total) * 100 : 0
  const sharePct = Math.round(basis)
  const label =
    sharePct >= 22
      ? `${escapeHtml(segment.name)} · ${segment.count}`
      : sharePct >= 8
        ? String(segment.count)
        : ""
  const title = `${segment.name}: ${segment.count} files (${sharePct}%)`

  return `<span class="conc-seg" style="flex-basis:${basis.toFixed(3)}%;background:var(--${segment.sourceRoot})" title="${escapeHtml(title)}">${label}</span>`
}

function renderMatrix(matrix: CoverMatrix): string {
  const headers = matrix.columns
    .map(
      (column) =>
        `<th><span class="cm-cover">${escapeHtml(column.name)}</span><span class="cm-sub">${column.totalFiles} files</span></th>`,
    )
    .join("")
  const rows = matrix.rows
    .map((row) => renderMatrixRow(row, matrix.maxCount))
    .join("\n")

  return `<table class="cover-matrix">
  <thead>
    <tr>
      <th class="cm-part">Partition</th>
      ${headers}
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`
}

function renderMatrixRow(row: MatrixRow, maxCount: number): string {
  const badge =
    row.coverCount >= 2
      ? `<span class="cm-badge hot" title="In ${row.coverCount} covers: split candidate">${row.coverCount}</span>`
      : `<span class="cm-badge" title="In ${row.coverCount} cover">${row.coverCount}</span>`
  const partitionLabel = `${row.partition.name} (${row.partition.id})`
  const cells = row.cells
    .map((cell) => renderMatrixCell(cell, maxCount))
    .join("")

  return `<tr>
  <td class="cm-part">
    <span class="cm-part-inner">
      <span class="swatch" style="background:var(--${row.partition.sourceRoot})"></span>
      <span class="cm-name" title="${escapeHtml(partitionLabel)}">${escapeHtml(row.partition.name)}</span>
      ${badge}
      <span class="cm-lines">${escapeHtml(formatLinesShort(row.partition.lines))}</span>
    </span>
  </td>
  ${cells}
</tr>`
}

function renderMatrixCell(count: number, maxCount: number): string {
  const widthPct = Math.round((count / maxCount) * 100)
  const fill =
    count > 0 ? `<span class="cm-fill" style="width:${widthPct}%"></span>` : ""

  return `<td>
    <span class="cm-cell-inner">
      <span class="cm-track">${fill}</span>
      <span class="cm-num${count > 0 ? "" : " zero"}">${count > 0 ? count : "·"}</span>
    </span>
  </td>`
}
