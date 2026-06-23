import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  type AreaOverviewReport,
  renderAreaOverviewHtml,
} from "../overview-html.js"

describe("overview HTML rendering", () => {
  it("escapes source-derived area text", () => {
    const html = renderAreaOverviewHtml(report())

    assert.match(html, /Renderer &lt;Session&gt;/)
    assert.match(html, /Cover &amp; Runtime/)
    assert.doesNotMatch(html, /Renderer <Session>/)
    assert.doesNotMatch(html, /Cover & Runtime/)
  })
})

function report(): AreaOverviewReport {
  return {
    generatedAt: new Date("2026-06-23T12:00:00Z"),
    freshness: {
      status: "fresh",
      violationCount: 0,
      text: "Area model matches the tracked source inventory.",
    },
    localStamp: {
      status: "clean",
      dirtyPathCount: 0,
      untrackedPathCount: 0,
      text: "Local worktree is clean.",
    },
    structure: {
      inventoryFileCount: 1,
      assignedFileCount: 1,
      totalLines: 12,
      partitions: [
        {
          id: "pkg-renderer-session",
          name: "Renderer <Session>",
          sourceRoot: "packages",
          files: 1,
          lines: 12,
        },
      ],
      roots: [
        { id: "apps", name: "apps", files: 0, lines: 0, partitions: [] },
        {
          id: "packages",
          name: "packages",
          files: 1,
          lines: 12,
          partitions: [
            {
              id: "pkg-renderer-session",
              name: "Renderer <Session>",
              sourceRoot: "packages",
              files: 1,
              lines: 12,
            },
          ],
        },
        { id: "tools", name: "tools", files: 0, lines: 0, partitions: [] },
      ],
      covers: [
        {
          id: "cover-runtime",
          name: "Cover & Runtime",
          totalFiles: 1,
          counts: [{ partitionId: "pkg-renderer-session", count: 1 }],
        },
      ],
      reconciliation: {
        primaryByFile: new Map([
          ["packages/renderer-app/src/session/a.ts", "pkg-renderer-session"],
        ]),
        coversByFile: new Map([
          ["packages/renderer-app/src/session/a.ts", ["cover-runtime"]],
        ]),
        violations: [],
      },
    },
  }
}
