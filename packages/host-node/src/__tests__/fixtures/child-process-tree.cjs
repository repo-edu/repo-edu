const { appendFileSync } = require("node:fs")
const { spawn } = require("node:child_process")

const [mode, markerPath] = process.argv.slice(2)

function mark(value) {
  appendFileSync(markerPath, `${value}\n`)
}

function stop(label) {
  mark(`${label}-stopped`)
  process.exit(0)
}

if (
  mode === "grandchild" ||
  mode === "grandchild-ignores-stop" ||
  mode === "tool-descendant"
) {
  mark(`${mode}-started`)
  mark(`${mode}-pid:${process.pid}`)
  process.send?.("ready")
  process.on("SIGTERM", () => {
    if (mode === "grandchild-ignores-stop") {
      mark(`${mode}-ignored-stop`)
      return
    }
    stop(mode)
  })
  process.on("message", (message) => {
    if (message === "stop") {
      stop(mode)
    }
  })
  setInterval(() => {
    mark(`${mode}-tick`)
  }, 20)
} else {
  mark(`${mode}-pid:${process.pid}`)
  const descendantMode =
    mode === "managed-helper-exits" || mode === "managed-helper-tree-waits"
      ? "sdk-child"
      : mode === "sdk-child"
        ? "tool-descendant"
        : mode === "tree-ignores-stop"
          ? "grandchild-ignores-stop"
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
    if (
      mode === "parent-exits" ||
      mode === "managed-helper-exits" ||
      mode === "tree-completes"
    ) {
      process.exit(
        mode === "parent-exits" ? 23 : mode === "managed-helper-exits" ? 24 : 0,
      )
    }
    if (mode === "tree-waits" || mode === "managed-helper-tree-waits") {
      process.stdout.write("ready\n")
    }
  })
  process.on("SIGTERM", () => {
    if (mode === "tree-ignores-stop") {
      mark("parent-ignored-stop")
      return
    }
    mark(mode === "sdk-child" ? "sdk-child-stopped" : "parent-stopped")
    process.exit(0)
  })
  if (process.platform === "win32") {
    process.stdin.resume()
    process.stdin.once("end", () => {
      if (mode === "tree-ignores-stop") {
        mark("parent-ignored-stop")
        return
      }
      if (mode !== "tree-waits" && mode !== "managed-helper-tree-waits") {
        return
      }
      mark(mode === "sdk-child" ? "sdk-child-stopped" : "parent-stopped")
      grandchild.once("exit", () => {
        process.exit(0)
      })
      grandchild.send("stop")
    })
  }
}
