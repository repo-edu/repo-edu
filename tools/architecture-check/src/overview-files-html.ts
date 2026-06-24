import { escape as escapeHtml } from "html-escaper"

import type {
  AreaStructureAggregate,
  PackageOverview,
  PartitionOverview,
  SourceRootOverview,
} from "./overview-aggregate.js"
import { formatLinesShort } from "./overview-format.js"

type TreeNode = {
  readonly children: Map<string, TreeNode>
}

export function renderFilesSection(structure: AreaStructureAggregate): string {
  const filesByPartition = new Map<string, string[]>()
  for (const [file, partitionId] of structure.reconciliation.primaryByFile) {
    const list = filesByPartition.get(partitionId) ?? []
    list.push(file)
    filesByPartition.set(partitionId, list)
  }

  const folders = [...structure.roots]
    .sort((left, right) => right.lines - left.lines)
    .map((root) => renderFolder(root, filesByPartition))
    .join("\n")

  return `<div class="files">${folders}</div>`
}

function renderFolder(
  root: SourceRootOverview,
  filesByPartition: ReadonlyMap<string, readonly string[]>,
): string {
  const packages = root.packages
    .map((pkg) => renderPackage(pkg, filesByPartition))
    .join("\n")
  const summary = `${root.name}/ · ${root.packages.length} ${
    root.packages.length === 1 ? "package" : "packages"
  } · ${formatLinesShort(root.lines)} lines`

  return `<details class="files-folder">
  <summary>${escapeHtml(summary)}</summary>
  <div class="files-children">${packages}</div>
</details>`
}

function renderPackage(
  pkg: PackageOverview,
  filesByPartition: ReadonlyMap<string, readonly string[]>,
): string {
  const [onlyPartition] = pkg.partitions
  if (pkg.partitions.length === 1 && onlyPartition) {
    const files = filesByPartition.get(onlyPartition.id) ?? []
    const summary = `${pkg.name}/ · ${onlyPartition.name} · ${files.length} ${
      files.length === 1 ? "file" : "files"
    } · ${formatLinesShort(pkg.lines)} lines`
    return `<details class="files-package">
  <summary>${escapeHtml(summary)}</summary>
  ${renderFileTree(files, pkg.id)}
</details>`
  }

  const partitions = pkg.partitions
    .map((partition) => renderPartition(partition, filesByPartition))
    .join("\n")
  const summary = `${pkg.name}/ · ${pkg.partitions.length} partitions · ${formatLinesShort(
    pkg.lines,
  )} lines`
  return `<details class="files-package">
  <summary>${escapeHtml(summary)}</summary>
  <div class="files-children">${partitions}</div>
</details>`
}

function renderPartition(
  partition: PartitionOverview,
  filesByPartition: ReadonlyMap<string, readonly string[]>,
): string {
  const files = filesByPartition.get(partition.id) ?? []
  const summary = `${partition.name} · ${files.length} ${
    files.length === 1 ? "file" : "files"
  } · ${formatLinesShort(partition.lines)} lines`
  return `<details class="files-partition">
  <summary>${escapeHtml(summary)}</summary>
  ${renderFileTree(files, partition.packageId)}
</details>`
}

function renderFileTree(files: readonly string[], packageId: string): string {
  const prefix = `${packageId}/`
  const root: TreeNode = { children: new Map() }
  for (const file of files) {
    const relative = file.startsWith(prefix) ? file.slice(prefix.length) : file
    let node = root
    for (const segment of relative.split("/")) {
      let child = node.children.get(segment)
      if (!child) {
        child = { children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
  }

  const lines = treeLines(root, "").map(escapeHtml).join("\n")
  return `<pre class="files-tree">${lines}</pre>`
}

function treeLines(node: TreeNode, prefix: string): string[] {
  const entries = [...node.children.entries()].sort((left, right) => {
    const leftIsDir = left[1].children.size > 0
    const rightIsDir = right[1].children.size > 0
    if (leftIsDir !== rightIsDir) return leftIsDir ? -1 : 1
    return left[0].localeCompare(right[0])
  })

  const lines: string[] = []
  entries.forEach(([name, child], index) => {
    const last = index === entries.length - 1
    const isDir = child.children.size > 0
    lines.push(`${prefix}${last ? "└── " : "├── "}${name}${isDir ? "/" : ""}`)
    if (isDir) {
      lines.push(...treeLines(child, `${prefix}${last ? "    " : "│   "}`))
    }
  })
  return lines
}
