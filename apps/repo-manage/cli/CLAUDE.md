# CLI Crate

Command-line interface for repo-manage operations.

## Architecture

The CLI is a thin wrapper around shared handlers in `repo-manage-core/src/operations/`.
All business logic lives in core; the CLI handles argument parsing and output formatting.

```text
cli/src/
├── main.rs          # Clap definitions, command dispatch
├── commands/        # Command implementations (call handlers)
│   ├── mod.rs
│   ├── git.rs
│   ├── lms.rs
│   ├── profile.rs
│   ├── repo.rs
│   ├── roster.rs
│   └── validate.rs
├── output.rs        # Output formatting (success/error/progress)
└── util.rs          # Profile resolution, roster loading, prompts
```

## Commands

| Command | Handler |
|---------|---------|
| `profile list\|active\|show\|load` | Direct SettingsManager calls |
| `roster show` | Direct roster access |
| `lms verify` | `operations::verify_lms_connection` |
| `lms import-students` | `operations::import_students` |
| `lms import-groups` | `operations::import_groups` |
| `git verify` | `operations::verify_connection` |
| `repo create` | `operations::create_repos` |
| `repo clone` | `operations::clone_repos` |
| `repo delete` | `operations::delete_repos` |
| `validate` | `operations::validate_assignment` |

## Building

```bash
cargo build -p repo-manage-cli
```

## Testing

```bash
cargo test -p repo-manage-cli
```
