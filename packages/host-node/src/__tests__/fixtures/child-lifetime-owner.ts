import { createChildProcessLifetimeController } from "../../child-process-lifetime.js"
import { createWindowsChildProcessLifetimeAdapter } from "../../windows-child-lifetime.js"

const markerPath = process.env.REPO_EDU_CHILD_LIFETIME_MARKER
const treeFixturePath = process.env.REPO_EDU_CHILD_LIFETIME_TREE_FIXTURE

if (!markerPath || !treeFixturePath) {
  throw new Error("The child-lifetime owner fixture is missing its paths.")
}

const launcherEntryPath = process.env.REPO_EDU_WINDOWS_LAUNCHER_ENTRY
const windowsAdapter =
  process.platform === "win32"
    ? createWindowsChildProcessLifetimeAdapter({
        executablePath: process.execPath,
        launcherEntryPath:
          launcherEntryPath ??
          (() => {
            throw new Error("The Windows launcher entry is missing.")
          })(),
        runAsNode: false,
      })
    : undefined
const controller = createChildProcessLifetimeController({ windowsAdapter })
const tree = await controller.launch({
  command: process.execPath,
  args: [treeFixturePath, "tree-ignores-stop", markerPath],
})

tree.stdout.resume()
tree.stderr.pipe(process.stderr)
setInterval(() => undefined, 1_000)
