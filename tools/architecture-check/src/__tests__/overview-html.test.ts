import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildAreaOverviewReport } from "../overview.js"
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

  it("renders the treemap at its intended intrinsic size", () => {
    const html = renderAreaOverviewHtml(report())

    assert.match(html, /<svg width="1180" height="640" viewBox="0 0 1180 640"/)
  })

  it("fits each wrapped treemap label line inside its width budget", () => {
    const html = renderAreaOverviewHtml(buildAreaOverviewReport())
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"))
    const groups = svg.matchAll(/<g>\n([\s\S]*?)\n<\/g>/g)

    for (const group of groups) {
      const content = group[1]
      if (!content.includes('class="partition-rect"')) continue

      const widthMatch = /width="([^"]+)"/.exec(content)
      const labelMatch =
        /<text class="partition-label"[^>]*>([\s\S]*?)<\/text>/.exec(content)
      if (!widthMatch || !labelMatch) continue

      const width = Number(widthMatch[1])
      const maxChars = Math.max(4, Math.floor((width - 14) / 7))
      const lines = [...labelMatch[1].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)]
      assert.ok(
        lines.length > 0,
        "Expected a labelled leaf to wrap into lines.",
      )
      for (const line of lines) {
        const text = line[1]
        assert.ok(
          text.length <= maxChars,
          `Expected "${text}" to fit ${maxChars} chars within ${width}px.`,
        )
      }
    }
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
