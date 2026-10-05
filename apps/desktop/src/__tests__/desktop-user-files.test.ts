import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { createDesktopUserFiles } from "../desktop-user-files"

function isDisposition(
  disposition: "refused" | "stopped",
  message?: RegExp,
): (error: unknown) => boolean {
  return (error) =>
    error instanceof CommandOutcomeError &&
    error.outcome.disposition === disposition &&
    (message === undefined || message.test(error.message))
}

async function withFolder(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), "repo-edu-desktop-user-files-"))
  try {
    await run(folder)
  } finally {
    await rm(folder, { force: true, recursive: true })
  }
}

describe("desktop user-file port", () => {
  it("reads a picked file as UTF-8 text", async () => {
    await withFolder(async (folder) => {
      const path = join(folder, "roster.csv")
      await writeFile(path, "name\nMüller\n", "utf8")
      const userFiles = createDesktopUserFiles()

      const read = await userFiles.userFilePort.readText(
        await userFiles.registerReadable(path),
      )

      assert.deepEqual(read, {
        displayName: "roster.csv",
        mediaType: "text/csv",
        byteLength: Buffer.byteLength("name\nMüller\n"),
        text: "name\nMüller\n",
      })
    })
  })

  it("refuses a read that cannot give the file's text", async () => {
    await withFolder(async (folder) => {
      const removed = join(folder, "removed.csv")
      const latin1 = join(folder, "latin1.csv")
      await writeFile(removed, "name\n")
      await writeFile(latin1, Buffer.from("name\nM\xfcller\n", "latin1"))
      const userFiles = createDesktopUserFiles()
      const removedReference = await userFiles.registerReadable(removed)
      await rm(removed)

      await assert.rejects(
        userFiles.userFilePort.readText({
          ...removedReference,
          referenceId: "unknown",
        }),
        isDisposition("refused", /Unknown user-file reference/),
      )
      await assert.rejects(
        userFiles.userFilePort.readText(removedReference),
        isDisposition("refused"),
      )
      // Replacement characters would turn the import into altered names.
      await assert.rejects(
        userFiles.userFilePort.readText(
          await userFiles.registerReadable(latin1),
        ),
        isDisposition("refused", /latin1\.csv is not UTF-8 text/),
      )
    })
  })

  it("reports a stop before or during a read as a proven stop", async () => {
    await withFolder(async (folder) => {
      const path = join(folder, "roster.csv")
      await writeFile(path, "name\n")
      const userFiles = createDesktopUserFiles()
      const reference = await userFiles.registerReadable(path)
      const before = new AbortController()
      before.abort()
      const during = new AbortController()

      await assert.rejects(
        userFiles.userFilePort.readText(reference, before.signal),
        isDisposition("stopped"),
      )
      const read = userFiles.userFilePort.readText(reference, during.signal)
      during.abort()
      await assert.rejects(read, isDisposition("stopped"))
    })
  })

  it("writes text to a picked save target", async () => {
    await withFolder(async (folder) => {
      const path = join(folder, "export", "roster.csv")
      const userFiles = createDesktopUserFiles()

      const receipt = await userFiles.userFilePort.writeText(
        userFiles.registerWritable(path, "csv"),
        "name\nMüller\n",
      )

      assert.equal(await readFile(path, "utf8"), "name\nMüller\n")
      assert.equal(receipt.displayName, "roster.csv")
      assert.equal(receipt.mediaType, "text/csv")
      assert.equal(receipt.byteLength, Buffer.byteLength("name\nMüller\n"))
    })
  })

  it("refuses an unknown save target and reports a stop before the write", async () => {
    await withFolder(async (folder) => {
      const path = join(folder, "roster.csv")
      const userFiles = createDesktopUserFiles()
      const target = userFiles.registerWritable(path, "csv")
      const stop = new AbortController()
      stop.abort()

      await assert.rejects(
        userFiles.userFilePort.writeText(
          { ...target, referenceId: "unknown" },
          "x",
        ),
        isDisposition("refused", /Unknown save-target reference/),
      )
      await assert.rejects(
        userFiles.userFilePort.writeText(target, "x", stop.signal),
        isDisposition("stopped"),
      )
      await assert.rejects(readFile(path), { code: "ENOENT" })
    })
  })

  it("reports a failed write as a known failure", async () => {
    await withFolder(async (folder) => {
      const occupied = join(folder, "occupied.csv")
      await mkdir(occupied)
      const userFiles = createDesktopUserFiles()

      await assert.rejects(
        userFiles.userFilePort.writeText(
          userFiles.registerWritable(occupied, "csv"),
          "x",
        ),
        (error: unknown) =>
          error instanceof CommandOutcomeError &&
          error.outcome.disposition === "completed" &&
          error.outcome.completion.status === "failed" &&
          error.outcome.completion.result === null &&
          /Could not write occupied\.csv; the file may be incomplete\./.test(
            error.message,
          ),
      )
    })
  })
})
