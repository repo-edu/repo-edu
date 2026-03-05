---
title: Profile Commands
description: Manage active and persisted profiles
---

## `redu profile list`

Lists all persisted profiles and marks the selected profile with `*`.

## `redu profile active`

Prints the active profile id.

## `redu profile show`

Prints selected profile JSON.

## `redu profile load <profile-id>`

Sets the active profile in app settings.

## Examples

```bash
node apps/cli/dist/index.js profile list
node apps/cli/dist/index.js profile load seed-profile
node apps/cli/dist/index.js profile show --profile seed-profile
```
