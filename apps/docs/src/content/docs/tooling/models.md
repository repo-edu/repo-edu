---
title: pnpm audit-round models
description: Compare retained auditor and coder results without starting an assistant
---

Use `pnpm audit-round models` to read the evidence accumulated for configured auditors and coders.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round models         show admitted auditor and coder evidence
pnpm audit-round models --all   also show plans excluded from coder evidence
```

## When do I use it?

Use this command before changing the auditor or coder lists in `tools/audit-round/settings.json`.
It reports observed yield and time rather than starting a new comparison round.

## What does it read?

The command reads checked planning and implementation round data from active plans and the archive.
Commit-series data is not part of the read-out. It joins the plan data with ready, step and close
records from both Git histories and reads the current settings. Incomplete plans remain outside the
coder comparison and appear under `--all`.

## Where does it stop and what do I type?

1. **The read completes.** Type nothing. The command starts no assistant and asks no question.
2. **Stored data is invalid.** Correct the named machine-data or settings error, then run the
   command again.

## What does it leave behind?

The result is terminal Markdown with separate planning-auditor, implementation-auditor, coder and
disproved-finding sections. It writes no round file or round data. If the local
`tools/audit-round/settings.json` is missing, the runner creates it from the committed defaults.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/models.ts` own this page.
