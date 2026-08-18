import { fileURLToPath } from "node:url"

export type StepCodexSdkHostCommand = {
  readonly command: string
  readonly arguments: readonly string[]
}

export function createStepCodexSdkHostCommand(): StepCodexSdkHostCommand {
  return {
    command: process.execPath,
    arguments: [
      "--import",
      "tsx",
      fileURLToPath(new URL("./step-codex-sdk-host-entry.ts", import.meta.url)),
    ],
  }
}
