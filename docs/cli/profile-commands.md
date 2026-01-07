# Profile Commands

The `redu profile` command group manages configuration profiles. Profiles allow you to maintain
separate configurations for different courses or semesters.

## redu profile list

List all available profiles.

```bash
redu profile list
```

### Output

```text
Available profiles:
  * cs101-fall-2025 (active)
    cs201-spring-2025
    sandbox
```

The active profile is marked with `*`.

## redu profile active

Show the name of the currently active profile.

```bash
redu profile active
```

### Output

```text
Active profile: cs101-fall-2025
```

Or if no profile is active:

```text
No active profile
```

## redu profile show

Display the complete configuration of the active profile.

```bash
redu profile show
```

### Output

```text
Current Configuration:
======================

Active Profile: cs101-fall-2025

Course:
  ID              : 12345
  Name            : CS101 Introduction to Programming

Git Connection: gitlab-main
  Server Type     : GitLab
  Base URL        : https://gitlab.example.com
  User            : instructor
  Access Token    : ***

Operations:
  Target Org      : cs101-students-2025
  Template Org    : cs101-templates
  Clone Directory : ./repos
  Directory Layout: ByTeam

Export Settings:
  Output Folder   : ./output
  Output YAML     : true
  Output CSV      : false

Settings Directory:
  Location        : /Users/you/Library/Application Support/repo-edu
```

## redu profile load

Switch to a different profile, loading its settings.

```bash
redu profile load <NAME>
```

### Arguments

| Argument | Description |
|----------|-------------|
| `NAME` | Profile name to activate |

### Examples

```bash
# Switch to a different profile
redu profile load cs201-spring-2025

# Output:
# Activated profile: cs201-spring-2025
```

### Errors

```text
Error: Failed to load profile: no-such-profile
```

## Profile Storage

Profiles are stored as JSON files in the configuration directory:

```text
~/.config/repo-edu/                              # Linux
~/Library/Application Support/repo-edu/          # macOS
%APPDATA%\repo-edu\                              # Windows
├── app.json                 # App-level settings (theme, connections)
├── profiles/
│   ├── cs101-fall-2025.json
│   ├── cs201-spring-2025.json
│   └── sandbox.json
└── rosters/
    ├── cs101-fall-2025.json  # Roster data (students, assignments)
    └── ...
```

## Sharing Profiles

Profile files are portable JSON. To share a profile:

1. Copy the profile JSON file from `profiles/`
2. Optionally copy the corresponding roster from `rosters/`
3. Remove or redact sensitive fields (`access_token`)
4. Share the files with colleagues

To import a shared profile:

1. Place the JSON file(s) in the appropriate directories
2. Run `redu profile load <filename-without-extension>`

::: warning Security
Never share profiles containing access tokens. Tokens grant access to your LMS and Git platforms.
:::

## Tips

- Create a profile per course or semester
- Use descriptive names: `cs101-fall-2025`, `thesis-supervision`
- Keep a `sandbox` profile for testing
- The GUI and CLI share the same profiles
