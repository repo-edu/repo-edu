import { createChildProcessLifetimeAdapter } from "../../child-process-lifetime.js"
import { createWindowsChildProcessLifetimePlatform } from "../../windows-child-lifetime.js"

const markerPath = process.env.REPO_EDU_CHILD_LIFETIME_MARKER
const treeFixturePath = process.env.REPO_EDU_CHILD_LIFETIME_TREE_FIXTURE

if (!markerPath || !treeFixturePath) {
  throw new Error("The child-lifetime owner fixture is missing its paths.")
}

const launcherEntryPath = process.env.REPO_EDU_WINDOWS_LAUNCHER_ENTRY
const windows =
  process.platform === "win32"
    ? createWindowsChildProcessLifetimePlatform({
        executablePath: process.execPath,
        launcherEntryPath:
          launcherEntryPath ??
          (() => {
            throw new Error("The Windows launcher entry is missing.")
          })(),
      })
    : undefined
const adapter = createChildProcessLifetimeAdapter({ windows })
const tree = await adapter.launch({
  command: process.execPath,
  args: [treeFixturePath, "tree-ignores-stop", markerPath],
  route: "direct-adapter",
})

tree.stdout.resume()
tree.stderr.pipe(process.stderr)
setInterval(() => undefined, 1_000)
