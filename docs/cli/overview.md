# CLI Overview

The `redu` CLI provides command-line access to repo-edu functionality, sharing the same core logic
and configuration as the GUI application.

## Why Use the CLI?

- **Automation** — Integrate with CI/CD pipelines, scripts, or cron jobs
- **Batch operations** — Process multiple courses or repositories efficiently
- **Headless environments** — Run on servers without a display
- **Scripting** — Combine with other tools in shell workflows

## Command Structure

```text
redu <command> <subcommand> [options]
```

Three main command groups:

| Command | Description |
|---------|-------------|
| `redu lms` | LMS operations (verify, generate) |
| `redu repo` | Repository operations (verify, setup, clone) |
| `redu profile` | Profile management (list, show, load) |

## Quick Examples

```bash
# Verify LMS connection
redu lms verify

# Generate student files from Canvas
redu lms generate --yaml --csv

# Verify GitLab platform connection
redu repo verify --platform gitlab

# Set up student repositories
redu repo setup --template task-1 --team "alice,bob" --team "charlie,diana"

# Switch to a different profile
redu profile load winter-2025
```

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
