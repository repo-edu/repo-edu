import {
  type DependencyGraph,
  isRuntimeDependencyEdge,
} from "./dependency-cruiser-runner.js"
import type { SourceInventory } from "./inventory.js"

const TEST_SOURCE_PATTERN = /(^|\/)__tests__\/|\.test\.tsx?$/

export type RuntimeTestSourceImport = {
  readonly from: string
  readonly to: string
}

export type RuntimeSourceClosure = {
  readonly files: ReadonlySet<string>
  readonly testSourceImports: readonly RuntimeTestSourceImport[]
}

export function collectRuntimeSourceClosure(
  entries: readonly string[],
  inventory: SourceInventory,
  graph: DependencyGraph,
): RuntimeSourceClosure {
  const files = new Set<string>()
  const testSourceImports: RuntimeTestSourceImport[] = []
  const testImportKeys = new Set<string>()
  const pending = [...entries]

  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || files.has(file) || !inventory.fileSet.has(file)) {
      continue
    }
    files.add(file)
    for (const edge of graph.get(file) ?? []) {
      if (
        !isRuntimeDependencyEdge(edge) ||
        edge.resolved === undefined ||
        !inventory.fileSet.has(edge.resolved) ||
        files.has(edge.resolved)
      ) {
        continue
      }
      if (!isProductionSource(edge.resolved)) {
        const key = `${file}\0${edge.resolved}`
        if (!testImportKeys.has(key)) {
          testImportKeys.add(key)
          testSourceImports.push({ from: file, to: edge.resolved })
        }
        continue
      }
      pending.push(edge.resolved)
    }
  }

  return { files, testSourceImports }
}

export function isProductionSource(file: string): boolean {
  return !TEST_SOURCE_PATTERN.test(file)
}
