import { pathToFileURL } from "node:url"

import { buildAreaStructureAggregate } from "./overview-aggregate.js"
import { serveAreaOverviewOnce } from "./overview-delivery.js"
import {
  createReconciliationFreshnessClaim,
  readLocalGitStamp,
} from "./overview-freshness.js"
import {
  type AreaOverviewReport,
  renderAreaOverviewHtml,
} from "./overview-html.js"
import { ROOT } from "./repo-paths.js"

export function buildAreaOverviewReport(root = ROOT): AreaOverviewReport {
  const structure = buildAreaStructureAggregate(root)
  return {
    generatedAt: new Date(),
    structure,
    freshness: createReconciliationFreshnessClaim(structure.reconciliation),
    localStamp: readLocalGitStamp(root),
  }
}

async function main(): Promise<void> {
  const report = buildAreaOverviewReport()
  const html = renderAreaOverviewHtml(report)
  const served = await serveAreaOverviewOnce(html)
  console.log(`Area overview opened at ${served.url}`)
}

function isMainModule(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href
}

if (isMainModule(import.meta.url, process.argv[1])) {
  void main()
}
