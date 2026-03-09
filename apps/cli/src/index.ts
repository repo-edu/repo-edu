import { packageId as applicationPackageId } from "@repo-edu/application"
import { packageId as hostNodePackageId } from "@repo-edu/host-node"
import { createProgram } from "./cli.js"

export const appId = "@repo-edu/cli"
export const workspaceDependencies = [
  applicationPackageId,
  hostNodePackageId,
] as const

export { createProgram }

const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli/src/index.ts") ||
    process.argv[1].endsWith("/cli/dist/index.js"))

if (isDirectExecution) {
  createProgram().parse(process.argv)
}
