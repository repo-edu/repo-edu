---
title: pnpm audit-round:contract
description: Refresh the runner's recorded Claude and Codex command-line contracts
---

Use `pnpm audit-round:contract` to record the live assistant command-line streams consumed by tests.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout.

```text
pnpm audit-round:contract          record Claude and Codex
pnpm audit-round:contract claude   record Claude only
pnpm audit-round:contract codex    record Codex only
pnpm audit-round:contract both     record both explicitly
```

The selected command-line programs must be installed and authenticated.

## When do I use it?

Use this command when an assistant command-line release changes the event stream the runner
consumes. It is a fixture recorder, not a general runner check and not part of an audit round.

## What does it read?

The recorder starts the selected assistant on the committed default model and effort. It runs
trivial success, deliberate failure and resume probes through the real invocation, validation and
output boundaries. It reads the assistant's reported version and validates that every required
event appeared before replacing fixtures.

## Where does it stop and what do I type?

1. **Every selected probe passes.** Type nothing. The selected recordings are replaced together.
2. **A probe or validation fails.** Correct the named installation, authentication or stream
   problem and run the command again. Existing selected fixtures remain unchanged.

## What does it leave behind?

The command updates selected recordings under `tools/audit-round/src/__tests__/fixtures/`, including
the fresh and resumed streams, assistant version files and `recorded-at.txt`. Codex recording also
updates its selected rollout streams. Temporary probe files are removed.

## What owns this page?

`tools/audit-round/CLAUDE.md`, `tools/audit-round/src/contract.ts` and the fixture directory's
`README.md` own this page.
