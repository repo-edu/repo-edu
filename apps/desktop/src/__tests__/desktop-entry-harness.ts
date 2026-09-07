import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { build } from "esbuild"

const sourceRoot = resolve(import.meta.dirname, "..")

// Execute the real entry and installer in a fresh process. Only their external
// collaborators are replaced; Electron readiness and the gate can be paused.
const driver = `
import { writeSync } from "node:fs"
globalThis.trace = (event) => writeSync(1, event + "\\n")
Object.defineProperty(process, "platform", { value: process.env.ENTRY_PLATFORM ?? "linux" })
Object.defineProperty(process, "resourcesPath", { value: import.meta.dirname })
process.on("exit", code => trace("process-exit:" + code))
await import("./main.ts")
trace("entry-settled")
await globalThis.afterEntry?.()
`

const electron = `
import { EventEmitter } from "node:events"
export const app = new EventEmitter()
app.isPackaged = false
app.commandLine = { appendSwitch: (name, value) => trace("switch:" + name + ":" + value) }
app.requestSingleInstanceLock = () => {
  trace("single-instance")
  if (process.env.ENTRY_CASE === "installer-failure") throw new Error("installer failed")
  return process.env.ENTRY_CASE !== "second-start"
}
app.setName = () => trace("name")
app.getPath = () => "/unused"
app.whenReady = () => {
  trace("when-ready")
  return new Promise(resolve => globalThis.ready = () => { trace("ready"); resolve() })
}
app.exit = code => { trace("app-exit:" + code); process.exit(code) }
app.quit = () => app.emit("before-quit", { preventDefault() { trace("prevent-quit") } })
const register = app.on.bind(app)
app.on = (event, listener) => { trace("listen:" + event); return register(event, listener) }
export const BrowserWindow = {
  getAllWindows: () => [{
    isMinimized: () => true,
    restore: () => trace("restore"),
    focus: () => trace("focus"),
    setEnabled: () => trace("disable")
  }]
}
export const dialog = { showErrorBox: (_title, message) => { trace("dialog"); trace(message) } }
export const ipcMain = {}, Menu = {}, MessageChannelMain = {}, nativeTheme = {}, shell = {}
globalThis.afterEntry = async () => {
  const turn = () => new Promise(resolve => setImmediate(resolve))
  if (process.env.ENTRY_CASE === "ready-first") { ready(); await turn() }
  trace("before-gate")
  globalThis.holdGate()
  await turn()
  trace("after-gate")
  if (process.env.ENTRY_CASE === "close-before-ready") {
    app.quit()
    ready()
    await turn()
    return
  }
  if (process.env.ENTRY_CASE === "unhandled-rejection") {
    Promise.reject(new Error("unhandled rejection"))
    return
  }
  if (process.env.ENTRY_CASE === "child-loss") {
    app.emit("child-process-gone", {}, { type: "Future child", reason: "future-reason" })
    return
  }
  if (process.env.ENTRY_CASE === "fatal-after-gate") {
    setImmediate(() => { throw new Error("held-gate failure") })
    return
  }
  if (process.env.ENTRY_CASE !== "ready-first") { ready(); await turn() }
  app.emit("second-instance")
  app.quit()
}
`

