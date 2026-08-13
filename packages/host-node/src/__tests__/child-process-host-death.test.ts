import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const fixturePath = fileURLToPath(
  new URL("./fixtures/child-process-tree.cjs", import.meta.url),
)
const ownerFixturePath = fileURLToPath(
  new URL("./fixtures/child-lifetime-owner.ts", import.meta.url),
)
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const windowsLauncherEntryPath = join(
  repoRoot,
  "apps/desktop/resources/host-child-lifetime/windows-launcher.cjs",
)
const supportsProcessGroups =
  process.platform === "darwin" || process.platform === "linux"
const executeFile = promisify(execFile)

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

async function createMarker(name: string): Promise<{
  readonly marker: string
  readonly root: string
}> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-host-death-"))
  return { marker: join(root, name), root }
}

async function readMarker(path: string): Promise<string> {
  return await readFile(path, "utf8")
}

async function waitForChangingTree(path: string): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const content = await readFile(path, "utf8").catch(() => "")
    if (/grandchild-ignores-stop-tick/.test(content)) {
      return content
    }
    await delay(20)
  }
  throw new Error("Timed out waiting for the changing process tree.")
}

async function assertMarkerStable(path: string): Promise<void> {
  const content = await readMarker(path)
  await delay(120)
  assert.equal(await readMarker(path), content)
}

function targetProcessId(content: string): number {
  const match = /tree-ignores-stop-pid:(\d+)/.exec(content)
  if (!match) {
    throw new Error("The changing tree did not report its target process.")
  }
  return Number(match[1])
}

function processExists(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

async function waitForProcessGroupExit(processGroupId: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      process.kill(-processGroupId, 0)
    } catch {
      return
    }
    await delay(20)
  }
  throw new Error(`Process group ${processGroupId} did not exit.`)
}

function startOwner(marker: string) {
  return spawn(process.execPath, ["--import", "tsx", ownerFixturePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      REPO_EDU_CHILD_LIFETIME_MARKER: marker,
      REPO_EDU_CHILD_LIFETIME_TREE_FIXTURE: fixturePath,
      REPO_EDU_WINDOWS_LAUNCHER_ENTRY: windowsLauncherEntryPath,
      TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.base.json"),
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  })
}

describe("unobserved child-process host death", () => {
  it("closes the only Windows job handle and ends its changing tree", {
    skip: process.platform !== "win32",
  }, async () => {
    const { marker, root } = await createMarker("windows.txt")
    const owner = startOwner(marker)
    const closed = once(owner, "close")
    let targetId: number | undefined
    try {
      targetId = targetProcessId(await waitForChangingTree(marker))

      owner.kill("SIGKILL")
      await closed

      const deadline = Date.now() + 5_000
      while (processExists(targetId) && Date.now() < deadline) {
        await delay(20)
      }
      assert.equal(processExists(targetId), false)
      await assertMarkerStable(marker)
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        owner.kill("SIGKILL")
        await closed
      }
      if (targetId !== undefined && processExists(targetId)) {
        await executeFile("taskkill", ["/PID", String(targetId), "/T", "/F"])
      }
      await rm(root, { force: true, recursive: true })
    }
  })

  it("records the accepted POSIX residue without a child-side watch", {
    skip: !supportsProcessGroups,
  }, async () => {
    const { marker, root } = await createMarker("posix.txt")
    const owner = startOwner(marker)
    const closed = once(owner, "close")
    let ownedProcessGroupId: number | undefined
    try {
      try {
        const targetId = targetProcessId(await waitForChangingTree(marker))
        ownedProcessGroupId = targetId
        assert.doesNotThrow(() => {
          process.kill(-targetId, 0)
        })

        owner.kill("SIGKILL")
        await closed

        const contentAfterHostDeath = await readMarker(marker)
        await delay(120)
        assert.notEqual(await readMarker(marker), contentAfterHostDeath)
      } finally {
        if (owner.exitCode === null && owner.signalCode === null) {
          owner.kill("SIGKILL")
          await closed
        }
        if (ownedProcessGroupId !== undefined) {
          try {
            process.kill(-ownedProcessGroupId, "SIGKILL")
          } catch {
            // The fixture group may already be gone after an earlier failure.
          }
          await waitForProcessGroupExit(ownedProcessGroupId)
        }
      }

      await assertMarkerStable(marker)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
