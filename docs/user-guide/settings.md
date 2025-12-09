# Settings

RepoManage settings are accessible via the sidebar.

## Settings Sidebar

Click the gear icon to open the settings panel.

## Profiles

Profiles allow you to save different configurations (e.g., for different courses).

### Managing Profiles

- **Save** - Save current settings to the active profile
- **Revert** - Discard unsaved changes and reload from the active profile
- **New** - Create a new profile (copy current or start empty)
- **Rename** - Change the active profile name
- **Delete** - Remove the active profile

### Theme

Select your preferred theme:

- **System (Auto)** - Follow OS dark/light mode
- **Light** - Always light mode
- **Dark** - Always dark mode

## Settings Location

Settings are stored in:

| Platform | Location |
|----------|----------|
| macOS    | `~/Library/Application Support/repo-manage/` |
| Windows  | `%APPDATA%\repo-manage\` |
| Linux    | `~/.config/repo-manage/` |

Each profile is stored as a separate JSON file in a `profiles/` subdirectory.
