import assert from "node:assert/strict"
import { mkdir, mkdtemp, readlink, symlink, writeFile } from "node:fs/promises"
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

  it("copy-directory keeps a relative link unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const source = join(root, "source")
    const destination = join(root, "destination")
    await mkdir(join(source, "subdir"), { recursive: true })
    await writeFile(join(source, "file.txt"), "content")
    await symlink(join("..", "file.txt"), join(source, "subdir", "link"))

    const fs = createNodeFileSystemPort()
    await fs.applyBatch({
      operations: [
        {
          kind: "copy-directory",
          sourcePath: source,
          destinationPath: destination,
        },
      ],
    })

    assert.equal(
      await readlink(join(destination, "subdir", "link")),
      await readlink(join(source, "subdir", "link")),
    )
  })

  it("createTempDirectory creates a temporary directory with the given prefix", async () => {
    const fs = createNodeFileSystemPort()
    const tempDir = await fs.createTempDirectory("repo-edu-test-")

    const inspection = await fs.inspect({ paths: [tempDir] })
    assert.equal(inspection[0].kind, "directory")
    assert.ok(tempDir.includes("repo-edu-test-"))
  })

  it("lists files with case-insensitive final suffix filters", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    await mkdir(join(root, "src"), { recursive: true })
    await writeFile(join(root, "src", "main.TS"), "content")
    await writeFile(join(root, "src", "notes.md"), "notes")

    const fs = createNodeFileSystemPort()
    const result = await fs.listFiles({
      rootPath: root,
      extensions: ["ts"],
    })

    assert.deepStrictEqual(result, [
      { relativePath: "src/main.TS", size: "content".length },
    ])
  })

  it("reads files only when the real path stays inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const outside = await mkdtemp(join(tmpdir(), "repo-edu-host-node-out-"))
    await writeFile(join(root, "main.ts"), "const ok = true\n")
    await writeFile(join(outside, "escape.ts"), "const bad = true\n")
    await symlink(join(outside, "escape.ts"), join(root, "escape.ts"))

    const fs = createNodeFileSystemPort()
    const result = await fs.readFileInsideRoot({
      rootPath: root,
      relativePath: "main.ts",
      maxBytes: 64 * 1024,
    })

    assert.equal(new TextDecoder().decode(result.bytes), "const ok = true\n")
    await assert.rejects(
      fs.readFileInsideRoot({
        rootPath: root,
        relativePath: "escape.ts",
        maxBytes: 64 * 1024,
      }),
      /outside the submission folder/,
    )
  })

  it("allows in-root filenames that start with two dots", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    await writeFile(join(root, "..solution.ts"), "const ok = true\n")

    const fs = createNodeFileSystemPort()
    const result = await fs.readFileInsideRoot({
      rootPath: root,
      relativePath: "..solution.ts",
      maxBytes: 64 * 1024,
    })

    assert.equal(new TextDecoder().decode(result.bytes), "const ok = true\n")
  })
})
