import * as fs from "node:fs"

import {
  type DependencyGraph,
  isRuntimeDependencyEdge,
} from "./dependency-cruiser-runner.js"
import {
  type ProductProcessLaunch,
  type ProductProcessMechanism,
  productProcessLaunchInventory,
} from "./product-process-launch-inventory.js"
import { collectProcessMechanisms } from "./product-process-launch-syntax.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const PRODUCT_SOURCE_PATTERN = /\.[cm]?[jt]sx?$/
const TEST_SOURCE_PATTERN = /(^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const PRODUCT_APP_ROOT_PATTERN = /^apps\/(?:cli|desktop)\/(?:src|resources)\//
const PACKAGE_SOURCE_PATTERN = /^packages\/([^/]+)\/(?:resources|src)\//
const NON_PRODUCT_PACKAGES = new Set([
  "claude-coder",
  "fixture-engine",
  "integration-tests",
  "test-fixtures",
])
const CODEX_SDK_HOST_ENTRY =
  "packages/integrations-llm/src/codex/sdk-host-entry.ts"
const WINDOWS_LAUNCHER_SOURCE =
  "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs"
const PLATFORM_ADAPTER_SOURCE_PATTERN =
  /^packages\/host-node\/src\/(?:posix|windows)-child-process-lifetime-adapter\.ts$/

const MECHANISM_LABELS: Readonly<Record<ProductProcessMechanism, string>> = {
  "bun-process": "Bun process launch",
  "claude-agent-sdk": "Claude Agent SDK process launch",
  "codex-sdk": "Codex SDK process launch",
  "cross-spawn": "cross-spawn process launch",
  "deno-command": "Deno command launch",
  execa: "Execa process launch",
  "node-child-process": "Node child-process launch",
  "node-cluster": "Node cluster process launch",
}

export function checkProductProcessLaunches(
  root: string,
  worktreePaths: readonly string[],
  graph: DependencyGraph,
): Violation[] {
  const productFiles = worktreePaths.filter(isProductRuntimeSource)
  const mechanismsByFile = new Map<
    string,
    ReadonlySet<ProductProcessMechanism>
  >()

  for (const file of productFiles) {
    mechanismsByFile.set(
      file,
      collectProcessMechanisms(
        fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
        file,
      ),
    )
  }

  const inventoryByKey = new Map(
    productProcessLaunchInventory.map((entry) => [
      inventoryKey(entry.file, entry.mechanism),
      entry,
    ]),
  )
  const violations: Violation[] = []

  for (const [file, mechanisms] of mechanismsByFile) {
    for (const mechanism of mechanisms) {
      if (inventoryByKey.has(inventoryKey(file, mechanism))) continue
      violations.push({
        file,
        message: `${MECHANISM_LABELS[mechanism]} is outside the child-process lifetime launch-owner inventory`,
      })
    }
  }

  for (const entry of productProcessLaunchInventory) {
    const mechanisms = mechanismsByFile.get(entry.file)
    if (mechanisms === undefined) {
      violations.push({
        file: entry.file,
        message: `child-process lifetime launch inventory entry "${entry.id}" points to missing product source`,
      })
      continue
    }
    if (!mechanisms.has(entry.mechanism)) {
      violations.push({
        file: entry.file,
        message: `child-process lifetime launch inventory entry "${entry.id}" no longer uses ${MECHANISM_LABELS[entry.mechanism]}`,
      })
      continue
    }
    violations.push(...checkLaunchOwner(entry, graph))
  }

  return violations
}

function checkLaunchOwner(
  entry: ProductProcessLaunch,
  graph: DependencyGraph,
): Violation[] {
  switch (entry.launchOwner) {
    case "platform-adapter":
      if (
        PLATFORM_ADAPTER_SOURCE_PATTERN.test(entry.file) ||
        entry.file === WINDOWS_LAUNCHER_SOURCE
      ) {
        return []
      }
      return [
        {
          file: entry.file,
          message: `child-process lifetime launch inventory entry "${entry.id}" names a platform-adapter owner outside the platform adapter boundary`,
        },
      ]
    case "codex-sdk-host-process":
      return checkCodexSdkHostOwner(entry, graph)
  }
}

function checkCodexSdkHostOwner(
  entry: ProductProcessLaunch,
  graph: DependencyGraph,
): Violation[] {
  const ownerClosure = runtimeSourceClosure(CODEX_SDK_HOST_ENTRY, graph)
  if (!ownerClosure.has(entry.file)) {
    return [
      {
        file: entry.file,
        message: `child-process lifetime launch inventory entry "${entry.id}" is not reachable from the fixed Codex SDK host entry`,
      },
    ]
  }

  const ownerPath = runtimeAncestorsInside(entry.file, ownerClosure, graph)
  const allSources = new Set(graph.keys())
  const allAncestors = runtimeAncestorsInside(entry.file, allSources, graph)
  return [...allAncestors]
    .filter((source) => isProductionSource(source) && !ownerPath.has(source))
    .sort()
    .map((source) => ({
      file: source,
      message:
        "production source reaches the Codex SDK process launch outside the fixed Codex SDK host entry",
    }))
}

function runtimeSourceClosure(
  entry: string,
  graph: DependencyGraph,
): ReadonlySet<string> {
  const visited = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const source = pending.pop()
    if (source === undefined || visited.has(source)) continue
    visited.add(source)
    for (const edge of graph.get(source) ?? []) {
      if (
        isRuntimeDependencyEdge(edge) &&
        edge.resolved !== undefined &&
        graph.has(edge.resolved)
      ) {
        pending.push(edge.resolved)
      }
    }
  }
  return visited
}

function runtimeAncestorsInside(
  target: string,
  boundary: ReadonlySet<string>,
  graph: DependencyGraph,
): ReadonlySet<string> {
  const ancestors = new Set([target])
  let changed = true
  while (changed) {
    changed = false
    for (const source of boundary) {
      if (ancestors.has(source)) continue
      const reachesAncestor = (graph.get(source) ?? []).some(
        (edge) =>
          isRuntimeDependencyEdge(edge) &&
          edge.resolved !== undefined &&
          ancestors.has(edge.resolved),
      )
      if (reachesAncestor) {
        ancestors.add(source)
        changed = true
      }
    }
  }
  return ancestors
}

function isProductRuntimeSource(file: string): boolean {
  if (!PRODUCT_SOURCE_PATTERN.test(file) || TEST_SOURCE_PATTERN.test(file)) {
    return false
  }
  if (PRODUCT_APP_ROOT_PATTERN.test(file)) return true

  const packageMatch = PACKAGE_SOURCE_PATTERN.exec(file)
  return (
    packageMatch !== null && !NON_PRODUCT_PACKAGES.has(packageMatch[1] ?? "")
  )
}

function isProductionSource(file: string): boolean {
  return !TEST_SOURCE_PATTERN.test(file)
}

function inventoryKey(
  file: string,
  mechanism: ProductProcessMechanism,
): string {
  return `${file}\0${mechanism}`
}
