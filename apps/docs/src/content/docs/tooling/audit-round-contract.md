---
title: pnpm audit-round:contract
description: Refresh the runner's recorded Claude, Codex and Gemini command-line contracts
---

`pnpm audit-round:contract` records what the installed Claude, Codex and Gemini command-line
programs actually stream, so the runner's tests check its readers against real output without making
live model calls.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu root, with the selected command-line programs installed and signed in |
| Owners | `tools/audit-round/references/commands.md`, `tools/audit-round/src/contract.ts` and `tools/audit-round/src/__tests__/fixtures/README.md` |

## Usage

```text
pnpm audit-round:contract                record all three assistants
pnpm audit-round:contract claude         record Claude only
pnpm audit-round:contract codex          record Codex only
pnpm audit-round:contract gemini         record Gemini only, using agy
pnpm audit-round:contract all            record all three, the same as no argument
pnpm audit-round:contract -h | --help    show the recorder's help
```

## Behaviour

Run it when an assistant release changes the event stream the runner reads. It is a fixture
recorder, not part of an audit round or of `pnpm check`.

The recorder starts each selected assistant on the built-in default model and effort and sends it
trivial shell probes through the runner's real invocation, validation and output code. It runs no
workflow.

1. **The first probe** needs one successful and one deliberately failed shell call. The Claude probe
   also keeps a turn that waits for a background command and a final turn with its structured
   result. Codex returns the result in its final message. Gemini returns it in the final
   `structured_output` field.
2. **The second probe** resumes the first session and checks that both invocations return a
   structured result and report token usage.

Every required event must appear before any selected fixture is replaced, so a failed probe leaves
the earlier recordings in place.

## Output

The selected recordings under `tools/audit-round/src/__tests__/fixtures/` are replaced together: the
fresh and resumed streams, each assistant's version file and `recorded-at.txt`. A Codex recording
also replaces its session-file records. Temporary probe files are removed. The recordings are
generated only through this command, never by hand.

## Refuses when

The recorder accepts `claude`, `codex`, `gemini` and `all`. Any other argument produces an
`error:` line before a probe starts.

## Stop and recovery

A probe or its validation fails: the recorder prints `Contract check failed: <reason>`, exits with
status 1 and replaces no selected fixture. Fix the named installation, sign-in or stream problem and
run the command again.
