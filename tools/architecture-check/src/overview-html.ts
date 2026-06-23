import {
  type HierarchyNode,
  type HierarchyRectangularNode,
  hierarchy,
  treemap,
} from "d3-hierarchy"
import { escape as escapeHtmlEntity } from "html-escaper"

import type {
  AreaStructureAggregate,
  PartitionOverview,
  SourceRootId,
} from "./overview-aggregate.js"
import type {
  LocalGitStamp,
  ReconciliationFreshnessClaim,
} from "./overview-freshness.js"

export type AreaOverviewReport = {
  readonly generatedAt: Date
  readonly structure: AreaStructureAggregate
  readonly freshness: ReconciliationFreshnessClaim
  readonly localStamp: LocalGitStamp
}

type TreemapDatum = {
  readonly id: string
  readonly name: string
  readonly sourceRoot?: SourceRootId
  readonly files?: number
  readonly lines?: number
  readonly children?: readonly TreemapDatum[]
}

const TREEMAP_WIDTH = 1180
const TREEMAP_HEIGHT = 640
const numberFormatter = new Intl.NumberFormat("en-US")

export function renderAreaOverviewHtml(report: AreaOverviewReport): string {
  const treemapSvg = renderTreemap(report.structure)
  const matrix = renderCoverMatrix(report.structure)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>repo-edu area overview</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8f5;
      --panel: #ffffff;
      --text: #202124;
      --muted: #626b73;
      --line: #d7ddd6;
      --fresh: #1f8a4c;
      --stale: #b7791f;
      --dirty: #b45309;
      --apps: #3b82a0;
      --packages: #5b8f49;
      --tools: #b25f3c;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 28px 44px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 22px;
    }

    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      font-weight: 720;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      line-height: 1.2;
    }

    .meta {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }

    .banner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 22px;
    }

    .claim,
    section {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
    }

    .claim {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: start;
      padding: 14px 16px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      margin-top: 5px;
      border-radius: 999px;
      background: var(--fresh);
    }

    .status-dot.stale {
      background: var(--stale);
    }

    .status-dot.dirty {
      background: var(--dirty);
    }

    .claim-title {
      margin: 0 0 4px;
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
    }

    .claim-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.35;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }

    .stat {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 12px 14px;
    }

    .stat-label {
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 13px;
    }

    .stat-value {
      margin: 0;
      font-size: 24px;
      line-height: 1;
      font-weight: 720;
    }

    section {
      padding: 18px;
      margin-bottom: 22px;
      overflow: hidden;
    }

    .treemap-wrap {
      width: 100%;
      overflow-x: auto;
    }

    svg {
      display: block;
      max-width: 100%;
      height: auto;
      font-family: inherit;
    }

    .root-frame {
      fill: transparent;
      stroke: rgba(32, 33, 36, 0.35);
      stroke-width: 1.2;
    }

    .root-label {
      fill: #202124;
      font-size: 14px;
      font-weight: 720;
    }

    .partition-rect {
      stroke: rgba(255, 255, 255, 0.88);
      stroke-width: 1;
    }

    .partition-label {
      fill: #ffffff;
      font-size: 12px;
      font-weight: 700;
      pointer-events: none;
    }

    .partition-meta {
      fill: rgba(255, 255, 255, 0.9);
      font-size: 11px;
      pointer-events: none;
    }

    .matrix-wrap {
      overflow-x: auto;
    }

    table {
      border-collapse: collapse;
      min-width: 1040px;
      width: 100%;
      font-size: 12px;
    }

    th,
    td {
      border: 1px solid var(--line);
      padding: 7px 8px;
      text-align: right;
      white-space: nowrap;
    }

    th {
      color: var(--muted);
      font-weight: 650;
      background: #f1f4f0;
    }

    th:first-child,
    td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      min-width: 220px;
      text-align: left;
      background: #f8faf7;
    }

    td.zero {
      color: #a0a7ad;
      background: #fbfcfa;
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 820px) {
      main {
        padding: 22px 16px 32px;
      }

      header,
      .banner,
      .stats {
        grid-template-columns: 1fr;
        display: grid;
      }

      .meta {
        text-align: left;
        white-space: normal;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>repo-edu area overview</h1>
      </div>
      <div class="meta">Generated ${escapeHtml(formatDate(report.generatedAt))}</div>
    </header>
    <div class="banner">
      ${renderClaim("Tracked inventory", report.freshness.status, report.freshness.text)}
      ${renderClaim("Local worktree", report.localStamp.status, report.localStamp.text)}
    </div>
    <div class="stats">
      ${renderStat("Inventory files", report.structure.inventoryFileCount)}
      ${renderStat("Assigned files", report.structure.assignedFileCount)}
      ${renderStat("Total lines", report.structure.totalLines)}
      ${renderStat("Partitions", report.structure.partitions.length)}
    </div>
    <section>
      <h2>Partition treemap</h2>
      <div class="treemap-wrap">${treemapSvg}</div>
    </section>
    <section>
      <h2>Cover matrix</h2>
      <div class="matrix-wrap">${matrix}</div>
    </section>
  </main>
</body>
</html>`
}

function renderClaim(
  title: string,
  status: "fresh" | "stale" | "clean" | "dirty",
  text: string,
): string {
  const statusClass =
    status === "fresh" || status === "clean" ? "" : ` ${status}`
  return `<div class="claim">
  <div class="status-dot${statusClass}"></div>
  <div>
    <p class="claim-title">${escapeHtml(title)}</p>
    <p class="claim-text">${escapeHtml(text)}</p>
  </div>
</div>`
}

function renderStat(label: string, value: number): string {
  return `<div class="stat">
  <p class="stat-label">${escapeHtml(label)}</p>
  <p class="stat-value">${formatNumber(value)}</p>
</div>`
}

function renderTreemap(structure: AreaStructureAggregate): string {
  const data: TreemapDatum = {
    id: "source",
    name: "source",
    children: structure.roots.map((root) => ({
      id: root.id,
      name: root.name,
      sourceRoot: root.id,
      children: root.partitions.map((partition) => ({
        id: partition.id,
        name: partition.name,
        sourceRoot: partition.sourceRoot,
        lines: partition.lines,
        files: partition.files,
      })),
    })),
  }

  const hierarchyRoot = hierarchy(data)
    .sum((node) => node.lines ?? 0)
    .sort(compareTreemapNodes)
  const layoutRoot = treemap<TreemapDatum>()
    .size([TREEMAP_WIDTH, TREEMAP_HEIGHT])
    .paddingOuter(6)
    .paddingTop(26)
    .paddingInner(3)
    .round(true)(hierarchyRoot)

  const groups = layoutRoot.children
    ?.map((node) => renderRootGroup(node))
    .join("\n")
  const leaves = layoutRoot.leaves().map(renderPartitionLeaf).join("\n")

  return `<svg viewBox="0 0 ${TREEMAP_WIDTH} ${TREEMAP_HEIGHT}" role="img" aria-label="Partition treemap">
  ${groups ?? ""}
  ${leaves}
</svg>`
}

function renderRootGroup(node: HierarchyRectangularNode<TreemapDatum>): string {
  const width = Math.max(0, node.x1 - node.x0)
  const height = Math.max(0, node.y1 - node.y0)
  return `<g>
  <rect class="root-frame" x="${node.x0}" y="${node.y0}" width="${width}" height="${height}" rx="4"></rect>
  <text class="root-label" x="${node.x0 + 8}" y="${node.y0 + 18}">${escapeHtml(node.data.name)}</text>
</g>`
}

function renderPartitionLeaf(
  node: HierarchyRectangularNode<TreemapDatum>,
): string {
  const width = Math.max(0, node.x1 - node.x0)
  const height = Math.max(0, node.y1 - node.y0)
  const sourceRoot = node.data.sourceRoot ?? "packages"
  const color = partitionColor(sourceRoot)
  const title = `${node.data.name} (${node.data.id}): ${formatNumber(
    node.data.lines ?? 0,
  )} lines, ${formatNumber(node.data.files ?? 0)} files`
  const showPrimaryLabel = width >= 74 && height >= 38
  const showMetaLabel = width >= 94 && height >= 58
  const label = fitLabel(node.data.name, width)

  return `<g>
  <rect class="partition-rect" x="${node.x0}" y="${node.y0}" width="${width}" height="${height}" rx="3" fill="${color}">
    <title>${escapeHtml(title)}</title>
  </rect>
  ${
    showPrimaryLabel
      ? `<text class="partition-label" x="${node.x0 + 7}" y="${node.y0 + 18}">${escapeHtml(label)}</text>`
      : ""
  }
  ${
    showMetaLabel
      ? `<text class="partition-meta" x="${node.x0 + 7}" y="${node.y0 + 34}">${formatNumber(node.data.lines ?? 0)} lines</text>`
      : ""
  }
</g>`
}

function renderCoverMatrix(structure: AreaStructureAggregate): string {
  const partitionById = new Map(
    structure.partitions.map((partition) => [partition.id, partition]),
  )
  const headers = structure.partitions
    .map(
      (partition) =>
        `<th title="${escapeHtml(partition.name)}">${escapeHtml(shortPartitionLabel(partition))}</th>`,
    )
    .join("")
  const rows = structure.covers
    .map((cover) => {
      const cells = cover.counts
        .map((count) => {
          const partition = partitionById.get(count.partitionId)
          const title = `${cover.name} in ${partition?.name ?? count.partitionId}`
          return `<td class="${count.count === 0 ? "zero" : ""}" title="${escapeHtml(title)}">${formatNumber(count.count)}</td>`
        })
        .join("")
      return `<tr>
  <td>${escapeHtml(cover.name)} <span class="muted">(${formatNumber(cover.totalFiles)})</span></td>
  ${cells}
</tr>`
    })
    .join("\n")

  return `<table>
  <thead>
    <tr>
      <th>Cover</th>
      ${headers}
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`
}

function compareTreemapNodes(
  left: HierarchyNode<TreemapDatum>,
  right: HierarchyNode<TreemapDatum>,
): number {
  const valueDiff = (right.value ?? 0) - (left.value ?? 0)
  if (valueDiff !== 0) return valueDiff
  return left.data.name.localeCompare(right.data.name)
}

function partitionColor(sourceRoot: SourceRootId): string {
  if (sourceRoot === "apps") return "#3b82a0"
  if (sourceRoot === "tools") return "#b25f3c"
  return "#5b8f49"
}

function shortPartitionLabel(partition: PartitionOverview): string {
  return partition.id.replace(/^(app|pkg|tool)-/, "")
}

function fitLabel(label: string, width: number): string {
  const maxChars = Math.max(4, Math.floor((width - 14) / 7))
  if (label.length <= maxChars) return label
  return `${label.slice(0, Math.max(1, maxChars - 1))}...`
}

function formatDate(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC")
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function escapeHtml(value: string): string {
  return escapeHtmlEntity(value)
}
