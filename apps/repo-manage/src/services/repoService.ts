import { commands } from "../bindings/commands"
import type {
  CommandResult,
  ConfigParams,
  SetupParams,
} from "../bindings/types"
import { type Strict, unwrap } from "./commandUtils"

// Re-export for compatibility
export type { ConfigParams, SetupParams, CommandResult }
export type VerifyConfigParams = ConfigParams

export const verifyConfig = (params: Strict<ConfigParams>) =>
  commands.verifyConfig(params).then(unwrap)

export const setupRepos = (params: Strict<SetupParams>) =>
  commands.setupRepos(params).then(unwrap)
