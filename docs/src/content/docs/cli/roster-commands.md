---
title: Roster Commands
description: View roster information from the command line
---

View roster information from the command line.

## redu roster show

Display roster summary and optionally detailed contents.

```bash
redu roster show [--profile <n>] [--students] [--assignments]
```

### Options

| Option | Description |
|--------|-------------|
| `--profile <n>` | Profile to use |
| `--students` | Include student list |
| `--assignments` | Include assignment/group details |

### Examples

```bash
# Show summary
redu roster show
# Roster Summary
# ==============
# Profile: cs101-fall-2025
# Students: 45
# Assignments: 3
#   - task-1 (12 groups)
#   - task-2 (12 groups)
#   - task-3 (15 groups)

# Show with students
redu roster show --students

# Show with assignment details
redu roster show --assignments
```
