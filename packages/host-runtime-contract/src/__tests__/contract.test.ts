import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  FileSystemBatchOperation,
  FileSystemEntryKind,
  GitCommandPort,
  HttpPort,
  HttpRequest,
  ProcessCancellation,
  ProcessPort,
  UserFilePort,
  UserFileRef,
  UserSaveTargetRef,
} from "../index.js"
import { packageId } from "../index.js"

describe("host-runtime-contract", () => {
  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/host-runtime-contract")
  })

  it("UserFileRef uses the 'user-file-ref' kind discriminator", () => {
    const ref: UserFileRef = {
      kind: "user-file-ref",
      referenceId: "r1",
      displayName: "test.csv",
      mediaType: "text/csv",
      byteLength: 100,
    }
    assert.equal(ref.kind, "user-file-ref")
  })

  it("UserSaveTargetRef uses the 'user-save-target-ref' kind discriminator", () => {
    const ref: UserSaveTargetRef = {
      kind: "user-save-target-ref",
      referenceId: "s1",
      displayName: "export.csv",
      suggestedFormat: "csv",
    }
    assert.equal(ref.kind, "user-save-target-ref")
  })

  it("ProcessCancellation covers all expected modes", () => {
    const modes: ProcessCancellation[] = [
      "non-cancellable",
      "best-effort",
      "cooperative",
    ]
    assert.equal(modes.length, 3)
  })

  it("FileSystemEntryKind covers all expected values", () => {
    const kinds: FileSystemEntryKind[] = ["missing", "file", "directory"]
    assert.equal(kinds.length, 3)
  })

  it("FileSystemBatchOperation covers ensure-directory, copy-directory, and delete-path", () => {
    const ops: FileSystemBatchOperation[] = [
      { kind: "ensure-directory", path: "/tmp/test" },
      {
        kind: "copy-directory",
        sourcePath: "/tmp/a",
        destinationPath: "/tmp/b",
      },
      { kind: "delete-path", path: "/tmp/old" },
    ]
    assert.equal(ops.length, 3)
    assert.equal(ops[0].kind, "ensure-directory")
    assert.equal(ops[1].kind, "copy-directory")
    assert.equal(ops[2].kind, "delete-path")
  })

  it("HttpRequest supports all expected HTTP methods", () => {
    const methods: NonNullable<HttpRequest["method"]>[] = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]
    assert.equal(methods.length, 5)
  })

  it("port interfaces are structurally sound as type-level contracts", () => {
    // These compile-time checks verify port shapes are importable and usable
    const _httpPort: HttpPort = {
      fetch: async () => ({
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
      }),
    }
    const _processPort: ProcessPort = {
      cancellation: "cooperative",
      run: async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }),
    }
    const _gitPort: GitCommandPort = {
      cancellation: "best-effort",
      run: async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }),
    }
    const _userFilePort: UserFilePort = {
      readText: async () => ({
        displayName: "test",
        mediaType: null,
        text: "",
        byteLength: 0,
      }),
      writeText: async () => ({
        displayName: "test",
        mediaType: null,
        byteLength: 0,
        savedAt: new Date().toISOString(),
      }),
    }
    assert.ok(_httpPort)
    assert.ok(_processPort)
    assert.ok(_gitPort)
    assert.ok(_userFilePort)
  })
})
