import {
  commands,
  type ConfigParams,
  type SetupParams,
  type CommandResult,
} from "../bindings";

// Re-export for compatibility
export type { ConfigParams, SetupParams, CommandResult };
export type VerifyConfigParams = ConfigParams;

export async function verifyConfig(params: ConfigParams): Promise<CommandResult> {
  const result = await commands.verifyConfig(params);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function setupRepos(params: SetupParams): Promise<CommandResult> {
  const result = await commands.setupRepos(params);
  if (result.status === "error") throw result.error;
  return result.data;
}
