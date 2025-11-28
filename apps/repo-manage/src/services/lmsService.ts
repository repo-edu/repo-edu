import { invoke, type Channel } from "@tauri-apps/api/core";

export interface VerifyLmsCourseParams {
  base_url: string;
  access_token: string;
  course_id: string;
  lms_type: "Canvas" | "Moodle";
}

export interface GenerateLmsFilesParams extends VerifyLmsCourseParams {
  yaml_file: string;
  info_file_folder: string;
  csv_file: string;
  xlsx_file: string;
  member_option: "(email, gitid)" | "email" | "git_id";
  include_group: boolean;
  include_member: boolean;
  include_initials: boolean;
  full_groups: boolean;
  csv: boolean;
  xlsx: boolean;
  yaml: boolean;
}

export async function verifyLmsCourse(params: VerifyLmsCourseParams) {
  return invoke<{ success: boolean; message: string; details?: string }>("verify_lms_course", {
    params,
  });
}

export async function generateLmsFiles(
  params: GenerateLmsFilesParams,
  progress?: Channel<string>
) {
  return invoke<{ success: boolean; message: string; details?: string }>("generate_lms_files", {
    params,
    progress,
  });
}

export async function getTokenInstructions(lmsType: "Canvas" | "Moodle") {
  return invoke<string>("get_token_instructions", { lms_type: lmsType });
}

export async function openTokenUrl(baseUrl: string, lmsType: "Canvas" | "Moodle") {
  // Backend expects camelCase keys
  return invoke("open_token_url", { baseUrl, lmsType });
}
