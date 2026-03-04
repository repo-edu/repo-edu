import { mountSmokeApp } from "@repo-edu/app";
import {
  runInspectUserFileWorkflow,
  runSmokeWorkflow,
  runUserFileExportPreviewWorkflow,
} from "@repo-edu/application";
import { workflowCatalog } from "@repo-edu/application-contract";
import {
  createBrowserMockHostEnvironment,
  packageId as hostBrowserMockPackageId,
} from "@repo-edu/host-browser-mock";

const appPackageId = "@repo-edu/app";
const applicationPackageId = "@repo-edu/application";
const applicationContractPackageId = "@repo-edu/application-contract";
const domainPackageId = "@repo-edu/domain";
const integrationsLmsContractPackageId = "@repo-edu/integrations-lms-contract";
const integrationsGitContractPackageId = "@repo-edu/integrations-git-contract";
const settingsKind = "repo-edu.app-settings.v1";
const workflowCount = Object.keys(workflowCatalog).length;
const providerSummary = "LMS: canvas, moodle | Git: github, gitlab, gitea";

export const appId = "@repo-edu/docs";
export const workspaceDependencies = [
  appPackageId,
  hostBrowserMockPackageId,
  applicationPackageId,
  applicationContractPackageId,
  domainPackageId,
  integrationsLmsContractPackageId,
  integrationsGitContractPackageId,
] as const;

const mountNode = document.querySelector<HTMLElement>("#app");

if (!mountNode) {
  throw new Error("Docs smoke harness mount node #app was not found");
}

const browserMockHost = createBrowserMockHostEnvironment();

void mountSmokeApp({
  target: mountNode,
  runSmokeWorkflow: async () => ({
    ...(await runSmokeWorkflow("apps/docs")),
    adapterPackageId: hostBrowserMockPackageId,
  }),
  inspectUserFile: (file) =>
    runInspectUserFileWorkflow(browserMockHost.userFilePort, file),
  exportPreviewFile: (targetRef) =>
    runUserFileExportPreviewWorkflow(browserMockHost.userFilePort, targetRef),
  rendererHost: browserMockHost.rendererHost,
  shellPackageId: appId,
  browserSafePackages: [
    appPackageId,
    applicationPackageId,
    applicationContractPackageId,
    domainPackageId,
    integrationsLmsContractPackageId,
    integrationsGitContractPackageId,
  ],
  providerSummary,
  workflowCount,
  settingsKind,
});
