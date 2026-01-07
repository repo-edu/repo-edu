# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

See the root `/CLAUDE.md` for workspace-wide commands and architecture overview.

## CLI-Specific Commands

```bash
# Build
pnpm cli:build                                # Build debug binary (./target/debug/redu)
pnpm cli:build:release                        # Build release binary

# Test
pnpm test:rs -- -p repo-manage-cli            # Run all CLI tests
pnpm test:rs -- -p repo-manage-cli <name>     # Run specific test

# Run
./target/debug/redu --help                    # Show usage
./target/debug/redu --markdown-help           # Generate CLI docs as markdown
```

## Current Status

**LMS and Repo commands are temporarily disabled during roster refactor.** Only Profile commands
are currently functional (`redu profile list|active|show|load`).

## Architecture

The CLI is a thin wrapper around `repo-manage-core` operations:

- `main.rs` - Clap command definitions, handlers, and `ConfigManager`
- `ConfigManager` - Loads settings from `~/.config/repo-manage/settings.json` (shared with GUI)

### Command Structure

Commands use domain-based grouping:

- `redu lms verify|generate` - LMS operations (Canvas/Moodle) — *disabled*
- `redu repo verify|setup|clone` - Repository operations (GitHub/GitLab/Gitea/Local) — *disabled*
- `redu profile list|active|show|load` - Profile management

### Environment Variable Overrides

For CI/automation, settings can be overridden via environment:

- `REPOBEE_BASE_URL`, `REPOBEE_TOKEN`, `REPOBEE_ORG`, `REPOBEE_USER`, `REPOBEE_TEMPLATE_ORG`
- `REPOBEE_CONFIG_DIR` - Override config directory (used in tests for isolation)

## Testing

Integration tests (`tests/integration_tests.rs`) use `assert_cmd` with mockito for HTTP mocking.

Test helpers:

- `cli()` - Creates command with isolated temp config directory
- `cli_with_config_dir(path)` - Creates command with specific config for inspection
- `create_students_yaml(dir, content)` - Creates a student teams YAML file for testing
- `gitlab_user_json()`, `gitlab_group_json()`, `gitlab_members_json()` - Mock GitLab API responses
