import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { workflowCatalog } from "@repo-edu/application-contract"
import { createDocsDemoRuntime } from "../demo-runtime.js"

const repoRoot = resolve(import.meta.dirname, "../../../..")
const appSourceRoot = resolve(repoRoot, "packages/app/src")
const appWorkflowPattern = /\.run\(\s*["']([a-z][a-zA-Z0-9.-]+)["']/g
async function listSourceFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = join(rootDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(absolutePath)))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      continue
    }
    if (absolutePath.includes("/__tests__/")) {
      continue
    }
    files.push(absolutePath)
  }
  return files
}
async function collectAppWorkflowIds() {
  const files = await listSourceFiles(appSourceRoot)
  const workflowIds = new Set()
  for (const file of files) {
    const source = await readFile(file, "utf8")
    for (const match of source.matchAll(appWorkflowPattern)) {
      workflowIds.add(match[1])
    }
  }
  return [...workflowIds].sort()
}
describe("docs workflow alignment", () => {
  it("exposes every workflow that is marked docs-deliverable in workflowCatalog", () => {
    const runtime = createDocsDemoRuntime()
    const actual = Object.keys(runtime.workflowHandlers).sort()
    const expected = Object.entries(workflowCatalog)
      .filter(([, metadata]) => metadata.delivery.includes("docs"))
      .map(([workflowId]) => workflowId)
      .sort()
    assert.deepEqual(actual, expected)
  })
  it("covers every workflow id invoked by packages/app runtime code", async () => {
    const runtime = createDocsDemoRuntime()
    const docsWorkflowIds = new Set(Object.keys(runtime.workflowHandlers))
    const appWorkflowIds = await collectAppWorkflowIds()
    assert.ok(appWorkflowIds.length > 0, "Expected app runtime workflow usage.")
    for (const workflowId of appWorkflowIds) {
      assert.equal(
        Object.hasOwn(workflowCatalog, workflowId),
        true,
        `Unknown workflow id used by app runtime: ${workflowId}`,
      )
      const metadata = workflowCatalog[workflowId]
      assert.equal(
        metadata.delivery.includes("docs"),
        true,
        `App runtime workflow '${workflowId}' must be docs-deliverable.`,
      )
      assert.equal(
        docsWorkflowIds.has(workflowId),
        true,
        `Docs runtime is missing handler for app workflow '${workflowId}'.`,
      )
    }
  })
})
