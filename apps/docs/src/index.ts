import { mountSmokeApp, packageId as appPackageId } from "@repo-edu/app";
import {
  createBrowserSmokeGateway,
  packageId as hostBrowserMockPackageId,
} from "@repo-edu/host-browser-mock";

export const appId = "@repo-edu/docs";
export const workspaceDependencies = [
  appPackageId,
  hostBrowserMockPackageId,
] as const;

const mountNode = document.querySelector<HTMLElement>("#app");

if (!mountNode) {
  throw new Error("Docs smoke harness mount node #app was not found");
}

const browserSmokeGateway = createBrowserSmokeGateway();

void mountSmokeApp({
  target: mountNode,
  runSmokeWorkflow: () => browserSmokeGateway.runSmokeWorkflow(),
  shellPackageId: appId,
});
