import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createNodeFileSystemPort } from "../index.js"

describe("createNodeFileSystemPort (extended)", () => {
  it("copy-directory copies a directory recursively", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const source = join(root, "source")
    const destination = join(root, "destination")

    await mkdir(source, { recursive: true })
    await writeFile(join(source, "file.txt"), "content")
    await mkdir(join(source, "subdir"))
    await writeFile(join(source, "subdir", "nested.txt"), "nested content")

    const fs = createNodeFileSystemPort()
    const result = await fs.applyBatch({
      operations: [
        {
          kind: "copy-directory",
          sourcePath: source,
          destinationPath: destination,
        },
      ],
    })

    assert.equal(result.completed.length, 1)
    assert.equal(result.completed[0].kind, "copy-directory")

    const inspection = await fs.inspect({
      paths: [
        join(destination, "file.txt"),
        join(destination, "subdir", "nested.txt"),
      ],
    })

    assert.equal(inspection[0].kind, "file")
    assert.equal(inspection[1].kind, "file")
  })

  it("createTempDirectory creates a temporary directory with the given prefix", async () => {
    const fs = createNodeFileSystemPort()
    const tempDir = await fs.createTempDirectory("repo-edu-test-")

    const inspection = await fs.inspect({ paths: [tempDir] })
    assert.equal(inspection[0].kind, "directory")
    assert.ok(tempDir.includes("repo-edu-test-"))
  })

  it("inspect checks abort before processing", async () => {
    const fs = createNodeFileSystemPort()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      fs.inspect({ paths: ["/tmp/anything"], signal: controller.signal }),
      /Operation cancelled/,
    )
  })
})
