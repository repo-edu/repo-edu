import { resolve } from "node:path"
import { validateProgramGateArtifacts } from "../../../scripts/validate-program-gate-artifact.mjs"
import {
  findPackagedElectronExecutable,
  packagedElectronExecutableCandidates,
} from "./packaged-electron-executable.mjs"

async function main() {
  const executable = await findPackagedElectronExecutable()
  if (!executable) {
    throw new Error(
      `No packaged Electron executable was found. Checked: ${packagedElectronExecutableCandidates().join(", ")}`,
    )
  }

  const cliArtifact = process.env.REPO_EDU_PROGRAM_GATE_CLI_ARTIFACT?.trim()
  await validateProgramGateArtifacts({
    desktop: {
      command: resolve(executable),
      arguments: process.platform === "linux" ? ["--no-sandbox"] : [],
      label: "packaged Electron",
    },
    ...(cliArtifact
      ? {
          cli: {
            command: resolve(cliArtifact),
            label: "compiled CLI",
          },
        }
      : {}),
  })
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`FAIL packaged program gate\n  ${message}\n`)
  process.exitCode = 1
})
