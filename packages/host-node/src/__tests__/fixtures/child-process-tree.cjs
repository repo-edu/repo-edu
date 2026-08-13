const { appendFileSync } = require("node:fs")
const { spawn } = require("node:child_process")

const [mode, markerPath] = process.argv.slice(2)

function mark(value) {
  appendFileSync(markerPath, `${value}\n`)
}

if (mode === "grandchild" || mode === "tool-descendant") {
  mark(`${mode}-started`)
  process.send?.("ready")
  process.on("SIGTERM", () => {
    mark(`${mode}-stopped`)
    process.exit(0)
  })
  setInterval(() => {
    mark(`${mode}-tick`)
  }, 20)
} else {
  const descendantMode =
    mode === "managed-helper-exits"
      ? "sdk-child"
      : mode === "sdk-child"
        ? "tool-descendant"
        : "grandchild"
  const grandchild = spawn(
    process.execPath,
    [__filename, descendantMode, markerPath],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  )
  grandchild.once("message", () => {
    if (mode === "sdk-child") {
      process.send?.("ready")
    }
    if (mode === "parent-exits" || mode === "managed-helper-exits") {
      process.exit(mode === "parent-exits" ? 23 : 24)
    }
    if (mode === "tree-waits") {
      process.stdout.write("ready\n")
    }
  })
  process.on("SIGTERM", () => {
    mark(mode === "sdk-child" ? "sdk-child-stopped" : "parent-stopped")
    process.exit(0)
  })
}
