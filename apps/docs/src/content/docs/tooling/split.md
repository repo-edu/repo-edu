---
title: pnpm audit-round split
description: Compare designs for a source file and carry out a chosen move list
---

Run a split from either checkout. Give the source path relative to the Repo Edu root.

| Command | What it does |
| --- | --- |
| `pnpm audit-round split design <source>` | Save fresh numbered answers and print their paths and the pick command. |
| `pnpm audit-round split pick <source> <answer>...` | Compare the named answers and print the run command if the pick has moves. |
| `pnpm audit-round split run <move list>` | Run the committed list or a designer's saved answer. |
| `pnpm audit-round split <source>` | Design, pick and carry out the selected moves in one call. |

Use `-v` to see assistant tool calls. A source belongs to a package under `apps/`, `packages/` or
`tools/`.

## How the choice works

Each entry of `split.designers` in the runner settings reads the file independently. Normal density
favours fewer files when the costs balance. Coarse density separates a group only where changes to
it almost never need the rest. The designers can propose moves, leave the file whole or say the
split needs a plan.

Use the printed pick command or give the answer numbers you want to compare. You can mix answers
from different design calls on the same version of the file. The pick skips if a named answer's
source hash differs from the current file. The runner tries the proposed moves in memory. A fresh
picker reads the named answers in number order and may repair a fault in one list. If the answers
agree on keeping the file whole or needing a plan, the runner uses that result without a picker
session. If the tool refuses every list and there is no other answer, the split needs a plan.

A pick with moves prints a run command with a numbered plan path such as
`../plan/splits/packages/domain/src/roster.01.mv.md`. An unchanged pick keeps the designer's number.
A repair takes the next available answer number. To choose a designer's answer yourself, pass
its path from the evidence repo to `split run`. A no-split answer gives its saved reason and leaves
any earlier list in place.

## Results

The last line begins with `SPLIT RESULT:` and gives the result, the source hash and a message.

| Result | What happened |
| --- | --- |
| `answers-saved` | The design answers are saved and the message gives the pick command. |
| `designed` | The plan repo holds the chosen move list. |
| `made` | The split passed the checks and package tests and was committed. |
| `fine` | The source can stay whole. |
| `needs-plan` | The division needs a plan or the tool refused the moves. |
| `skipped` | The source changed or a path the call would write has local edits. |
| `checks-failed` | A check or test failed. The affected files were restored. |

The committed list is read from Git, so local edits to its working copy can stay in place. When
publishing a design, the runner protects both the destination and the older list it would remove.

Each completed call keeps its log and numbered answers in `../plan-evidence/splits/<label>/`, along
with any pick reports and the writers' records. Pick report numbers count separately from answer
numbers. A failed session leaves its files in `../plan-evidence/active/` and prints the reason,
session ID and rerun command. A design retry starts fresh designers. A picker retry uses the same
answer numbers with a fresh picker, including after a failed picker in a bare split.
