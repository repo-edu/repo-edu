import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  claimProgramGate,
  programGateArtifactProbeMarker,
} from "../program-gate.js"

const temporaryRoots = new Set<string>()
const childPath = fileURLToPath(
  new URL("./fixtures/program-gate-child.ts", import.meta.url),
)

async function createTemporaryRoot(removeAfterCreate = false): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "repo-edu-program-gate-test-"))
  temporaryRoots.add(parent)
  const root = join(parent, "missing-root")
  if (!removeAfterCreate) {
    return parent
  }
  return root
}

function spawnChild(root: string, mode: "attempt" | "hold") {
  const child = spawn(process.execPath, ["--import", "tsx", childPath], {
    env: {
      ...process.env,
      REPO_EDU_PROGRAM_GATE_TEST_MODE: mode,
      REPO_EDU_PROGRAM_GATE_TEST_ROOT: root,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  return child
}

async function readChildState(
  child: ReturnType<typeof spawnChild>,
): Promise<"busy" | "held"> {
  return await new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error("The program-gate child timed out."))
    }, 10_000)
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      for (const line of stdout.split(/\r?\n/)) {
        try {
          const value = JSON.parse(line) as {
            marker?: string
            state?: "busy" | "held"
          }
          if (
            value.marker === programGateArtifactProbeMarker &&
            (value.state === "busy" || value.state === "held")
          ) {
            clearTimeout(timeout)
            resolve(value.state)
            return
          }
        } catch {
          // Wait for a complete marker line.
        }
      }
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("close", (code) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `The program-gate child exited with ${code ?? "unknown"}: ${stderr || stdout}`,
        ),
      )
    })
  })
}

async function waitForExit(
  child: ReturnType<typeof spawnChild>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", () => resolve())
  })
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  temporaryRoots.clear()
})

describe("claimProgramGate", () => {
  it("creates a missing app-data root", async () => {
    const root = await createTemporaryRoot(true)
    const claim = await claimProgramGate(root)
    assert.equal(claim.status, "held")
    if (claim.status === "held") {
      claim.release()
    }
    await access(dirname(join(root, "program-gate.db")))
  })

  it("refuses a second same-process claim and releases idempotently", async () => {
    const root = await createTemporaryRoot()
    const owner = await claimProgramGate(root)
    assert.equal(owner.status, "held")
    assert.deepEqual(await claimProgramGate(root), { status: "busy" })
    assert.equal(owner.status, "held")
    if (owner.status === "held") {
      owner.release()
      owner.release()
    }
    const successor = await claimProgramGate(root)
    assert.equal(successor.status, "held")
    if (successor.status === "held") {
      successor.release()
    }
  })

  it("refuses another process while held", async () => {
    const root = await createTemporaryRoot()
    const owner = await claimProgramGate(root)
    assert.equal(owner.status, "held")
    const child = spawnChild(root, "attempt")
    const childExit = waitForExit(child)
    assert.equal(await readChildState(child), "busy")
    await childExit
    if (owner.status === "held") {
      owner.release()
    }
  })

  it("releases the gate after process death", async () => {
    const root = await createTemporaryRoot()
    const child = spawnChild(root, "hold")
    const childExit = waitForExit(child)
    assert.equal(await readChildState(child), "held")
    child.kill()
    await childExit
    const successor = await claimProgramGate(root)
    assert.equal(successor.status, "held")
    if (successor.status === "held") {
      successor.release()
    }
  })
})
