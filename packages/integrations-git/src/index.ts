import { packageId as contractPackageId } from "@repo-edu/integrations-git-contract";

export const packageId = "@repo-edu/integrations-git";
export const workspaceDependencies = [contractPackageId] as const;
