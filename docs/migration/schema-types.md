# Schema Type Inventory

Usage indicates direct appearance in Tauri command signatures (nested usage is not inferred).

- [ ] ActiveTab | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) | usage:
  unused
- [ ] AppError | source: apps/repo-manage/src-tauri/src/error.rs | serde: (none) | usage: output
- [ ] AppSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: both
- [ ] CanvasConfig | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] CloneParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: input
- [ ] CommandResult | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: output
- [ ] ConfigParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: input
- [ ] CourseEntry | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] DirectoryLayout | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GenerateFilesParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde:
  (none) | usage: input
- [ ] GetGroupCategoriesParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde:
  (none) | usage: input
- [ ] GiteaConfig | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GitHubConfig | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GitLabConfig | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GitServerType | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GitSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] GroupCategory | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: output
- [ ] GuiSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: output
- [ ] LmsSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] LmsUrlOption | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] LogSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] MemberOption | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] MoodleConfig | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] ProfileSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: input
- [ ] RepoSettings | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: unused
- [ ] Result | source: apps/repo-manage/repo-manage-core/src/error.rs | serde: (none) | usage:
  output
- [ ] SettingsLoadResult | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none)
  | usage: output
- [ ] SetupParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) |
  usage: input
- [ ] Theme | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none) | usage:
  unused
- [ ] VerifyCourseParams | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none)
  | usage: input
- [ ] VerifyCourseResult | source: apps/repo-manage/src-tauri/src/generated/types.rs | serde: (none)
  | usage: output

## Command Inventory

| Command | Input Types | Output Type | Error Type | Source |
| --- | --- | --- | --- | --- |
| get_token_instructions | lms_type: String | String | AppError | apps/repo-manage/src-tauri/src/commands/lms.rs |
| open_token_url | base_url: String, lms_type: String | () | AppError | apps/repo-manage/src-tauri/src/commands/lms.rs |
| verify_lms_course | params: VerifyCourseParams | VerifyCourseResult | AppError | apps/repo-manage/src-tauri/src/commands/lms.rs |
| generate_lms_files | params: GenerateFilesParams, progress: Channel<String> | CommandResult | AppError | apps/repo-manage/src-tauri/src/commands/lms.rs |
| get_group_categories | params: GetGroupCategoriesParams | Vec<GroupCategory> | AppError | apps/repo-manage/src-tauri/src/commands/lms.rs |
| verify_config | params: ConfigParams | CommandResult | AppError | apps/repo-manage/src-tauri/src/commands/platform.rs |
| setup_repos | params: SetupParams | CommandResult | AppError | apps/repo-manage/src-tauri/src/commands/platform.rs |
| clone_repos | params: CloneParams | CommandResult | AppError | apps/repo-manage/src-tauri/src/commands/platform.rs |
| list_profiles | (none) | Vec<String> | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| get_active_profile | (none) | Option<String> | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| set_active_profile | name: String | () | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| load_profile | name: String | SettingsLoadResult | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| save_profile | name: String, settings: ProfileSettings | () | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| delete_profile | name: String | () | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| rename_profile | old_name: String, new_name: String | () | AppError | apps/repo-manage/src-tauri/src/commands/profiles.rs |
| load_settings | (none) | SettingsLoadResult | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| load_app_settings | (none) | AppSettings | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| save_app_settings | settings: AppSettings | () | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| reset_settings | (none) | GuiSettings | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| get_default_settings | (none) | GuiSettings | (none) | apps/repo-manage/src-tauri/src/commands/settings.rs |
| get_settings_path | (none) | String | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| settings_exist | (none) | bool | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| import_settings | path: String | GuiSettings | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| export_settings | settings: GuiSettings, path: String | () | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| get_settings_schema | (none) | String | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
| load_settings_or_default | (none) | GuiSettings | AppError | apps/repo-manage/src-tauri/src/commands/settings.rs |
