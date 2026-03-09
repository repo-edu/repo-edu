import { AppRoot } from "@repo-edu/app"
import { packageId as hostBrowserMockPackageId } from "@repo-edu/host-browser-mock"
import { mountDocsDemoApp } from "./demo-runtime.js"

const appPackageId = "@repo-edu/app"
const applicationPackageId = "@repo-edu/application"
const applicationContractPackageId = "@repo-edu/application-contract"
const domainPackageId = "@repo-edu/domain"
const integrationsLmsContractPackageId = "@repo-edu/integrations-lms-contract"
const integrationsGitContractPackageId = "@repo-edu/integrations-git-contract"

export const appId = "@repo-edu/docs"
export const workspaceDependencies = [
  appPackageId,
  hostBrowserMockPackageId,
  applicationPackageId,
  applicationContractPackageId,
  domainPackageId,
  integrationsLmsContractPackageId,
  integrationsGitContractPackageId,
] as const

export { createDocsDemoRuntime, mountDocsDemoApp } from "./demo-runtime.js"

if (typeof document !== "undefined") {
  mountDocsDemoApp({ appRootComponent: AppRoot })
}
