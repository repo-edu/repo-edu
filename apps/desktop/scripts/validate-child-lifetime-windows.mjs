import { spawn } from "node:child_process"
import {
  findPackagedElectronExecutable,
  packagedElectronExecutableCandidates,
} from "./packaged-electron-executable.mjs"

const marker = "repo-edu-child-lifetime-artifact"
const probeEnvironmentVariable = "REPO_EDU_CHILD_LIFETIME_ARTIFACT_PROBE"
const timeoutMs = 60_000

function parseReport(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line)
      if (value?.marker === marker) {
        return value
      }
    } catch {
      // Ignore unrelated Electron output and incomplete lines.
    }
  }
  return undefined
}

async function runPackagedProbe(executable) {
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      [probeEnvironmentVariable]: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")

  const output = { stdout: "", stderr: "" }
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk
  })

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error("The packaged child-lifetime probe timed out."))
    }, timeoutMs)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("close", (code, signal) => {
      clearTimeout(timeout)
      if (code !== 0 || signal !== null) {
        reject(
          new Error(
            `The packaged child-lifetime probe exited with ${code ?? signal ?? "unknown"}: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`,
          ),
        )
        return
      }
      resolve(output)
    })
  })
}

async function main() {
  if (process.platform !== "win32") {
    process.stdout.write("SKIP packaged Windows child lifetime (non-Windows)\n")
    return
  }

  const executable = await findPackagedElectronExecutable()
  if (!executable) {
    throw new Error(
      `No packaged Electron executable was found. Checked: ${packagedElectronExecutableCandidates().join(", ")}`,
    )
  }

  const output = await runPackagedProbe(executable)
  const report = parseReport(output.stdout)
  if (!report) {
    throw new Error(
      `The packaged probe did not report its result: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`,
    )
  }
  if (report.architecture !== process.arch) {
    throw new Error(
      `The packaged probe architecture was ${report.architecture}; expected ${process.arch}.`,
    )
  }
  if (
    !report.claims ||
    Object.values(report.claims).some((passed) => passed !== true)
  ) {
    throw new Error(
      `The packaged probe reported a failed claim: ${JSON.stringify(report)}`,
    )
  }

  process.stdout.write(`PASS packaged Windows child lifetime (${process.arch})\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`FAIL packaged Windows child lifetime\n  ${message}\n`)
  process.exitCode = 1
})
