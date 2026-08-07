import { packageId as applicationPackageId } from "@repo-edu/application"
import { packageId as hostNodePackageId } from "@repo-edu/host-node"
import { createProgram } from "./cli.js"

export const appId = "@repo-edu/cli"
export const workspaceDependencies = [
  applicationPackageId,
  hostNodePackageId,
] as const

export { createProgram }
