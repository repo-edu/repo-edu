// DO NOT EDIT - Generated from schemas/commands/manifest.json
// Run `pnpm gen:bindings` to regenerate.

import { invoke as TAURI_INVOKE, Channel as TAURI_CHANNEL } from "@tauri-apps/api/core";
import type { AppError, AppSettings, CloneParams, CommandResult, ConfigParams, GenerateFilesParams, GetGroupCategoriesParams, GroupCategory, GuiSettings, ProfileSettings, SettingsLoadResult, SetupParams, VerifyCourseParams, VerifyCourseResult, Result } from "./types";

export const commands = {
  /**
   * Get token generation instructions for an LMS type
   */
  async getTokenInstructions(lmsType: string) : Promise<Result<string, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("get_token_instructions", { lmsType }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Open the LMS token generation page in the browser
   */
  async openTokenUrl(baseUrl: string, lmsType: string) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("open_token_url", { baseUrl, lmsType }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Verify LMS course credentials and fetch course information
   */
  async verifyLmsCourse(params: VerifyCourseParams) : Promise<Result<VerifyCourseResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("verify_lms_course", { params }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Generate student files from an LMS course
   */
  async generateLmsFiles(params: GenerateFilesParams, progress: TAURI_CHANNEL<string>) : Promise<Result<CommandResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("generate_lms_files", { params, progress }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Get group categories (group sets) for a course
   */
  async getGroupCategories(params: GetGroupCategoriesParams) : Promise<Result<GroupCategory[], AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("get_group_categories", { params }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Verify platform configuration and authentication
   */
  async verifyConfig(params: ConfigParams) : Promise<Result<CommandResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("verify_config", { params }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Create student repositories from templates
   */
  async setupRepos(params: SetupParams) : Promise<Result<CommandResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("setup_repos", { params }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Clone student repositories (stub for now)
   */
  async cloneRepos(params: CloneParams) : Promise<Result<CommandResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("clone_repos", { params }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * List all available profiles
   */
  async listProfiles() : Promise<Result<string[], AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("list_profiles") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Get the currently active profile
   */
  async getActiveProfile() : Promise<Result<string | null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("get_active_profile") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Set the active profile
   */
  async setActiveProfile(name: string) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("set_active_profile", { name }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Load a profile by name, returning any migration warnings
   */
  async loadProfile(name: string) : Promise<Result<SettingsLoadResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("load_profile", { name }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Save profile settings as a named profile (app settings are not touched)
   */
  async saveProfile(name: string, settings: ProfileSettings) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("save_profile", { name, settings }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Delete a profile by name
   */
  async deleteProfile(name: string) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("delete_profile", { name }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Rename a profile
   */
  async renameProfile(oldName: string, newName: string) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("rename_profile", { oldName, newName }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Load settings from disk with warnings for any corrected issues
   */
  async loadSettings() : Promise<Result<SettingsLoadResult, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("load_settings") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Load app-level settings (theme, window position, etc.)
   */
  async loadAppSettings() : Promise<Result<AppSettings, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("load_app_settings") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Save only app-level settings (theme, window position, etc.)
   */
  async saveAppSettings(settings: AppSettings) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("save_app_settings", { settings }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Reset settings to defaults
   */
  async resetSettings() : Promise<Result<GuiSettings, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("reset_settings") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Get default settings (single source of truth from Rust)
   */
  async getDefaultSettings() : Promise<GuiSettings> {
    return await TAURI_INVOKE("get_default_settings");
  },
  /**
   * Get settings file path
   */
  async getSettingsPath() : Promise<Result<string, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("get_settings_path") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Check if settings file exists
   */
  async settingsExist() : Promise<Result<boolean, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("settings_exist") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Import settings from a specific file
   */
  async importSettings(path: string) : Promise<Result<GuiSettings, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("import_settings", { path }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Export settings to a specific file
   */
  async exportSettings(settings: GuiSettings, path: string) : Promise<Result<null, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("export_settings", { settings, path }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Get the JSON schema for GuiSettings
   */
  async getSettingsSchema() : Promise<Result<string, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("get_settings_schema") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  },
  /**
   * Load settings or return defaults (never fails)
   */
  async loadSettingsOrDefault() : Promise<Result<GuiSettings, AppError>> {
    try {
      return { status: "ok", data: await TAURI_INVOKE("load_settings_or_default") };
    } catch (e) {
      if (e instanceof Error) throw e;
      return { status: "error", error: e as any };
    }
  }
};

