# Settings & Profiles

repo-edu uses a two-level configuration system: app-level settings (shared) and profile settings
(per-course).

## Accessing Settings

Click the **gear icon** in the top-right corner (or press `Cmd+,`) to open the settings sheet.

## App Settings vs Profile Settings

| Type | Scope | Contains |
|------|-------|----------|
| **App Settings** | Global (all profiles) | Theme, LMS connection, Git connections |
| **Profile Settings** | Per-profile | Course info, operation config, export settings |
| **Roster Data** | Per-profile | Students, groups, assignments |

## Profiles

Profiles let you maintain separate configurations for different courses or semesters.

### Profile Actions

| Action | Description |
|--------|-------------|
| **Save** | Save current settings and roster to the active profile |
| **Revert** | Discard unsaved changes and reload from file |
| **New** | Create a new profile |
| **Delete** | Remove the active profile |

### Creating a Profile

1. Click the profile dropdown in the utility bar
2. Click **New Profile**
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

Select your preferred theme in the Settings sheet:

| Theme | Description |
|-------|-------------|
| **System** | Follow OS dark/light mode setting (default) |
| **Light** | Always use light theme |
| **Dark** | Always use dark theme |

## Connections

### LMS Connection

Configure your LMS connection in Settings → Connections:

- **LMS Type**: Canvas or Moodle
- **Base URL**: Your institution's LMS URL
- **Access Token**: API token for authentication

The LMS connection is shared across all profiles.

### Git Connections

Create named git connections that profiles can reference:

- **Server Type**: GitHub, GitLab, or Gitea
- **Base URL**: Platform URL (required for GitLab/Gitea)
- **Access Token**: Personal access token
- **User**: Your platform username

You can create multiple git connections (e.g., `github-main`, `gitlab-uni`) and select which one
each profile uses.

## Dirty State Indicator

The utility bar shows when you have unsaved changes:

- **Clean**: Settings match the saved profile
- **Dirty**: You have unsaved changes (shown with indicator)

Use **Save** (`Cmd+S`) to persist changes or switch profiles to be prompted.

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
├── app.json                # App-level settings (theme, connections)
├── profiles/
│   ├── default.json        # Default profile settings
│   ├── cs101-fall-2025.json
│   └── sandbox.json
└── rosters/
    ├── default.json        # Roster data for default profile
    ├── cs101-fall-2025.json
    └── sandbox.json
```

### App Settings (`app.json`)

```json
{
  "theme": "system",
  "date_format": "iso",
  "time_format": "24h",
  "lms_connection": {
    "lms_type": "Canvas",
    "base_url": "https://canvas.example.com",
    "access_token": "..."
  },
  "git_connections": {
    "github-main": {
      "server_type": "GitHub",
      "connection": {
        "access_token": "ghp_...",
        "user": "instructor"
      }
    }
  }
}
```

### Profile Settings (`profiles/*.json`)

Each profile contains:

- `course` — Course ID and display name
- `git_connection` — Reference to a named git connection
- `operations` — Target org, repo naming, clone directory
- `exports` — Output folder, file formats, member options

### Roster Data (`rosters/*.json`)

Each roster contains:

- `students` — Student records (name, email, git username)
- `assignments` — Assignment definitions with group configurations

See [Settings Reference](../reference/settings-reference.md) for complete field documentation.

## Importing/Exporting Profiles

### Export

Copy the profile JSON file from the `profiles/` directory. For a complete export, also copy the
corresponding roster file from `rosters/`.

::: warning Security
Remove or redact `access_token` fields before sharing!
:::

### Import

1. Place the JSON files in the appropriate directories
2. Restart the application or select the profile from the dropdown

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

::: tip CLI Status
LMS and Repo CLI commands are temporarily disabled during the roster refactor. Only Profile
commands are currently functional.
:::
