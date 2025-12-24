import {
  type AppSettings,
  commands,
  type GuiSettings,
  type ProfileSettings,
  type SettingsLoadResult,
} from "../bindings"
import { type Strict, unwrap } from "./commandUtils"

export const settingsExist = () => commands.settingsExist().then(unwrap)

/** Load settings with warnings for any corrected issues */
export const loadSettingsWithWarnings = (): Promise<SettingsLoadResult> =>
  commands.loadSettings().then(unwrap)

/** Load settings (extracts settings from result, ignores warnings) */
export const loadSettings = async (): Promise<GuiSettings> => {
  const result = await loadSettingsWithWarnings()
  return result.settings
}
export const loadAppSettings = () => commands.loadAppSettings().then(unwrap)
export const saveAppSettings = (settings: Strict<AppSettings>) =>
  commands.saveAppSettings(settings).then(unwrap)
export const resetSettings = () => commands.resetSettings().then(unwrap)
export const getDefaultSettings = () => commands.getDefaultSettings()
export const getSettingsPath = () => commands.getSettingsPath().then(unwrap)
export const listProfiles = () => commands.listProfiles().then(unwrap)
export const getActiveProfile = () => commands.getActiveProfile().then(unwrap)
export const setActiveProfile = (name: string) =>
  commands.setActiveProfile(name).then(unwrap)
export const loadProfile = (name: string) =>
  commands.loadProfile(name).then(unwrap)
export const saveProfile = (name: string, settings: Strict<ProfileSettings>) =>
  commands.saveProfile(name, settings).then(unwrap)
export const deleteProfile = (name: string) =>
  commands.deleteProfile(name).then(unwrap)
export const renameProfile = (oldName: string, newName: string) =>
  commands.renameProfile(oldName, newName).then(unwrap)
export const importSettings = (path: string) =>
  commands.importSettings(path).then(unwrap)
export const exportSettings = (settings: Strict<GuiSettings>, path: string) =>
  commands.exportSettings(settings, path).then(unwrap)
