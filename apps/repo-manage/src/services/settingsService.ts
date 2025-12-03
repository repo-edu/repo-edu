import {
  commands,
  type AppSettings,
  type GuiSettings,
} from "../bindings";

export async function settingsExist(): Promise<boolean> {
  const result = await commands.settingsExist();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function loadSettings(): Promise<GuiSettings> {
  const result = await commands.loadSettings();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function saveSettings(settings: GuiSettings): Promise<void> {
  const result = await commands.saveSettings(settings);
  if (result.status === "error") throw result.error;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const result = await commands.loadAppSettings();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const result = await commands.saveAppSettings(settings);
  if (result.status === "error") throw result.error;
}

export async function resetSettings(): Promise<GuiSettings> {
  const result = await commands.resetSettings();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function getSettingsPath(): Promise<string> {
  const result = await commands.getSettingsPath();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function listProfiles(): Promise<string[]> {
  const result = await commands.listProfiles();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function getActiveProfile(): Promise<string | null> {
  const result = await commands.getActiveProfile();
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function setActiveProfile(name: string): Promise<void> {
  const result = await commands.setActiveProfile(name);
  if (result.status === "error") throw result.error;
}

export async function loadProfile(name: string): Promise<GuiSettings> {
  const result = await commands.loadProfile(name);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function saveProfile(name: string, settings: GuiSettings): Promise<void> {
  const result = await commands.saveProfile(name, settings);
  if (result.status === "error") throw result.error;
}

export async function deleteProfile(name: string): Promise<void> {
  const result = await commands.deleteProfile(name);
  if (result.status === "error") throw result.error;
}

export async function renameProfile(oldName: string, newName: string): Promise<void> {
  const result = await commands.renameProfile(oldName, newName);
  if (result.status === "error") throw result.error;
}

export async function importSettings(path: string): Promise<GuiSettings> {
  const result = await commands.importSettings(path);
  if (result.status === "error") throw result.error;
  return result.data;
}

export async function exportSettings(settings: GuiSettings, path: string): Promise<void> {
  const result = await commands.exportSettings(settings, path);
  if (result.status === "error") throw result.error;
}
