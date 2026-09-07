import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  test,
} from "@playwright/test"

declare global {
  var desktopTrustTest: {
    window: import("electron").BrowserWindow
    open(url: string): Promise<void>
    snapshot(): { events: string[]; direct: string[]; workflows: string[] }
  }
  interface Window {
    trustTest: {
      invoke(message: unknown): Promise<unknown>
      send(message: unknown): void
    }
  }
}

const fixture = fileURLToPath(
  new URL("./fixtures/trust-main.cjs", import.meta.url),
)
const html =
  "<!doctype html><title>Desktop trust</title><body>Initial document</body>"

for (const entry of ["development", "packaged-file"] as const) {
  for (const scenario of [
    "current",
    "foreign",
    "child",
    "malformed",
    "unknown",
    "navigation",
    "reload",
    "hash",
    "history",
    "replacement",
    "window",
    ...(entry === "development" ? ["initial-redirect" as const] : []),
  ] as const) {
    test(`${entry}: ${scenario}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "repo-edu-document-"))
      const server = createServer((request, response) => {
        if (request.url === "/redirect") {
          response.writeHead(302, { location: "/" })
          response.end()
          return
        }
        response.end(html)
      })
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      )
      const address = server.address()
      if (!address || typeof address === "string")
        throw new Error("Missing server address")
      const pagePath = join(directory, "Renderer entry.html")
      await writeFile(pagePath, html)
      const url =
        entry === "development"
          ? `http://127.0.0.1:${address.port}/${scenario === "initial-redirect" ? "redirect" : ""}`
          : pathToFileURL(pagePath).href
      let launchedApp: ElectronApplication | undefined
      try {
        const app = await electron.launch({
          args: [fixture, `--user-data-dir=${join(directory, "user-data")}`],
        })
        launchedApp = app
        if (scenario === "initial-redirect") {
          // A terminal initial load need not settle before the host exits.
          await app.evaluate((_electron, url) => {
            void globalThis.desktopTrustTest.open(url)
          }, url)
          await expect
            .poll(() =>
              app.evaluate(() => globalThis.desktopTrustTest.snapshot()),
            )
            .toEqual({
              events: ["terminal"],
              direct: [],
              workflows: [],
            })
          return
        }
        await app.evaluate(async (_electron, url) => {
          await globalThis.desktopTrustTest.open(url)
        }, url)
        const page = await app.firstWindow()
        if (scenario === "current") {
          await page.evaluate(async () => {
            await window.trustTest.invoke({
              action: "setNativeTheme",
              input: "dark",
            })
            window.trustTest.send({
              kind: "trpc",
              message: {
                id: 1,
                method: "subscription",
                params: { path: "course.list", input: undefined },
              },
            })
          })
          await expect
            .poll(() =>
              app.evaluate(
                () => globalThis.desktopTrustTest.snapshot().workflows,
              ),
            )
            .toEqual(["course.list"])
          expect(
            await app.evaluate(
              () => globalThis.desktopTrustTest.snapshot().direct,
            ),
          ).toEqual(["setNativeTheme"])
          return
        }
        if (scenario === "foreign") {
          await app.evaluate(
            async ({ BrowserWindow }, { url, preload }) => {
              const foreign = new BrowserWindow({
                show: false,
                webPreferences: {
                  contextIsolation: true,
                  sandbox: true,
                  preload,
                },
              })
              await foreign.loadURL(url)
              await foreign.webContents.executeJavaScript(
                'window.trustTest.invoke({ action: "pickDirectory" })',
              )
              foreign.destroy()
            },
            {
              url,
              preload: fileURLToPath(
                new URL("./fixtures/trust-preload.cjs", import.meta.url),
              ),
            },
          )
        } else if (scenario === "child") {
          await page.evaluate(() => {
            const frame = document.createElement("iframe")
            frame.srcdoc = "<p>Child</p>"
            document.body.append(frame)
          })
          await expect
            .poll(() =>
              app.evaluate(
                () =>
                  globalThis.desktopTrustTest.window.webContents.mainFrame
                    .frames.length,
              ),
            )
            .toBe(1)
          await app.evaluate(({ ipcMain }) => {
            const contents = globalThis.desktopTrustTest.window.webContents
            ipcMain.emit(
              "repo-edu/entry",
              { sender: contents, senderFrame: contents.mainFrame.frames[0] },
              { kind: "trpc", message: { id: 1, method: "subscription.stop" } },
            )
          })
        } else if (scenario === "malformed" || scenario === "unknown") {
          await page.evaluate(
            (scenario) =>
              window.trustTest.invoke(
                scenario === "malformed"
                  ? { action: "setNativeTheme", input: false }
                  : { action: "unknown" },
              ),
            scenario,
          )
        } else {
          await app.evaluate(({ BrowserWindow }, scenario) => {
            const host = globalThis.desktopTrustTest
            if (scenario === "reload") host.window.webContents.reload()
            else if (scenario === "replacement")
              void host.window.loadURL(host.window.webContents.getURL())
            else {
              const script =
                scenario === "navigation"
                  ? 'location.href = "https://example.invalid/"'
                  : scenario === "hash"
                    ? 'location.hash = "changed"'
                    : scenario === "history"
                      ? 'history.pushState({}, "", "?changed")'
                      : 'window.open("about:blank")'
              void host.window.webContents
                .executeJavaScript(script)
                .catch(() => {})
            }
            return BrowserWindow.getAllWindows().length
          }, scenario)
        }
        await expect
          .poll(() =>
            app.evaluate(() => globalThis.desktopTrustTest.snapshot().events),
          )
          .toEqual(["terminal"])
        const snapshot = await app.evaluate(() =>
          globalThis.desktopTrustTest.snapshot(),
        )
        expect(snapshot.direct).toEqual([])
        expect(snapshot.workflows).toEqual([])
        if (scenario === "navigation") expect(page.url()).toBe(url)
        if (scenario === "window")
          expect(
            await app.evaluate(
              ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
            ),
          ).toBe(1)
      } finally {
        await launchedApp?.close()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
        await rm(directory, { recursive: true, force: true })
      }
    })
  }
}
