import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { createNodeFileSystemPort } from "../index.js"

describe("createNodeFileSystemPort", () => {
  it("inspects missing files, files, and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const directoryPath = join(root, "repos")
    const filePath = join(root, "README.txt")
    const missingPath = join(root, "missing")

    await writeFile(filePath, "repo-edu")

    const fileSystemPort = createNodeFileSystemPort()
    const result = await fileSystemPort.inspect({
      paths: [missingPath, filePath, directoryPath],
    })

    assert.deepStrictEqual(result, [
      { path: missingPath, kind: "missing" },
      { path: filePath, kind: "file" },
      { path: directoryPath, kind: "missing" },
    ])
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
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "completed" &&
        error.outcome.completion.status === "failed" &&
        error.outcome.completion.error.type === "effect" &&
        error.outcome.completion.result === null,
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
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "stopped" &&
        error.outcome.result === null,
    )
  })
})
