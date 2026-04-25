# Coder-interaction level

Governs how aggressively the planner mixes `author_index` across
modules when assigning build commits. Selected per run by the
`-i` / `--coder-interaction` flag and persisted in the plan meta. The
coders themselves are agnostic — they execute whatever commit and
author the planner hands them.

## solo

Single coder; every commit has author_index 0.

## 1

Each module is mostly owned by one coder. When a commit primarily
touches `team[i].module`, prefer author_index = i. Only assign a
non-primary author when the round's note clearly spans multiple
modules.

## 2

Modules have a primary owner but the team collaborates regularly.
Roughly half of the build commits touching a non-primary module can
go to a non-primary author when the note's scope makes it natural.

## 3

The team edits across modules constantly. Treat author_index as
loosely correlated with primary module — frequently assign commits
about `team[i].module` to non-i authors. Some files end up
co-authored by several teammates.
