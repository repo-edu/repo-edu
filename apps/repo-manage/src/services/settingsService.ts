import { commands, type AppSettings, type GuiSettings } from "../bindings";
import { unwrap } from "./commandUtils";

export const settingsExist = () => commands.settingsExist().then(unwrap);
export const loadSettings = () => commands.loadSettings().then(unwrap);
export const saveSettings = (settings: GuiSettings) => commands.saveSettings(settings).then(unwrap);
export const loadAppSettings = () => commands.loadAppSettings().then(unwrap);
export const saveAppSettings = (settings: AppSettings) => commands.saveAppSettings(settings).then(unwrap);
export const resetSettings = () => commands.resetSettings().then(unwrap);
export const getSettingsPath = () => commands.getSettingsPath().then(unwrap);
export const listProfiles = () => commands.listProfiles().then(unwrap);
export const getActiveProfile = () => commands.getActiveProfile().then(unwrap);
export const setActiveProfile = (name: string) => commands.setActiveProfile(name).then(unwrap);
export const loadProfile = (name: string) => commands.loadProfile(name).then(unwrap);
export const saveProfile = (name: string, settings: GuiSettings) =>
  commands.saveProfile(name, settings).then(unwrap);
export const deleteProfile = (name: string) => commands.deleteProfile(name).then(unwrap);
export const renameProfile = (oldName: string, newName: string) =>
  commands.renameProfile(oldName, newName).then(unwrap);
export const importSettings = (path: string) => commands.importSettings(path).then(unwrap);
export const exportSettings = (settings: GuiSettings, path: string) =>
  commands.exportSettings(settings, path).then(unwrap);
