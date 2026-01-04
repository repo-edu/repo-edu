/**
 * TypeScript types for RepoBee settings
 * Types are imported from auto-generated bindings/types.ts (Rust → TypeScript)
 * This file provides default values and helper functions
 */

// Re-export types from bindings (auto-generated from JSON Schemas)
import type {
  ActiveTab,
  AppSettings,
  DirectoryLayout,
  ProfileSettings as GeneratedProfileSettings,
  SettingsLoadResult as GeneratedSettingsLoadResult,
  GiteaConfig,
  GitHubConfig,
  GitLabConfig,
  GitServerType,
  GitSettings,
  GuiSettings,
  LmsSettings,
  LmsUrlOption,
  LogSettings,
  MemberOption,
  RepoSettings,
  Theme,
} from "../bindings/types"

export type {
  ActiveTab,
  AppSettings,
  DirectoryLayout,
  GiteaConfig,
  GitHubConfig,
  GitLabConfig,
  GitServerType,
  GitSettings,
  GuiSettings,
  LmsSettings,
  LmsUrlOption,
  LogSettings,
  MemberOption,
  RepoSettings,
  Theme,
}

// Legacy profile type used by the current frontend until roster-based settings land.
export type ProfileSettings = {
  git: GitSettings
  lms: LmsSettings
  repo: RepoSettings
}

// Legacy load result wrapper for GuiSettings.
export type SettingsLoadResult = {
  settings: GuiSettings
  warnings: string[]
}

// Explicit exports for schema-driven types used in service bridges.
export type SchemaProfileSettings = GeneratedProfileSettings
export type SchemaSettingsLoadResult = GeneratedSettingsLoadResult

// Additional type aliases for compatibility
export type LmsMemberOption = "(email, gitid)" | "email" | "git_id"
export type LmsType = "Canvas" | "Moodle"
