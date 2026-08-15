import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  ChildProcessOutcomeUnknownError,
  createChildProcessLifetimeAdapter,
} from "@repo-edu/host-node/child-process-lifetime"
import {
  createWindowsChildProcessLifetimePlatform,
  runWindowsChildLifetimeTarget,
} from "@repo-edu/host-node/windows-child-lifetime"
import { resolvePackagedWindowsChildLifetimeRuntime } from "../child-lifetime-artifact-probe.js"

const launcherEntryPath = fileURLToPath(
  new URL(
    "../../resources/host-child-lifetime/windows-launcher.cjs",
    import.meta.url,
  ),
)
const targetScript = [
  "process.stdin.setEncoding('utf8')",
  "let input = ''",
  "process.stdin.on('data', (chunk) => { input += chunk })",
  "process.stdin.on('end', () => { process.stdout.write(input.toUpperCase()) })",
].join("; ")

describe("packaged Windows child-lifetime runtime", () => {
  it("keeps the Electron executable and launcher entry host-owned", () => {
    const resourcesPath = join("root", "resources")
    const executablePath = join("root", "RepoEdu.exe")

    assert.deepEqual(
      resolvePackagedWindowsChildLifetimeRuntime(resourcesPath, executablePath),
      {
        executablePath,
        launcherEntryPath: join(
          resourcesPath,
          "host-child-lifetime",
          "windows-launcher.cjs",
        ),
        runAsNode: true,
      },
    )
  })

  it("exits the one-shot launcher after its target reports terminal state", {
    skip: process.platform !== "win32",
  }, async () => {
    const run = await runWindowsChildLifetimeTarget(
      {
        executablePath: process.execPath,
        launcherEntryPath,
      },
      {
        command: process.execPath,
        args: ["-e", targetScript],
        stdinText: "repo-edu",
      },
    )

    assert.deepEqual(run.result, {
      exitCode: 0,
      signal: null,
      stdout: "REPO-EDU",
      stderr: "",
    })
  })

  it("joins the packaged Windows route to the shared adapter", {
    skip: process.platform !== "win32",
  }, async () => {
    const windows = createWindowsChildProcessLifetimePlatform({
      executablePath: process.execPath,
      launcherEntryPath,
      runAsNode: false,
    })
    const adapter = createChildProcessLifetimeAdapter({ windows })
    const run = await adapter.launch({
      command: process.execPath,
      args: ["-e", targetScript],
      route: "direct-adapter",
    })
    let output = ""
    run.stdout.setEncoding("utf8")
    run.stdout.on("data", (chunk: string) => {
      output += chunk
    })

    run.stdin.write("repo-edu")
    run.requestStop()
    assert.deepEqual(await run.result, { exitCode: 0, signal: null })
    await adapter.stopAndConfirm()
    assert.equal(output, "REPO-EDU")
  })

  it("preserves Node shell behavior inside the assigned launcher", {
    skip: process.platform !== "win32",
  }, async () => {
    const run = await runWindowsChildLifetimeTarget(
      {
        executablePath: process.execPath,
        launcherEntryPath,
      },
      {
        command: "echo",
        args: ["repo-edu-shell"],
        shell: true,
      },
    )

    assert.equal(run.result.exitCode, 0)
    assert.equal(run.result.signal, null)
    assert.equal(run.result.stdout.trim(), "repo-edu-shell")
    assert.equal(run.result.stderr, "")
  })

  it("keeps a rejected target launch as a known setup failure", {
    skip: process.platform !== "win32",
  }, async () => {
    await assert.rejects(
      runWindowsChildLifetimeTarget(
        {
          executablePath: process.execPath,
          launcherEntryPath,
        },
        {
          command: "Z:\\repo-edu-missing-target.exe",
        },
      ),
      (error: Error) =>
        !(error instanceof ChildProcessOutcomeUnknownError) &&
        /Windows launcher failed/.test(error.message),
    )
  })

  it("reports an unknown outcome when the launcher is lost after target start", {
    skip: process.platform !== "win32",
  }, async () => {
    await assert.rejects(
      runWindowsChildLifetimeTarget(
        {
          executablePath: process.execPath,
          launcherEntryPath,
        },
        {
          command: process.execPath,
          args: [
            "-e",
            "process.kill(process.ppid); setInterval(() => undefined, 1_000)",
          ],
        },
      ),
      ChildProcessOutcomeUnknownError,
    )
  })
})
