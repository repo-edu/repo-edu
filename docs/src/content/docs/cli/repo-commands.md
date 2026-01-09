---
title: Repository Commands
description: Create, clone, and delete student repositories
---

Repository operations are performed per-assignment using the `--assignment` flag.

## redu repo create

Create repositories for assignment groups.

```bash
redu repo create --assignment <n> [--profile <n>] [--dry-run]
```

### Options

| Option | Description |
|--------|-------------|
| `--assignment <n>` | Assignment name (required) |
| `--profile <n>` | Profile to use |
| `--dry-run` | Show what would be created without executing |

### Example

```bash
# Preview what would be created
redu repo create --assignment task-1 --dry-run

# Create repositories
redu repo create --assignment task-1
```

## redu repo clone

Clone repositories for assignment groups.

```bash
redu repo clone --assignment <n> [--target <dir>] [--layout <layout>] [--profile <n>]
```

### Options

| Option | Description |
|--------|-------------|
| `--assignment <n>` | Assignment name (required) |
| `--target <dir>` | Target directory (default: current directory) |
| `--layout <layout>` | Directory layout: `flat`, `by-team`, `by-task` |
| `--profile <n>` | Profile to use |

### Example

```bash
# Clone to current directory with flat layout
redu repo clone --assignment task-1

# Clone to specific directory with by-team layout
redu repo clone --assignment task-1 --target ./submissions --layout by-team
```

## redu repo delete

Delete repositories for assignment groups.

```bash
redu repo delete --assignment <n> [--profile <n>] [--force]
```

### Options

| Option | Description |
|--------|-------------|
| `--assignment <n>` | Assignment name (required) |
| `--profile <n>` | Profile to use |
| `--force` | Skip confirmation prompt |

### Example

```bash
# Delete with confirmation
redu repo delete --assignment task-1

# Delete without confirmation (for scripts)
redu repo delete --assignment task-1 --force
```
