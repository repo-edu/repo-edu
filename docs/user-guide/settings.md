# Settings & Profiles

repo-edu uses a profile-based configuration system, allowing you to maintain separate settings for
different courses or semesters.

## Accessing Settings

Click the **gear icon** in the sidebar to open the settings panel.

## Profiles

Profiles store all configuration settings (LMS, Git platform, output options). Switch between
profiles to quickly change contexts.

### Profile Actions

| Action | Description |
|--------|-------------|
| **Save** | Save current settings to the active profile |
| **Revert** | Discard unsaved changes and reload from file |
| **New** | Create a new profile |
| **Rename** | Change the active profile name |
| **Delete** | Remove the active profile |

### Creating a Profile

1. Click **New** in the profile dropdown
2. Choose to copy current settings or start empty
3. Enter a name (e.g., `cs101-fall-2025`)
4. Click **Create**

### Switching Profiles

Select a different profile from the dropdown. Changes are loaded immediately.

::: warning Unsaved Changes
If you have unsaved changes, you'll be prompted to save or discard them before switching.
:::

### Best Practices

- Create one profile per course or semester
- Use descriptive names: `cs101-fall-2025`, `thesis-supervision`
- Keep a `sandbox` profile for testing
- Profiles are shared between GUI and CLI

## Theme

Select your preferred theme:

| Theme | Description |
|-------|-------------|
| **System (Auto)** | Follow OS dark/light mode setting |
| **Light** | Always use light theme |
| **Dark** | Always use dark theme |

## Dirty State Indicator

The settings panel shows when you have unsaved changes:

- **Clean**: Settings match the saved profile
- **Dirty**: You have unsaved changes (shown with indicator)

Use **Save** to persist changes or **Revert** to discard them.

## Configuration Files

### Storage Location

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/repo-edu/` |
| Windows | `%APPDATA%\repo-edu\` |
| Linux | `~/.config/repo-edu/` |

### File Structure

```text
repo-edu/
├── settings.json           # App-level settings
└── profiles/
    ├── default.json        # Default profile
    ├── cs101-fall-2025.json
    └── sandbox.json
```

### App Settings (settings.json)

```json
{
  "activeProfile": "cs101-fall-2025",
  "theme": "System",
  "activeTab": "Lms"
}
```

### Profile Settings (profiles/*.json)

Each profile contains:

- `git` — Platform credentials and organization settings
- `lms` — LMS connection and output settings
- `repo` — Repository setup and clone settings

See [Settings Reference](../reference/settings-reference.md) for complete field documentation.

## Importing/Exporting Profiles

### Export

Copy the profile JSON file from the `profiles/` directory.

::: warning Security
Remove or redact `access_token` fields before sharing!
:::

### Import

1. Place the JSON file in your `profiles/` directory
2. Restart the application or create a new profile with the same name

## CLI Integration

The CLI (`redu`) uses the same configuration system:

```bash
# List available profiles
redu profile list

# Switch to a profile
redu profile load cs101-fall-2025

# View current settings
redu profile show
```

Changes made in the GUI are immediately available to the CLI, and vice versa.
