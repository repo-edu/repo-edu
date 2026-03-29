/**
 * Resolves the package manager command for cross-platform spawn compatibility.
 * On Windows, bare `pnpm` can fail with ENOENT because spawn cannot resolve `.cmd` shims.
 * When invoked via a package manager script, `npm_execpath` is set and can be a JS entrypoint
 * or a native executable. Use `node` only for JS entrypoints and execute binaries directly.
 */
export function packageManagerCommand(args) {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === "string" && npmExecPath.length > 0) {
    if (/\.(?:[cm]?js)$/i.test(npmExecPath)) {
      return {
        command: process.execPath,
        args: [npmExecPath, ...args],
      };
    }

    return {
      command: npmExecPath,
      args,
    };
  }

  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args,
  };
}
