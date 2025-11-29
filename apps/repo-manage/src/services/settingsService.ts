import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, GuiSettings } from "../types/settings";

export async function settingsExist(): Promise<boolean> {
  return invoke("settings_exist");
}

export async function loadSettings(): Promise<GuiSettings> {
  return invoke("load_settings");
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await invoke("save_settings", { settings });
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await invoke("save_app_settings", { settings });
}

export async function resetSettings(): Promise<GuiSettings> {
  return invoke("reset_settings");
}

export async function getSettingsPath(): Promise<string> {
  return invoke("get_settings_path");
}

export async function listProfiles(): Promise<string[]> {
  return invoke("list_profiles");
}

export async function getActiveProfile(): Promise<string | null> {
  return invoke("get_active_profile");
}

export async function loadProfile(name: string): Promise<GuiSettings> {
  return invoke("load_profile", { name });
}

export async function saveProfile(name: string, settings: GuiSettings): Promise<void> {
  await invoke("save_profile", { name, settings });
}

export async function deleteProfile(name: string): Promise<void> {
  await invoke("delete_profile", { name });
}

export async function renameProfile(oldName: string, newName: string): Promise<void> {
  await invoke("rename_profile", { oldName, newName });
}

export async function importSettings(path: string): Promise<GuiSettings> {
  return invoke("import_settings", { path });
}

export async function exportSettings(settings: GuiSettings, path: string): Promise<void> {
  await invoke("export_settings", { settings, path });
}

