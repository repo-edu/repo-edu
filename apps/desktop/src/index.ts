import { packageId as appPackageId } from "@repo-edu/renderer-app"
import { packageId as testFixturesPackageId } from "@repo-edu/test-fixtures"

export const appId = "@repo-edu/desktop"
export const workspaceDependencies = [
  appPackageId,
  testFixturesPackageId,
] as const
