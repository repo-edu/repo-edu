import { commands, type ConfigParams, type SetupParams, type CommandResult } from "../bindings";
import { unwrap } from "./commandUtils";

// Re-export for compatibility
export type { ConfigParams, SetupParams, CommandResult };
export type VerifyConfigParams = ConfigParams;

export const verifyConfig = (params: ConfigParams) => commands.verifyConfig(params).then(unwrap);

export const setupRepos = (params: SetupParams) => commands.setupRepos(params).then(unwrap);