const collaborators: Record<string, string> = {
  electron,
  "@repo-edu/host-node": `
    export const createNodeFileSystemPort = () => ({})
    export const createNodeGitCommandPort = () => ({})
    export const createNodeHttpPort = () => ({})
    export const createNodeLlmPort = () => ({})
    export const createNodeLlmTextClient = () => ({})
    export const createNodeProcessPort = () => ({})
    export const createNodeTokenizerPort = () => ({})
    export const resolveRepoEduAppDataRoot = () => "/unused"
    export const programConflictMessage = "busy"
    export const isProgramGateArtifactProbe = () => false
    export const waitForProgramGateArtifactProbeRelease = () => {}
    export const writeProgramGateArtifactProbeMarker = () => {}
    export const claimProgramGate = () => {
      trace("claim")
      return new Promise(resolve => {
        globalThis.holdGate = () => {
          trace("held")
          resolve({ status: "held", release: () => trace("release") })
        }
      })
    }
  `,
  "@repo-edu/host-node/windows-child-lifetime":
    "export const createWindowsChildProcessLifetimeAdapter = () => ({})",
  "./auto-updater": `
    export const checkForUpdatesNow = () => {}
    export const downloadUpdate = () => {}
    export const getAutoUpdaterState = () => ({})
    export const initAutoUpdater = () => {}
    export const onAutoUpdaterStateChange = () => {}
    export const quitAndInstall = () => { throw new Error("unexpected updater") }
  `,
  "./child-lifetime-artifact-probe": `
    export const isChildLifetimeArtifactProbe = () => false
    export const runChildLifetimeArtifactProbe = () => {}
  `,
  "./child-process-lifetime": `
    export const createDesktopChildProcessLifetimeController = (options) => ({
      stopAndConfirm: async () => {
        trace("stop-owned-work")
        await new Promise(resolve => setImmediate(resolve))
        if (process.env.ENTRY_CASE === "unconfirmed-close") {
          options.showWarning("warning", "first expired tree")
          options.showWarning("warning", "second expired tree")
        }
        return { outcome: process.env.ENTRY_CASE === "unconfirmed-close" ? "unconfirmed" : "confirmed" }
      }
    })
  `,
  "./codex-binary": "export const resolveUnpackedCodexBinaryPath = () => {}",
  "./codex-sdk-host-command":
    "export const createDesktopCodexSdkHostCommand = () => ({})",
  "./desktop-bootstrap": `
    export const loadDesktopBootstrap = () => {
      trace("storage")
      return new Promise(() => {})
    }
  `,
  "./desktop-entry-gateway":
    "export const installDesktopEntryGateway = () => {}",
  "./desktop-host": "export const createDesktopHostEnvironment = () => ({})",
  "./desktop-menu": "export const createDesktopMenuTemplate = () => []",
  "./llm-runtime-config":
    "export const desktopLlmRuntimeConfigFromSettings = () => ({})",
  "./trpc": `
    export const createDesktopWorkflowRegistry = () => ({})
    export const createDesktopWorkflowRouter = () => ({})
  `,
  "./window-state-store": "export const saveDesktopWindowState = () => {}",
  "./windows-child-lifetime-runtime": `
    export const resolveDevelopmentWindowsChildLifetimeRuntime = () => ({})
    export const resolvePackagedWindowsChildLifetimeRuntime = () => ({})
  `,
}

export async function runDesktopEntry(options: {
  scenario?: string
  product?: string
  importOnly?: boolean
  platform?: string
  collaborators?: Record<string, string | null>
}) {
  const directory = await mkdtemp(join(tmpdir(), "desktop-entry-"))
  const replacements = { ...collaborators, ...options.collaborators }
  try {
    await writeFile(join(directory, "app-update.yml"), "provider: github\n")
    const result = await build({
      stdin: {
        contents: options.importOnly
          ? driver
              .replace(
                'await import("./main.ts")',
                'await import("./desktop-application.ts")',
              )
              .replace("await globalThis.afterEntry?.()", "")
          : driver,
        resolveDir: sourceRoot,
        sourcefile: "entry-driver.ts",
      },
      bundle: true,
      splitting: true,
      platform: "node",
      format: "esm",
      target: "node24",
      outdir: directory,
      entryNames: "driver",
      chunkNames: "[name]-[hash]",
      write: false,
      banner: {
        js: 'import { createRequire as testCreateRequire } from "node:module"; const require = testCreateRequire(import.meta.url);',
      },
      plugins: [
        {
          name: "desktop-collaborators",
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) => {
              if (
                args.path === "./desktop-application" &&
                options.product !== undefined
              )
                return { path: "product", namespace: "test" }
              if (typeof replacements[args.path] === "string")
                return { path: args.path, namespace: "test" }
            })
            builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
              resolveDir: sourceRoot,
              contents:
                args.path === "product"
                  ? options.product
                  : (replacements[args.path] as string),
              loader: "js",
            }))
          },
        },
      ],
    })
    for (const file of result.outputFiles)
      await writeFile(file.path, file.contents)
    const child = spawnSync(process.execPath, [join(directory, "driver.js")], {
      env: {
        ...process.env,
        ENTRY_CASE: options.scenario ?? "",
        ENTRY_PLATFORM: options.platform ?? "linux",
      },
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return {
      status: child.status,
      signal: child.signal,
      error: child.error,
      events: child.stdout.trim().split("\n"),
      stderr: child.stderr ?? "",
      output: result.outputFiles.map((file) => ({
        path: file.path,
        text: file.text,
      })),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
