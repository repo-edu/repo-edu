import { spawn } from "node:child_process"

const args = process.argv.slice(2)
if (args[0] === "--") {
  args.shift()
}

const cargoArgs = ["test", "--workspace", ...args]
const child = spawn("cargo", cargoArgs, { stdio: "inherit" })

child.on("close", (code) => {
  process.exit(code ?? 1)
})
