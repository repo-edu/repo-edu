const { appendFileSync } = require("node:fs")
const { spawn } = require("node:child_process")

const [mode, markerPath] = process.argv.slice(2)

function mark(value) {
  appendFileSync(markerPath, `${value}\n`)
}

if (mode === "grandchild") {
  mark("grandchild-started")
  process.send?.("ready")
  process.on("SIGTERM", () => {
    mark("grandchild-stopped")
    process.exit(0)
  })
  setInterval(() => {
    mark("grandchild-tick")
  }, 20)
} else {
  const grandchild = spawn(
    process.execPath,
    [__filename, "grandchild", markerPath],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  )
  grandchild.once("message", () => {
    if (mode === "parent-exits") {
      process.exit(23)
    }
    if (mode === "tree-waits") {
      process.stdout.write("ready\n")
    }
  })
  process.on("SIGTERM", () => {
    mark("parent-stopped")
    process.exit(0)
  })
}
