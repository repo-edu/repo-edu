import {
  commands,
  type VerifyCourseParams,
  type GenerateFilesParams,
  type CommandResult,
} from "../bindings";
import type { Channel } from "@tauri-apps/api/core";
import { unwrap, Strict } from "./commandUtils";

// Re-export types for compatibility
export type { VerifyCourseParams, GenerateFilesParams, CommandResult };

export const verifyLmsCourse = (params: Strict<VerifyCourseParams>) =>
  commands.verifyLmsCourse(params).then(unwrap);

export const generateLmsFiles = (params: Strict<GenerateFilesParams>, progress: Channel<string>) =>
  commands.generateLmsFiles(params, progress).then(unwrap);

export const getTokenInstructions = (lmsType: string) =>
  commands.getTokenInstructions(lmsType).then(unwrap);

export const openTokenUrl = (baseUrl: string, lmsType: string) =>
  commands.openTokenUrl(baseUrl, lmsType).then(unwrap);
