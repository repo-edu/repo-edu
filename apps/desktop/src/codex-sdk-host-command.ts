import { join } from "node:path"
import type { NodeCodexSdkHostCommand } from "@repo-edu/host-node/llm"

export const desktopCodexSdkHostFileName = "codex-sdk-host.js"

export function createDesktopCodexSdkHostCommand(options: {
  readonly currentDir: string
  readonly executablePath: string
}): NodeCodexSdkHostCommand {
  return {
    command: options.executablePath,
    args: [join(options.currentDir, desktopCodexSdkHostFileName)],
    runAsNode: true,
  }
}
