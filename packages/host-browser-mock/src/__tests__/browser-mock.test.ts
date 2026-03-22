import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type BrowserMockReadableFileSeed,
  createBrowserMockHostEnvironment,
} from "../index.js"

describe("createBrowserMockHostEnvironment", () => {
  describe("UserFilePort.readText", () => {
    it("reads a seeded file by referenceId", async () => {
      const env = createBrowserMockHostEnvironment()
      const result = await env.userFilePort.readText({
        kind: "user-file-ref",
        referenceId: "seed-students",
        displayName: "students.csv",
        mediaType: "text/csv",
        byteLength: null,
      })

      assert.equal(result.displayName, "students.csv")
      assert.equal(result.mediaType, "text/csv")
      assert.ok(result.text.includes("student_id"))
      assert.ok(result.byteLength > 0)
    })

    it("throws for missing referenceId", async () => {
      const env = createBrowserMockHostEnvironment()
      await assert.rejects(
        () =>
          env.userFilePort.readText({
            kind: "user-file-ref",
            referenceId: "nonexistent",
            displayName: "missing.csv",
            mediaType: null,
            byteLength: null,
          }),
        /User file not found/,
      )
    })

    it("throws when signal is already aborted", async () => {
      const env = createBrowserMockHostEnvironment()
      const controller = new AbortController()
      controller.abort()

      await assert.rejects(
        () =>
          env.userFilePort.readText(
            {
              kind: "user-file-ref",
              referenceId: "seed-students",
              displayName: "students.csv",
              mediaType: "text/csv",
              byteLength: null,
            },
            controller.signal,
          ),
        /Operation cancelled/,
      )
    })

    it("accepts custom readable files", async () => {
      const seeds: BrowserMockReadableFileSeed[] = [
        {
          referenceId: "custom-1",
          displayName: "custom.json",
          mediaType: "application/json",
          text: '{"key":"value"}',
        },
      ]
      const env = createBrowserMockHostEnvironment({ readableFiles: seeds })
      const result = await env.userFilePort.readText({
        kind: "user-file-ref",
        referenceId: "custom-1",
        displayName: "custom.json",
        mediaType: "application/json",
        byteLength: null,
      })

      assert.equal(result.text, '{"key":"value"}')
    })
  })

  describe("UserFilePort.writeText", () => {
    it("writes text and returns a receipt", async () => {
      const env = createBrowserMockHostEnvironment()
      const receipt = await env.userFilePort.writeText(
        {
          kind: "user-save-target-ref",
          referenceId: "target-1",
          displayName: "output.csv",
          suggestedFormat: "csv",
        },
        "col1,col2\na,b",
      )

      assert.equal(receipt.displayName, "output.csv")
      assert.equal(receipt.mediaType, "text/csv")
      assert.ok(receipt.byteLength > 0)
      assert.ok(receipt.savedAt)
    })

    it("throws when signal is already aborted", async () => {
      const env = createBrowserMockHostEnvironment()
      const controller = new AbortController()
      controller.abort()

      await assert.rejects(
        () =>
          env.userFilePort.writeText(
            {
              kind: "user-save-target-ref",
              referenceId: "target-1",
              displayName: "output.csv",
              suggestedFormat: "csv",
            },
            "data",
            controller.signal,
          ),
        /Operation cancelled/,
      )
    })

    it("written files appear in listSavedDocuments", async () => {
      const env = createBrowserMockHostEnvironment()
      await env.userFilePort.writeText(
        {
          kind: "user-save-target-ref",
          referenceId: "save-1",
          displayName: "export.csv",
          suggestedFormat: "csv",
        },
        "header\nrow1",
      )

      const docs = env.listSavedDocuments()
      assert.equal(docs.length, 1)
      assert.equal(docs[0].referenceId, "save-1")
      assert.equal(docs[0].displayName, "export.csv")
      assert.equal(docs[0].text, "header\nrow1")
    })
  })

  describe("rendererHost.pickUserFile", () => {
    it("returns the first matching file from defaults", async () => {
      const env = createBrowserMockHostEnvironment()
      const ref = await env.rendererHost.pickUserFile()

      assert.ok(ref)
      assert.equal(ref.kind, "user-file-ref")
      assert.equal(ref.referenceId, "seed-students")
      assert.equal(ref.displayName, "students.csv")
    })

    it("cycles through files on repeated calls", async () => {
      const env = createBrowserMockHostEnvironment()
      const first = await env.rendererHost.pickUserFile()
      const second = await env.rendererHost.pickUserFile()

      assert.ok(first)
      assert.ok(second)
      assert.notEqual(first.referenceId, second.referenceId)
    })

    it("filters by acceptFormats", async () => {
      const env = createBrowserMockHostEnvironment()
      const ref = await env.rendererHost.pickUserFile({
        acceptFormats: ["json"],
      })

      assert.ok(ref)
      assert.equal(ref.displayName, "groups.json")
    })

    it("returns null when no files match format filter", async () => {
      const env = createBrowserMockHostEnvironment()
      const ref = await env.rendererHost.pickUserFile({
        acceptFormats: ["xlsx"],
      })

      assert.equal(ref, null)
    })

    it("returns null when no readable files are seeded", async () => {
      const env = createBrowserMockHostEnvironment({ readableFiles: [] })
      const ref = await env.rendererHost.pickUserFile()

      assert.equal(ref, null)
    })
  })

  describe("rendererHost.pickSaveTarget", () => {
    it("returns a save target ref with incremental referenceId", async () => {
      const env = createBrowserMockHostEnvironment()
      const first = await env.rendererHost.pickSaveTarget()
      const second = await env.rendererHost.pickSaveTarget()

      assert.ok(first)
      assert.ok(second)
      assert.equal(first.kind, "user-save-target-ref")
      assert.equal(second.kind, "user-save-target-ref")
      assert.notEqual(first.referenceId, second.referenceId)
    })

    it("uses suggestedName when provided", async () => {
      const env = createBrowserMockHostEnvironment()
      const ref = await env.rendererHost.pickSaveTarget({
        suggestedName: "roster-export.csv",
      })

      assert.ok(ref)
      assert.equal(ref.displayName, "roster-export.csv")
    })

    it("uses defaultFormat for the suggestedFormat field", async () => {
      const env = createBrowserMockHostEnvironment()
      const ref = await env.rendererHost.pickSaveTarget({
        defaultFormat: "xlsx",
      })

      assert.ok(ref)
      assert.equal(ref.suggestedFormat, "xlsx")
    })
  })

  describe("rendererHost.pickDirectory", () => {
    it("always returns null in browser mock", async () => {
      const env = createBrowserMockHostEnvironment()
      const result = await env.rendererHost.pickDirectory()

      assert.equal(result, null)
    })
  })

  describe("rendererHost.openExternalUrl", () => {
    it("tracks the last opened URL in environment snapshot", async () => {
      const env = createBrowserMockHostEnvironment()
      await env.rendererHost.openExternalUrl("https://example.com")

      const snapshot = await env.rendererHost.getEnvironmentSnapshot()
      assert.equal(snapshot.lastOpenedExternalUrl, "https://example.com")
    })
  })

  describe("rendererHost.getEnvironmentSnapshot", () => {
    it("returns browser-mock shell with expected defaults", async () => {
      const env = createBrowserMockHostEnvironment()
      const snapshot = await env.rendererHost.getEnvironmentSnapshot()

      assert.equal(snapshot.shell, "browser-mock")
      assert.equal(snapshot.theme, "light")
      assert.equal(snapshot.windowChrome, "system")
      assert.equal(snapshot.canPromptForFiles, true)
      assert.equal(snapshot.lastOpenedExternalUrl, null)
    })
  })

  describe("determinism", () => {
    it("produces identical results across separate instances with same seeds", async () => {
      const seeds: BrowserMockReadableFileSeed[] = [
        {
          referenceId: "f1",
          displayName: "data.csv",
          mediaType: "text/csv",
          text: "a,b,c",
        },
      ]

      const env1 = createBrowserMockHostEnvironment({ readableFiles: seeds })
      const env2 = createBrowserMockHostEnvironment({ readableFiles: seeds })

      const file1 = await env1.rendererHost.pickUserFile()
      const file2 = await env2.rendererHost.pickUserFile()

      assert.deepEqual(file1, file2)

      const save1 = await env1.rendererHost.pickSaveTarget({
        suggestedName: "out.csv",
      })
      const save2 = await env2.rendererHost.pickSaveTarget({
        suggestedName: "out.csv",
      })

      assert.equal(save1?.referenceId, save2?.referenceId)
    })
  })
})
