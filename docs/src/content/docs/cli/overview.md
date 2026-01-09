---
title: CLI Overview
description: Command-line interface for automation
---

The `redu` CLI provides command-line access to all repo-manage functionality,
enabling automation and scripting for educational repository management.

## Installation

The CLI is built as part of the repo-manage workspace:

```bash
cargo build -p repo-manage-cli --release
```

The binary is available at `target/release/redu`.

## Quick Start

1. Create a profile in the GUI and configure git/LMS connections
   (the CLI uses saved settings for connections and course IDs)
2. Set the active profile: `redu profile load <n>`
3. Import students: `redu lms import-students`
4. Create an assignment in the GUI and import groups: `redu lms import-groups --assignment <n>`
5. Create repositories: `redu repo create --assignment <n>`

## Command Groups

| Command | Description |
|---------|-------------|
| `profile` | Manage profiles (list, show, load) |
| `roster` | View roster information |
| `lms` | LMS operations (verify, import) |
| `git` | Git platform operations |
| `repo` | Repository operations (create, clone, delete) |
| `validate` | Validate assignment readiness |

## Global Options

| Option | Description |
|--------|-------------|
| `--profile <n>` | Use specific profile (default: active profile). Global flag usable anywhere. |
| `--help` | Show command help |
| `--version` | Show version |
| `--markdown-help` | Print complete CLI documentation as markdown |
