import { escape as escapeHtml } from "html-escaper"

import type { AreaStructureAggregate } from "./overview-aggregate.js"
import { renderCoverSection } from "./overview-cover-html.js"
import { renderFilesSection } from "./overview-files-html.js"
import { formatNumber } from "./overview-format.js"
import type {
  LocalGitStamp,
  ReconciliationFreshnessClaim,
} from "./overview-freshness.js"
import { areaOverviewStyles } from "./overview-styles.js"
import { renderTreemap } from "./overview-treemap-html.js"

export type AreaOverviewReport = {
  readonly generatedAt: Date
  readonly structure: AreaStructureAggregate
  readonly freshness: ReconciliationFreshnessClaim
  readonly localStamp: LocalGitStamp
}

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
${areaOverviewStyles}
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

function formatDate(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC")
}
