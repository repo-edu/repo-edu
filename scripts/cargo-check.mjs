import { spawn } from "node:child_process"

const forwarded = process.argv.slice(2)
const delimiterIndex = forwarded.indexOf("--")
const extraArgs =
  delimiterIndex === -1 ? forwarded : forwarded.slice(delimiterIndex + 1)
const args = ["check", "--workspace", ...extraArgs]
const child = spawn("cargo", args, { stdio: "inherit" })

child.on("exit", (code) => {
  process.exit(code ?? 1)
})
