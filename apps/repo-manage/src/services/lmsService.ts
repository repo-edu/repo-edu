import type { Channel } from "@tauri-apps/api/core"
import {
  type CommandResult,
  commands,
  type GenerateFilesParams,
  type GetGroupCategoriesParams,
  type GetGroupsParams,
  type Group,
  type GroupCategory,
  type VerifyCourseParams,
} from "../bindings"
import { type Strict, unwrap } from "./commandUtils"

// Re-export types for compatibility
export type {
  VerifyCourseParams,
  GenerateFilesParams,
  GetGroupCategoriesParams,
  GetGroupsParams,
  Group,
  GroupCategory,
  CommandResult,
}

export const verifyLmsCourse = (params: Strict<VerifyCourseParams>) =>
  commands.verifyLmsCourse(params).then(unwrap)

export const generateLmsFiles = (
  params: Strict<GenerateFilesParams>,
  progress: Channel<string>,
) => commands.generateLmsFiles(params, progress).then(unwrap)

export const getTokenInstructions = (lmsType: string) =>
  commands.getTokenInstructions(lmsType).then(unwrap)

export const openTokenUrl = (baseUrl: string, lmsType: string) =>
  commands.openTokenUrl(baseUrl, lmsType).then(unwrap)

export const getGroupCategories = (params: Strict<GetGroupCategoriesParams>) =>
  commands.getGroupCategories(params).then(unwrap)

export const getGroups = (params: Strict<GetGroupsParams>) =>
  commands.getGroups(params).then(unwrap)
