import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { _electron as electron, expect, test } from "@playwright/test"
import { build } from "esbuild"
import type {
  RendererRequest,
  RendererRequestObserver,
} from "../../src/preload-request-transport"
import { createPackagedTrustRuntime } from "./packaged-trust-runtime"

declare global {
  var requestPortTest: {
    window: import("electron").BrowserWindow
    close(): void
    dropHostPort(): void
    snapshot(): {
      phase: string
      events: string[]
      dispatches: string[]
      ports: Array<{ closed: boolean; messages: number; closes: number }>
    }
  }
  interface Window {
    portEvents: string[][]
    portRequests: RendererRequest[]
    rawRequest: {
      begin(): void
      send(message: unknown, transfer?: boolean): void
      drop(): void
      snapshot(): { received: unknown[]; closed: boolean }
    }
  }
}

let directory: string
let packaged: Awaited<ReturnType<typeof createPackagedTrustRuntime>>
test.beforeAll(async () => {
  packaged = await createPackagedTrustRuntime()
  directory = await mkdtemp(join(tmpdir(), "repo-edu-request-port-"))
  await build({
    entryPoints: [
      fileURLToPath(new URL("./fixtures/request-preload.ts", import.meta.url)),
    ],
    outfile: join(directory, "preload.cjs"),
    bundle: true,
    platform: "browser",
    format: "cjs",
    // Match the application bundler's browser-only handling of tree-sitter's
    // dormant Node branches. The sandboxed runtime must never execute them.
    external: ["electron", "fs/promises", "module"],
    tsconfig: fileURLToPath(
      new URL("../../../../tsconfig.base.json", import.meta.url),
    ),
  })
  await copyFile(
    join(directory, "preload.cjs"),
    packaged.documentPath("preload.cjs"),
  )
})
test.afterAll(async () => {
  await packaged?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

for (const entry of ["development", "packaged-file"]) {
  for (const scenario of [
    "concurrent",
    "command",
    "close",
    "malformed",
    "host-loss",
    "retention",
    "raw-malformed",
    "raw-unknown",
    "raw-early-acknowledgement",
    "raw-early-input",
    "raw-wrong-direction",
    "raw-extra-port",
    "raw-duplicate-bundle",
    "raw-duplicate-cancel",
    "raw-renderer-loss",
    "raw-aborting-request",
    "raw-late-input",
  ]) {
    test(`${entry}: retained sandboxed ports ${scenario}`, async () => {
      const html = "<!doctype html><title>Request ports</title>"
      const server = createServer((_request, response) => {
        response.end(html)
      })
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      )
      const address = server.address()
      if (!address || typeof address === "string")
        throw new Error("Missing test server")
      const pageFile =
        entry === "development"
          ? join(directory, `${entry}-${scenario}.html`)
          : packaged.documentPath(`${scenario}.html`)
      await writeFile(pageFile, html)
      const url =
        entry === "development"
          ? `http://127.0.0.1:${address.port}/`
          : pathToFileURL(pageFile).href
      const fixture = fileURLToPath(
        new URL("./fixtures/request-main.cjs", import.meta.url),
      )
      const args = [
        `--test-preload=${entry === "development" ? join(directory, "preload.cjs") : packaged.documentPath("preload.cjs")}`,
        `--test-url=${url}`,
        `--user-data-dir=${join(directory, `${entry}-${scenario}-data`)}`,
      ]
      const app =
        entry === "development"
          ? await electron.launch({ args: [fixture, ...args] })
          : await packaged.launch(fixture, args)
      try {
        expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(
          entry !== "development",
        )
        const page = await app.firstWindow()
        await page.waitForFunction(() => Boolean(window.repoEduRequests))
        if (scenario.startsWith("raw-")) {
          await page.evaluate(() => window.rawRequest.begin())
          await expect
            .poll(() =>
              page.evaluate(() => window.rawRequest.snapshot().received),
            )
            .toEqual([
              { type: "admission", status: "accepted" },
              { type: "prepare" },
            ])
          if (scenario === "raw-aborting-request")
            await app.evaluate(() => globalThis.requestPortTest.close())
          if (scenario === "raw-late-input") {
            await page.evaluate(() =>
              window.rawRequest.send({ type: "bundle", bundle: {} }),
            )
            await expect
              .poll(() =>
                page.evaluate(() => window.rawRequest.snapshot().received),
              )
              .toContainEqual({ type: "persisted", result: {} })
            await page.evaluate(() =>
              window.rawRequest.send({
                type: "input",
                input: {
                  workflowId: "userFile.exportPreview",
                  settlementInput: undefined,
                  input: {
                    kind: "user-save-target-ref",
                    referenceId: "file",
                    displayName: "preview.txt",
                    suggestedFormat: "txt",
                  },
                },
              }),
            )
            await expect
              .poll(() =>
                app.evaluate(() => globalThis.requestPortTest.snapshot().phase),
              )
              .toBe("executing.settling")
          }
          await page.evaluate((scenario) => {
            const raw = window.rawRequest
            if (scenario === "raw-renderer-loss") raw.drop()
            else if (scenario === "raw-duplicate-bundle") {
              raw.send({ type: "bundle", bundle: {} })
              raw.send({ type: "bundle", bundle: {} })
            } else if (scenario === "raw-duplicate-cancel") {
              raw.send({ type: "cancel" })
              raw.send({ type: "cancel" })
            } else {
              const messages: Record<string, unknown> = {
                "raw-malformed": { type: "bundle", bundle: { course: null } },
                "raw-unknown": { type: "unknown" },
                "raw-early-acknowledgement": { type: "acknowledged" },
                "raw-early-input": {
                  type: "input",
                  input: {
                    workflowId: "userFile.exportPreview",
                    settlementInput: undefined,
                    input: {
                      kind: "user-save-target-ref",
                      referenceId: "file",
                      displayName: "preview.txt",
                      suggestedFormat: "txt",
                    },
                  },
                },
                "raw-wrong-direction": { type: "prepare" },
                "raw-extra-port": { type: "bundle", bundle: {} },
                "raw-aborting-request": { type: "bundle", bundle: {} },
                "raw-late-input": {
                  type: "input",
                  input: {
                    workflowId: "userFile.exportPreview",
                    settlementInput: undefined,
                    input: {
                      kind: "user-save-target-ref",
                      referenceId: "file",
                      displayName: "preview.txt",
                      suggestedFormat: "txt",
                    },
                  },
                },
              }
              raw.send(messages[scenario], scenario === "raw-extra-port")
            }
          }, scenario)
          await expect
            .poll(() =>
              app.evaluate(() => globalThis.requestPortTest.snapshot().phase),
            )
            .toBe("terminal")
          const snapshot = await app.evaluate(() =>
            globalThis.requestPortTest.snapshot(),
          )
          expect(
            snapshot.dispatches.filter((event) => event === "terminal"),
          ).toEqual(["terminal"])
          expect(
            snapshot.dispatches.filter((event) => event === "input-prepared"),
          ).toHaveLength(scenario === "raw-late-input" ? 1 : 0)
          expect(
            snapshot.events.filter((event) => event === "handler"),
          ).toHaveLength(scenario === "raw-late-input" ? 1 : 0)
          if (scenario !== "raw-renderer-loss")
            await expect
              .poll(() =>
                page.evaluate(() => window.rawRequest.snapshot().closed),
              )
              .toBe(true)
          await expect
            .poll(() =>
              app.evaluate(() => globalThis.requestPortTest.snapshot().ports),
            )
            .toEqual([{ closed: true, messages: 0, closes: 0 }])
          return
        }
        await page.evaluate((scenario) => {
          window.portEvents = []
          window.portRequests = []
          function observer(
            events: string[],
            request: () => RendererRequest,
          ): RendererRequestObserver {
            return {
              admission(status) {
                events.push(status)
              },
              prepare() {
                events.push("prepare")
                if (scenario === "command" || scenario === "close")
                  request().persist({})
              },
              persisted() {
                events.push("persisted")
                if (scenario === "close") request().readyToClose()
                else
                  request().prepareInput({
                    workflowId: "userFile.exportPreview",
                    input: {
                      kind: "user-save-target-ref",
                      referenceId: "file",
                      displayName: "preview.txt",
                      suggestedFormat: "txt",
                    },
                    settlementInput: undefined,
                  })
              },
              progress() {
                events.push("progress")
              },
              output() {
                events.push("output")
              },
              settlement() {
                events.push("settlement")
                request().acknowledgeSettlement()
              },
              released() {
                events.push("released")
              },
              closeAcknowledged() {
                events.push("close-acknowledged")
              },
              failed() {
                events.push("failed")
              },
            }
          }
          if (scenario === "close") {
            window.repoEduRequests?.onClose((request) => {
              window.portRequests.push(request)
              const events: string[] = []
              window.portEvents.push(events)
              return observer(events, () => request)
            })
          } else {
            const events: string[] = []
            window.portEvents.push(events)
            const request = window.repoEduRequests?.command(
              "userFile.exportPreview",
              observer(events, () => request as RendererRequest),
            )
            if (request) window.portRequests.push(request)
            if (scenario === "concurrent") {
              const second: string[] = []
              window.portEvents.push(second)
              window.repoEduRequests?.command(
                "repo.clone",
                observer(second, () => {
                  throw new Error("Busy attempt requested preparation")
                }),
              )
            }
          }
        }, scenario)
        if (scenario === "close")
          await app.evaluate(() => globalThis.requestPortTest.close())
        if (scenario === "malformed") {
          await expect
            .poll(() => page.evaluate(() => window.portEvents[0]))
            .toContain("prepare")
          await page.evaluate(() =>
            window.portRequests[0].persist({ course: null } as never),
          )
          await expect
            .poll(() =>
              app.evaluate(() => globalThis.requestPortTest.snapshot().phase),
            )
            .toBe("terminal")
        } else if (scenario === "host-loss" || scenario === "retention") {
          await expect
            .poll(() => page.evaluate(() => window.portEvents[0]))
            .toContain("prepare")
          if (scenario === "retention") {
            await page.evaluate(() => {
              window.portRequests = []
            })
            await app.evaluate(async () => {
              for (let attempt = 0; attempt < 3; attempt++) {
                await globalThis.requestPortTest.window.webContents.executeJavaScript(
                  "gc()",
                )
                await new Promise((resolve) => setTimeout(resolve, 20))
              }
            })
            expect(
              await app.evaluate(
                () => globalThis.requestPortTest.snapshot().phase,
              ),
            ).toBe("preparing")
            expect(await page.evaluate(() => window.portEvents[0])).toEqual([
              "accepted",
              "prepare",
            ])
          }
          await app.evaluate(() => globalThis.requestPortTest.dropHostPort())
          await expect
            .poll(() => page.evaluate(() => window.portEvents[0]))
            .toContain("failed")
        } else {
          const expected =
            scenario === "concurrent"
              ? [["accepted", "prepare"], ["busy"]]
              : scenario === "close"
                ? [["prepare", "persisted", "close-acknowledged"]]
                : [
                    [
                      "accepted",
                      "prepare",
                      "persisted",
                      "progress",
                      "output",
                      "settlement",
                      "released",
                    ],
                  ]
          await expect
            .poll(() => page.evaluate(() => window.portEvents))
            .toEqual(expected)
          if (scenario === "concurrent") {
            await app.evaluate(async () => {
              await globalThis.requestPortTest.window.webContents.executeJavaScript(
                "gc()",
              )
            })
            await page.evaluate(() => window.portRequests[0].persist({}))
            await expect
              .poll(() => page.evaluate(() => window.portEvents[0]))
              .toContain("released")
            expect(await page.evaluate(() => window.portEvents[1])).toEqual([
              "busy",
            ])
          }
          const snapshot = await app.evaluate(() =>
            globalThis.requestPortTest.snapshot(),
          )
          expect(snapshot.dispatches).not.toContain("terminal")
          expect(snapshot.phase).toBe(
            scenario === "close" ? "closing.ready" : "interactive",
          )
          await expect
            .poll(() =>
              app.evaluate(() => globalThis.requestPortTest.snapshot().ports),
            )
            .toEqual(
              Array.from({ length: scenario === "concurrent" ? 2 : 1 }, () => ({
                closed: true,
                messages: 0,
                closes: 0,
              })),
            )
        }
      } finally {
        await app.close()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  }
}
