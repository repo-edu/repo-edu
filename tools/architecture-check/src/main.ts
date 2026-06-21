import { pathToFileURL } from "node:url"

import {
  compileAreaModel,
  loadAreaModel,
  reconcileAreaModel,
} from "./area-model.js"
import { runBespokeChecks } from "./bespoke-checks.js"
import { readRedesignDensityReport } from "./density.js"
import { runDependencyCruiserRules } from "./dependency-cruiser-runner.js"
import { buildDependencyCruiserRuleSet } from "./graph-policy.js"
import { readSourceInventory } from "./inventory.js"
import { ROOT } from "./repo-paths.js"
import { compareViolations, type Violation } from "./violations.js"

export async function runArchitectureCheck(root = ROOT): Promise<{
  readonly violations: readonly Violation[]
  readonly densityWarnings: readonly string[]
}> {
  const inventory = readSourceInventory(root)
  const areaModel = compileAreaModel(loadAreaModel(root))
  const reconciliation = reconcileAreaModel(areaModel, inventory)
  const graphPolicy = buildDependencyCruiserRuleSet(areaModel, inventory)
  const [graphViolations, bespokeViolations] = await Promise.all([
    runDependencyCruiserRules(root, inventory, graphPolicy),
    Promise.resolve(runBespokeChecks(root, inventory)),
  ])
  const density = readRedesignDensityReport(root, areaModel)

  return {
    violations: [
      ...reconciliation.violations,
      ...graphViolations,
      ...bespokeViolations,
      ...density.violations,
    ].sort(compareViolations),
    densityWarnings: density.warnings,
  }
}

async function main(): Promise<void> {
  const result = await runArchitectureCheck()

  if (result.densityWarnings.length > 0) {
    console.log("\nRedesign-density report, last 10 commits:")
    for (const warning of result.densityWarnings) {
      console.log(`  ${warning}`)
    }
  }

  if (result.violations.length > 0) {
    console.error(`\n${result.violations.length} architecture violation(s):`)
    for (const violation of result.violations) {
      console.error(`  ${violation.file}: ${violation.message}`)
    }
    process.exit(1)
  }

  console.log("\nArchitecture check passed")
}

export function isMainModule(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href
}

if (isMainModule(import.meta.url, process.argv[1])) {
  void main()
}
