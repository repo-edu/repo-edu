/**
 * Resolves the active package manager without launching a Windows command shim.
 * pnpm lifecycle scripts expose their JavaScript or native entrypoint through
 * `npm_execpath`, so nested commands can execute that entrypoint directly.
 */
export function packageManagerCommand(
  args,
  {
    npmExecPath = process.env.npm_execpath,
    nodeExecPath = process.execPath,
    platform = process.platform,
  } = {},
) {
  if (typeof npmExecPath === "string" && npmExecPath.length > 0) {
    if (/\.(?:[cm]?js)$/iu.test(npmExecPath)) {
      return {
        command: nodeExecPath,
        args: [npmExecPath, ...args],
      }
    }

    return {
      command: npmExecPath,
      args,
    }
  }

  if (platform === "win32") {
    throw new Error("Run this script through pnpm on Windows.")
  }

  return {
    command: "pnpm",
    args,
  }
}
