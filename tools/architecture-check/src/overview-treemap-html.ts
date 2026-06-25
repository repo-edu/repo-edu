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
import { formatLinesShort, formatNumber } from "./overview-format.js"

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

export function renderTreemap(structure: AreaStructureAggregate): string {
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
