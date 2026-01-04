import { commands } from "../bindings/commands"
import type {
  AppSettings,
  ProfileSettings as GeneratedProfileSettings,
} from "../bindings/types"
import type {
  GuiSettings,
  ProfileSettings,
  SettingsLoadResult,
} from "../types/settings"
import { type Strict, unwrap } from "./commandUtils"

export const settingsExist = () => commands.settingsExist().then(unwrap)

/** Load settings with warnings for any corrected issues */
export const loadSettingsWithWarnings = async (): Promise<SettingsLoadResult> =>
  (await commands.loadSettings().then(unwrap)) as unknown as SettingsLoadResult

/** Load settings (extracts settings from result, ignores warnings) */
export const loadSettings = async (): Promise<GuiSettings> => {
  const result = await loadSettingsWithWarnings()
  return result.settings
}
export const loadAppSettings = () => commands.loadAppSettings().then(unwrap)
export const saveAppSettings = (settings: Strict<AppSettings>) =>
  commands.saveAppSettings(settings).then(unwrap)
export const resetSettings = () =>
  commands.resetSettings().then((result) => result as unknown as GuiSettings)
export const getDefaultSettings = () =>
  commands
    .getDefaultSettings()
    .then((result) => result as unknown as GuiSettings)
export const getSettingsPath = () => commands.getSettingsPath().then(unwrap)
export const listProfiles = () => commands.listProfiles().then(unwrap)
export const getActiveProfile = () => commands.getActiveProfile().then(unwrap)
export const setActiveProfile = (name: string) =>
  commands.setActiveProfile(name).then(unwrap)
export const loadProfile = async (name: string): Promise<SettingsLoadResult> =>
  (await commands
    .loadProfile(name)
    .then(unwrap)) as unknown as SettingsLoadResult
export const saveProfile = (name: string, settings: Strict<ProfileSettings>) =>
  commands
    .saveProfile(name, settings as unknown as GeneratedProfileSettings)
    .then(unwrap)
export const deleteProfile = (name: string) =>
  commands.deleteProfile(name).then(unwrap)
export const renameProfile = (oldName: string, newName: string) =>
  commands.renameProfile(oldName, newName).then(unwrap)
export const importSettings = (path: string) =>
  commands
    .importSettings(path)
    .then((result) => result as unknown as GuiSettings)
export const exportSettings = (settings: Strict<GuiSettings>, path: string) =>
  commands
    .exportSettings(settings as unknown as GeneratedProfileSettings, path)
    .then(unwrap)
