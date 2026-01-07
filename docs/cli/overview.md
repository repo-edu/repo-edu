# CLI Overview

The `redu` CLI provides command-line access to repo-edu functionality, sharing the same core logic
and configuration as the GUI application.

## Why Use the CLI?

- **Automation** — Integrate with CI/CD pipelines, scripts, or cron jobs
- **Batch operations** — Process multiple courses or repositories efficiently
- **Headless environments** — Run on servers without a display
- **Scripting** — Combine with other tools in shell workflows

::: warning CLI Commands Disabled
LMS and Repo commands are temporarily disabled during the roster refactor. Only Profile commands
are currently functional.
:::

## Command Structure

```text
redu <command> <subcommand> [options]
```

Three main command groups:

| Command | Description | Status |
|---------|-------------|--------|
| `redu lms` | LMS operations (verify, generate) | *Disabled* |
| `redu repo` | Repository operations (verify, setup, clone) | *Disabled* |
| `redu profile` | Profile management (list, show, load) | Available |

## Quick Examples

```bash
# List available profiles
redu profile list

# Show active profile name
redu profile active

# Show current profile settings
redu profile show

# Switch to a different profile
redu profile load winter-2025
```

::: tip Future Commands
When LMS and Repo commands are re-enabled:

```bash
# Verify LMS connection
redu lms verify

# Generate student files from Canvas
redu lms generate --yaml --csv

# Verify GitLab platform connection
redu repo verify --platform gitlab

# Set up student repositories
redu repo setup --template task-1 --team "alice,bob" --team "charlie,diana"
```

:::

## Configuration

The CLI shares configuration with the GUI application. Settings are stored in:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/repo-edu/` |
| Windows | `%APPDATA%\repo-edu\` |
| Linux | `~/.config/repo-edu/` |

You can also override settings via command-line flags or environment variables. See
[Configuration](./configuration) for details.

## Next Steps

- [Installation](./installation) — Install the CLI
- [LMS Commands](./lms-commands) — Work with Canvas/Moodle
- [Repo Commands](./repo-commands) — Manage Git repositories
