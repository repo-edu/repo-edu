import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { claimPlanImplementationRunnerAdmission } from "../runner-admission.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()
const childPath = fileURLToPath(
  new URL("./fixtures/runner-admission-child.ts", import.meta.url),
)

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-runner-admission-test-"))
  temporaryRoots.add(root)
  await execFileAsync("git", ["init", "--quiet"], { cwd: root })
  return root
}

function spawnChild(repoEduRoot: string, mode: "attempt" | "hold") {
  const child = spawn(process.execPath, ["--import", "tsx", childPath], {
    env: {
      ...process.env,
      REPO_EDU_RUNNER_ADMISSION_TEST_MODE: mode,
      REPO_EDU_RUNNER_ADMISSION_TEST_ROOT: repoEduRoot,
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
      reject(new Error("The runner admission child timed out."))
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
            value.marker === "repo-edu-runner-admission-test" &&
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
          `The runner admission child exited with ${code ?? "unknown"}: ${stderr || stdout}`,
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

describe("claimPlanImplementationRunnerAdmission", () => {
  it("stores its database under the checkout Git directory", async () => {
    const repoEduRoot = await createRepository()
    const claim = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(claim.status, "held")
    await access(
      join(
        repoEduRoot,
        ".git",
        "repo-edu",
        "plan-implementation",
        "admission.db",
      ),
    )
    if (claim.status === "held") {
      claim.release()
    }
  })

  it("releases idempotently for a later invocation", async () => {
    const repoEduRoot = await createRepository()
    const owner = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(owner.status, "held")
    if (owner.status === "held") {
      owner.release()
      owner.release()
    }

    const successor = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(successor.status, "held")
    if (successor.status === "held") {
      successor.release()
    }
  })

  it("refuses a second process while an invocation holds admission", async () => {
    const repoEduRoot = await createRepository()
    const owner = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(owner.status, "held")
    const child = spawnChild(repoEduRoot, "attempt")
    const childExit = waitForExit(child)
    assert.equal(await readChildState(child), "busy")
    await childExit
    if (owner.status === "held") {
      owner.release()
    }
  })

  it("releases admission when the owning process dies", async () => {
    const repoEduRoot = await createRepository()
    const child = spawnChild(repoEduRoot, "hold")
    const childExit = waitForExit(child)
    assert.equal(await readChildState(child), "held")
    child.kill()
    await childExit

    const successor = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(successor.status, "held")
    if (successor.status === "held") {
      successor.release()
    }
  })
})
