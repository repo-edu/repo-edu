/**
 * TypeScript types for RepoBee settings
 * Types are imported from auto-generated bindings.ts (Rust → TypeScript)
 * This file provides default values and helper functions
 */

// Re-export types from bindings (auto-generated from Rust)
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
} from "../bindings"

// Additional type aliases for compatibility
export type LmsMemberOption = "(email, gitid)" | "email" | "git_id"
export type LmsType = "Canvas" | "Moodle"
