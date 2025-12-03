import {
  commands,
  type VerifyCourseParams,
  type GenerateFilesParams,
  type CommandResult,
} from "../bindings";
import type { Channel } from "@tauri-apps/api/core";

// Re-export types for compatibility
export type { VerifyCourseParams, GenerateFilesParams, CommandResult };

export async function verifyLmsCourse(params: VerifyCourseParams): Promise<CommandResult> {
  const result = await commands.verifyLmsCourse(params);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function generateLmsFiles(
  params: GenerateFilesParams,
  progress: Channel<string>
): Promise<CommandResult> {
  const result = await commands.generateLmsFiles(params, progress);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function getTokenInstructions(lmsType: string): Promise<string> {
  const result = await commands.getTokenInstructions(lmsType);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function openTokenUrl(baseUrl: string, lmsType: string): Promise<void> {
  const result = await commands.openTokenUrl(baseUrl, lmsType);
  if (result.status === "error") throw result.error;
}
