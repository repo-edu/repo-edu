import {
  packageId as applicationPackageId,
  runSmokeWorkflow,
  type SmokeWorkflowResult,
} from "@repo-edu/application";

export const packageId = "@repo-edu/host-browser-mock";
export const workspaceDependencies = [applicationPackageId] as const;

export type BrowserSmokeWorkflowResult = SmokeWorkflowResult & {
  adapterPackageId: typeof packageId
}

export function createBrowserSmokeGateway() {
  return {
    async runSmokeWorkflow(): Promise<BrowserSmokeWorkflowResult> {
      const result = await runSmokeWorkflow("apps/docs");

      return {
        ...result,
        adapterPackageId: packageId,
      };
    },
  };
}
