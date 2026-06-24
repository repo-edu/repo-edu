import {
  type HierarchyNode,
  type HierarchyRectangularNode,
  hierarchy,
  treemap,
} from "d3-hierarchy"
import { escape as escapeHtml } from "html-escaper"

import type {
  AreaStructureAggregate,
  SourceRootId,
} from "./overview-aggregate.js"
import { renderCoverSection } from "./overview-cover-html.js"
import { renderFilesSection } from "./overview-files-html.js"
import { formatLinesShort } from "./overview-format.js"
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
  readonly kind: "source" | "root" | "package" | "partition"
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
  const coverSection = renderCoverSection(report.structure)
  const filesSection = renderFilesSection(report.structure)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>repo-edu area overview</title>
  <style>
    :root {
      color-scheme: light dark;
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
      --bar: #d9822b;
      --bar-track: #ece6dc;
      --root-frame: rgba(32, 33, 36, 0.35);
      --package-frame: rgba(32, 33, 36, 0.5);
      --rect-stroke: rgba(255, 255, 255, 0.88);
      --th-bg: #f1f4f0;
      --badge-bg: #eef1ec;
      --zero: #a0a7ad;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141414;
        --panel: #1f1f1f;
        --text: #e5e5e5;
        --muted: #a0a0a0;
        --line: #404040;
        --fresh: #22c55e;
        --stale: #f59e0b;
        --dirty: #fb923c;
        --apps: #4c97b5;
        --packages: #6fa55c;
        --tools: #cb6f46;
        --bar: #f59e0b;
        --bar-track: #2e2e2e;
        --root-frame: rgba(229, 229, 229, 0.3);
        --package-frame: rgba(229, 229, 229, 0.45);
        --rect-stroke: rgba(15, 15, 15, 0.5);
        --th-bg: #262626;
        --badge-bg: #333333;
        --zero: #6b6b6b;
      }
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
      stroke: var(--root-frame);
      stroke-width: 1.2;
    }

    .root-label {
      fill: var(--text);
      font-size: 14px;
      font-weight: 720;
    }

    .package-frame {
      fill: transparent;
      stroke: var(--package-frame);
      stroke-width: 1.2;
    }

    .package-label {
      fill: var(--text);
      font-size: 12px;
      font-weight: 700;
    }

    .map-legend {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--muted);
    }

    .map-legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-box {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      flex: none;
    }

    .legend-folder {
      border: 1.4px solid var(--root-frame);
    }

    .legend-package {
      border: 1.4px solid var(--package-frame);
    }

    .legend-label {
      margin-left: 2px;
    }

    .legend-apps {
      background: var(--apps);
      border: 1px solid var(--rect-stroke);
    }

    .legend-packages {
      background: var(--packages);
      border: 1px solid var(--rect-stroke);
    }

    .legend-tools {
      background: var(--tools);
      border: 1px solid var(--rect-stroke);
    }

    .partition-rect {
      stroke: var(--rect-stroke);
      stroke-width: 1;
    }

    .partition-rect.apps {
      fill: var(--apps);
    }

    .partition-rect.packages {
      fill: var(--packages);
    }

    .partition-rect.tools {
      fill: var(--tools);
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

    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex: none;
      display: inline-block;
    }

    .cover {
      display: flex;
      flex-direction: column;
      gap: 26px;
    }

    .cover-legend {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--muted);
    }

    .cover-legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cover-block h3 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .conc-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .conc-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 6px;
    }

    .conc-name {
      font-size: 15px;
      font-weight: 650;
    }

    .conc-stat {
      font-size: 13px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .conc-bar {
      display: flex;
      height: 28px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--line);
    }

    .conc-seg {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: #ffffff;
      font-size: 11px;
      white-space: nowrap;
      border-right: 2px solid var(--panel);
    }

    .conc-seg:last-child {
      border-right: none;
    }

    .matrix-wrap {
      overflow-x: auto;
    }

    .cover-matrix {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
    }

    .cover-matrix th,
    .cover-matrix td {
      border-bottom: 1px solid var(--line);
      padding: 8px 12px;
      vertical-align: middle;
    }

    .cover-matrix thead th {
      text-align: left;
      background: var(--th-bg);
      color: var(--muted);
    }

    .cover-matrix .cm-part {
      width: 42%;
    }

    .cover-matrix .cm-cover {
      display: block;
      font-size: 13px;
      font-weight: 650;
      color: var(--text);
    }

    .cover-matrix .cm-sub {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
    }

    .cm-part-inner {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .cm-name {
      flex: 1 1 auto;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cm-badge {
      flex: none;
      font-size: 11px;
      color: var(--muted);
      background: var(--badge-bg);
      border-radius: 999px;
      padding: 1px 8px;
      font-variant-numeric: tabular-nums;
    }

    .cm-badge.hot {
      color: #ffffff;
      background: var(--bar);
    }

    .cm-lines {
      flex: none;
      min-width: 42px;
      text-align: right;
      font-size: 11px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .cm-cell-inner {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cm-track {
      flex: 1;
      min-width: 36px;
      height: 12px;
      border-radius: 6px;
      background: var(--bar-track);
      overflow: hidden;
    }

    .cm-fill {
      display: block;
      height: 100%;
      border-radius: 6px;
      background: var(--bar);
    }

    .cm-num {
      flex: none;
      width: 22px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .cm-num.zero {
      color: var(--zero);
    }

    .cover-note {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--muted);
    }

    .files {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .files-folder {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
    }

    .files-folder > summary {
      cursor: pointer;
      padding: 9px 12px;
      font-size: 14px;
      font-weight: 700;
    }

    .files-children {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 8px 8px 18px;
    }

    .files-package > summary,
    .files-partition > summary {
      cursor: pointer;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
    }

    .files-partition > summary {
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
    }

    .files-package > summary:hover,
    .files-partition > summary:hover {
      background: var(--th-bg);
    }

    .files-tree {
      margin: 2px 0 8px 20px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted);
      white-space: pre;
      overflow-x: auto;
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
      <h2>Source map</h2>
      <div class="map-legend">
        <span><span class="legend-box legend-folder"></span>source folder</span>
        <span><span class="legend-box legend-package"></span>package</span>
        <span class="legend-label">partition:</span>
        <span><span class="legend-box legend-apps"></span>apps</span>
        <span><span class="legend-box legend-packages"></span>packages</span>
        <span><span class="legend-box legend-tools"></span>tools</span>
      </div>
      <div class="treemap-wrap">${treemapSvg}</div>
    </section>
    <section>
      <h2>Cross-cutting covers</h2>
      ${coverSection}
    </section>
    <section>
      <h2>Files by partition</h2>
      ${filesSection}
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
    kind: "source",
    id: "source",
    name: "source",
    children: structure.roots.map((root) => ({
      kind: "root",
      id: root.id,
      name: root.name,
      sourceRoot: root.id,
      children: root.packages.map((pkg) => ({
        kind: "package",
        id: pkg.id,
        name: pkg.name,
        sourceRoot: pkg.sourceRoot,
        files: pkg.files,
        children: pkg.partitions.map((partition) => ({
          kind: "partition",
          id: partition.id,
          name: partition.name,
          sourceRoot: partition.sourceRoot,
          lines: partition.lines,
          files: partition.files,
        })),
      })),
    })),
  }

  const hierarchyRoot = hierarchy(data)
    .sum((node) => node.lines ?? 0)
    .sort(compareTreemapNodes)
  const layoutRoot = treemap<TreemapDatum>()
    .size([TREEMAP_WIDTH, TREEMAP_HEIGHT])
    .paddingOuter(treemapPaddingOuter)
    .paddingTop(treemapPaddingTop)
    .paddingInner(3)
    .round(true)(hierarchyRoot)

  const nodes = layoutRoot.descendants()
  const rootGroups = nodes
    .filter((node) => node.data.kind === "root")
    .map(renderRootGroup)
    .join("\n")
  const packageGroups = nodes
    .filter(isFramedPackage)
    .map(renderPackageGroup)
    .join("\n")
  const leaves = nodes
    .filter((node) => node.data.kind === "partition")
    .map(renderPartitionLeaf)
    .join("\n")

  return `<svg width="${TREEMAP_WIDTH}" height="${TREEMAP_HEIGHT}" viewBox="0 0 ${TREEMAP_WIDTH} ${TREEMAP_HEIGHT}" role="img" aria-label="Source map">
  ${rootGroups}
  ${packageGroups}
  ${leaves}
</svg>`
}

function isFramedPackage(
  node: HierarchyRectangularNode<TreemapDatum>,
): boolean {
  if (node.data.kind !== "package") return false
  return node.x1 - node.x0 >= 28 && node.y1 - node.y0 >= 28
}

function packageBandHeight(
  node: HierarchyRectangularNode<TreemapDatum>,
): number {
  return node.x1 - node.x0 >= 64 && node.y1 - node.y0 >= 44 ? 18 : 0
}

function treemapPaddingTop(
  node: HierarchyRectangularNode<TreemapDatum>,
): number {
  if (node.data.kind === "source") return 6
  if (node.data.kind === "root") return 26
  if (isFramedPackage(node)) return packageBandHeight(node)
  return 0
}

function treemapPaddingOuter(
  node: HierarchyRectangularNode<TreemapDatum>,
): number {
  if (node.data.kind === "package") return isFramedPackage(node) ? 3 : 0
  return 6
}

function renderRootGroup(node: HierarchyRectangularNode<TreemapDatum>): string {
  const width = Math.max(0, node.x1 - node.x0)
  const height = Math.max(0, node.y1 - node.y0)
  return `<g>
  <rect class="root-frame" x="${node.x0}" y="${node.y0}" width="${width}" height="${height}" rx="4"></rect>
  <text class="root-label" x="${node.x0 + 8}" y="${node.y0 + 18}">${escapeHtml(fitSingleLine(`${node.data.name}/`, width - 2))}</text>
</g>`
}

function renderPackageGroup(
  node: HierarchyRectangularNode<TreemapDatum>,
): string {
  const width = Math.max(0, node.x1 - node.x0)
  const height = Math.max(0, node.y1 - node.y0)
  const partitionCount = node.children?.length ?? 0
  const fileCount =
    node.children?.reduce(
      (total, child) => total + (child.data.files ?? 0),
      0,
    ) ?? 0
  const title = `${node.data.name}/ package: ${formatNumber(
    node.value ?? 0,
  )} lines, ${formatNumber(fileCount)} files, ${partitionCount} ${
    partitionCount === 1 ? "partition" : "partitions"
  }`
  const label =
    packageBandHeight(node) > 0
      ? `<text class="package-label" x="${node.x0 + 7}" y="${node.y0 + 15}">${escapeHtml(fitSingleLine(`${node.data.name}/`, width))}</text>`
      : ""

  return `<g>
  <rect class="package-frame" x="${node.x0}" y="${node.y0}" width="${width}" height="${height}" rx="3">
    <title>${escapeHtml(title)}</title>
  </rect>
  ${label}
</g>`
}

function renderPartitionLeaf(
  node: HierarchyRectangularNode<TreemapDatum>,
): string {
  const width = Math.max(0, node.x1 - node.x0)
  const height = Math.max(0, node.y1 - node.y0)
  const sourceRoot = node.data.sourceRoot ?? "packages"
  const lines = node.data.lines ?? 0
  const packageName = node.parent?.data.name
  const location = packageName ? ` · ${packageName}/` : ""
  const title = `${node.data.name}${location} · ${formatNumber(
    lines,
  )} lines, ${formatNumber(node.data.files ?? 0)} files`
  const showPrimaryLabel = width >= 74 && height >= 38
  const showMetaLabel = width >= 94 && height >= 58
  const innerX = node.x0 + 7
  const maxChars = Math.max(4, Math.floor((width - 14) / 7))
  const maxTitleLines = showMetaLabel
    ? Math.max(1, Math.floor((height - 38) / 14) + 1)
    : Math.max(1, Math.floor((height - 22) / 14) + 1)
  const titleLines = showPrimaryLabel
    ? wrapLabel(node.data.name, maxChars, maxTitleLines)
    : []
  const titleTspans = titleLines
    .map(
      (line, index) =>
        `<tspan x="${innerX}"${index === 0 ? "" : ' dy="14"'}>${escapeHtml(line)}</tspan>`,
    )
    .join("")

  return `<g>
  <rect class="partition-rect ${sourceRoot}" x="${node.x0}" y="${node.y0}" width="${width}" height="${height}" rx="3">
    <title>${escapeHtml(title)}</title>
  </rect>
  ${
    titleTspans
      ? `<text class="partition-label" x="${innerX}" y="${node.y0 + 16}">${titleTspans}</text>`
      : ""
  }
  ${
    showMetaLabel
      ? `<text class="partition-meta" x="${innerX}" y="${node.y1 - 8}">${escapeHtml(formatLinesShort(lines))} lines</text>`
      : ""
  }
</g>`
}

function compareTreemapNodes(
  left: HierarchyNode<TreemapDatum>,
  right: HierarchyNode<TreemapDatum>,
): number {
  const valueDiff = (right.value ?? 0) - (left.value ?? 0)
  if (valueDiff !== 0) return valueDiff
  return left.data.name.localeCompare(right.data.name)
}

function fitSingleLine(text: string, width: number): string {
  const maxChars = Math.max(1, Math.floor((width - 14) / 7))
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`
}

function wrapLabel(
  label: string,
  maxChars: number,
  maxLines: number,
): readonly string[] {
  const words = label.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const piece =
      word.length <= maxChars
        ? word
        : `${word.slice(0, Math.max(1, maxChars - 1))}…`
    const candidate = current ? `${current} ${piece}` : piece
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = piece
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ""
  kept[maxLines - 1] =
    last.length + 1 <= maxChars
      ? `${last}…`
      : `${last.slice(0, Math.max(1, maxChars - 1))}…`
  return kept
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
