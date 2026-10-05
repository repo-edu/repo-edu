import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { createNodeFileSystemPort } from "../index.js"

function isKnownFailure(error: unknown): boolean {
  return (
    error instanceof CommandOutcomeError &&
    error.outcome.disposition === "completed" &&
    error.outcome.completion.status === "failed" &&
    error.outcome.completion.error.type === "effect" &&
    error.outcome.completion.result === null
  )
}

function isProvenStop(error: unknown): boolean {
  return (
    error instanceof CommandOutcomeError &&
    error.outcome.disposition === "stopped" &&
    error.outcome.result === null
  )
}

describe("createNodeFileSystemPort", () => {
  it("inspects missing files, files, and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const directoryPath = join(root, "repos")
    const filePath = join(root, "README.txt")
    const missingPath = join(root, "missing")

    await mkdir(directoryPath)
    await writeFile(filePath, "repo-edu")

    const fileSystemPort = createNodeFileSystemPort()
    const result = await fileSystemPort.inspect({
      paths: [missingPath, filePath, directoryPath],
    })

    assert.deepStrictEqual(result, [
      { path: missingPath, kind: "missing" },
      { path: filePath, kind: "file" },
      { path: directoryPath, kind: "directory" },
    ])
  })

  it("reports a path it cannot inspect as a known failure, not as missing", async () => {
    const fileSystemPort = createNodeFileSystemPort()

    await assert.rejects(
      fileSystemPort.inspect({ paths: [join(tmpdir(), "invalid\0path")] }),
      isKnownFailure,
    )
  })

  it("reports a stop before an inspection as a proven stop", async () => {
    const fileSystemPort = createNodeFileSystemPort()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      fileSystemPort.inspect({ paths: [tmpdir()], signal: controller.signal }),
      isProvenStop,
    )
  })

  it("applies ensure-directory and delete-path operations in order", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const nestedDirectory = join(root, "repos", "assignment-1")
    const nestedFile = join(nestedDirectory, "notes.txt")

    const fileSystemPort = createNodeFileSystemPort()
    const batchResult = await fileSystemPort.applyBatch({
      operations: [{ kind: "ensure-directory", path: nestedDirectory }],
    })

    await writeFile(nestedFile, "temporary")

    const afterCreate = await fileSystemPort.inspect({
      paths: [nestedDirectory, nestedFile],
    })

    const deleteResult = await fileSystemPort.applyBatch({
      operations: [{ kind: "delete-path", path: join(root, "repos") }],
    })

    const afterDelete = await fileSystemPort.inspect({
      paths: [join(root, "repos"), nestedDirectory, nestedFile],
    })

    assert.deepStrictEqual(batchResult.completed, [
      { kind: "ensure-directory", path: nestedDirectory },
    ])
    assert.deepStrictEqual(afterCreate, [
      { path: nestedDirectory, kind: "directory" },
      { path: nestedFile, kind: "file" },
    ])
    assert.deepStrictEqual(deleteResult.completed, [
      { kind: "delete-path", path: join(root, "repos") },
    ])
    assert.deepStrictEqual(afterDelete, [
      { path: join(root, "repos"), kind: "missing" },
      { path: nestedDirectory, kind: "missing" },
      { path: nestedFile, kind: "missing" },
    ])
  })

  it("reports a failed batch operation as a known failed completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const filePath = join(root, "occupied.txt")
    await writeFile(filePath, "repo-edu")

    const fileSystemPort = createNodeFileSystemPort()

    await assert.rejects(
      fileSystemPort.applyBatch({
        operations: [
          { kind: "ensure-directory", path: join(filePath, "nested") },
        ],
      }),
      isKnownFailure,
    )
  })

  it("reports a copy onto an existing folder as a known failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const source = join(root, "source")
    const destination = join(root, "destination")
    await mkdir(source)
    await writeFile(join(source, "file.txt"), "source")
    await mkdir(destination)
    await writeFile(join(destination, "file.txt"), "kept")

    const fileSystemPort = createNodeFileSystemPort()

    await assert.rejects(
      fileSystemPort.applyBatch({
        operations: [
          {
            kind: "copy-directory",
            sourcePath: source,
            destinationPath: destination,
          },
        ],
      }),
      isKnownFailure,
    )
  })

  it("reports abort before starting a batch as a proven stop", async () => {
    const fileSystemPort = createNodeFileSystemPort()
    const controller = new AbortController()

    controller.abort()

    await assert.rejects(
      fileSystemPort.applyBatch({
        operations: [
          { kind: "ensure-directory", path: join(tmpdir(), "not-used") },
        ],
        signal: controller.signal,
      }),
      isProvenStop,
    )
  })

  it("reports a stop between batch operations as a proven stop", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const first = join(root, "first")
    const second = join(root, "second")
    const controller = new AbortController()
    const fileSystemPort = createNodeFileSystemPort()

    const batch = fileSystemPort.applyBatch({
      operations: [
        { kind: "ensure-directory", path: first },
        { kind: "ensure-directory", path: second },
      ],
      signal: controller.signal,
    })
    controller.abort()

    await assert.rejects(batch, isProvenStop)
    assert.deepStrictEqual(
      await fileSystemPort.inspect({ paths: [first, second] }),
      [
        { path: first, kind: "directory" },
        { path: second, kind: "missing" },
      ],
    )
  })

  it("reports a temporary folder it cannot create as a known failure", async () => {
    const fileSystemPort = createNodeFileSystemPort()

    await assert.rejects(
      fileSystemPort.createTempDirectory(
        join(`repo-edu-missing-${process.pid}-${Date.now()}`, "repo-edu-"),
      ),
      isKnownFailure,
    )
  })
})
