import { join } from "node:path"
import type { NodeCodexHelperCommand } from "@repo-edu/host-node/llm"

export const desktopCodexHelperFileName = "codex-helper.js"

export function createDesktopCodexHelperCommand(options: {
  readonly currentDir: string
  readonly executablePath: string
}): NodeCodexHelperCommand {
  return {
    command: options.executablePath,
    args: [join(options.currentDir, desktopCodexHelperFileName)],
    runAsNode: true,
  }
}
