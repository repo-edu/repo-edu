import * as fs from "node:fs"

import {
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
    }
  }

  return violations
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

function inventoryKey(
  file: string,
  mechanism: ProductProcessMechanism,
): string {
  return `${file}\0${mechanism}`
}
