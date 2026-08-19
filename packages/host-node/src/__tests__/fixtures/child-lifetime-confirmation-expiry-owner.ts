import { readFile } from "node:fs/promises"
import { ChildProcessTreeUnconfirmedError } from "../../child-process-lifetime.js"
import { createPosixChildProcessLifetimeAdapter } from "../../posix-child-process-lifetime-adapter.js"

const markerPath = process.env.REPO_EDU_CHILD_LIFETIME_MARKER
const treeFixturePath = process.env.REPO_EDU_CHILD_LIFETIME_TREE_FIXTURE

if (!markerPath || !treeFixturePath) {
  throw new Error(
    "The child-process confirmation-expiry fixture is missing its paths.",
  )
}

const adapter = createPosixChildProcessLifetimeAdapter({
  processGroupExists: () => true,
  signalProcessGroup: () => true,
})
const tree = await adapter.launch(
  {
    command: process.execPath,
    args: [treeFixturePath, "tree-ignores-stop", markerPath],
    proof: "target-exit",
  },
  new AbortController().signal,
  {
    forcedStopConfirmationPeriodMs: 40,
    gracefulStopPeriodMs: 40,
  },
)
tree.stdout.resume()
tree.stderr.pipe(process.stderr)

while (true) {
  const marker = await readFile(markerPath, "utf8").catch(() => "")
  if (marker.includes("grandchild-ignores-stop-tick")) {
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 20))
}

try {
  await tree.stopAndConfirm()
  throw new Error("The confirmation-expiry proof unexpectedly confirmed.")
} catch (error) {
  if (!(error instanceof ChildProcessTreeUnconfirmedError)) {
    throw error
  }
}
