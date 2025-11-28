import { invoke } from "@tauri-apps/api/core";

export interface VerifyConfigParams {
  access_token: string;
  user: string;
  base_url: string;
  student_repos_group: string;
  template_group: string;
}

export async function verifyConfig(params: VerifyConfigParams) {
  return invoke<{ success: boolean; message: string; details?: string }>("verify_config", {
    params,
  });
}

export async function setupRepos(args: { config: VerifyConfigParams; yaml_file: string; assignments: string }) {
  return invoke<{ success: boolean; message: string; details?: string }>("setup_repos", args);
}

