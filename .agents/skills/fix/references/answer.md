---
reads:
  - ruling.md
---

# Answering a ruling

This workflow runs the `/ruling [target]` chat. A run in the terminal waits for
the user's ruling. The chat explains the ruling, takes the user's decision in
the user's own words and sends it to the waiting run.

[Writing a ruling](ruling.md) owns what a ruling holds. This file owns how it is
answered. The two are halves of one contract and change together. The launcher
lives in the plan checkout at `home/claude/commands/ruling.md`. It has no Codex
twin, because the waiting run opens only the Claude desktop app.

The chat writes only its answer file. It never edits the ruling, the round's
files, the plan or the code.

## Runner commands

The chat uses two hidden runner commands. Run each as a bare `pnpm` command
from the checkout the chat runs in:

1. `pnpm audit-round ruling [target]` prints what the waiting run asks and the
   form of the answer.
2. `pnpm audit-round answer [target] <file>` sends one answer document and
   prints the run's reply.

Both open a Unix socket, which the chat's sandbox refuses. They run outside it
through the user's `sandbox.excludedCommands` entries, as the runner's
[Invocation](../../../../tools/audit-round/CLAUDE.md#invocation) section names
them. A command that fails with `EPERM` means the entries are missing. Say so,
name the three entries and stop. Do not retry inside the sandbox, because there
both commands fail with `EPERM` every time.

## Order

1. **Ask what is open.** Run `ruling` with the user's target, or with none when
   the user named none. It prints:
   1. the round or step and its target
   2. the ruling file
   3. the findings that need a winner
   4. whose model runs the fix, when a fix waits
   5. the answer form and the winner words

   When several runs wait, it names their targets. Ask the user which one.
   When none waits, say so and stop.
2. **Explain.** Read the ruling file whole. For an audit fix with findings
   that need a winner, also read the round's audit report, vet twin and
   rebuttal twin. They sit beside the ruling in the plan checkout's `active/`
   folder. Their names share the ruling's start up to the order number: 2 for
   the report, 3 for the vet and 4 for the rebuttal. An implementation
   worker's ruling has no finding; read the plan step it names. Then explain:
   1. what is being decided
   2. each option and what it means for the user
   3. the recommendation and its reason

   Answer the user's questions from those files and the sources they cite.
   Read a cited source before stating what it says.
3. **Take the decision from the user's words.** Each finding that needs a
   winner gets one answer:
   1. a winner word with a one-line reason
   2. `not yet`, which leaves the finding open for a question to the fix

   Use the winner words `ruling` printed, because the runner's one list owns
   them. Never pick a winner and never write a reason the user did not give.
   When the user's words leave a winner or a reason unclear, ask. A reason keeps
   the user's words, joined on one line. `not yet` takes no reason.

   The reply is the free text for the fix. It holds the user's decision on an
   implementation ruling, the question behind a `not yet` and anything else the
   user wants the fix to know. It may be empty only when every finding has a
   winner.
4. **Show the record and wait for the user's yes.** Show each finding's winner
   and reason, then the reply, exactly as they will be sent. Send nothing
   before the yes. Without it the chat's reading of free words would become
   the stored winner and reason unseen. When the user changes something, show
   the new record and wait again.
5. **Send and relay.** Write the record as one JSON document in the form
   `ruling` printed, to a new file under `$TMPDIR` with the Write tool. Send it
   with `answer`, naming the target `ruling` printed. Relay the run's reply:
   1. Accepted: the run resumes the same fix or worker session in its
      terminal, and this chat's work ends.
   2. Refused: the reply names what is missing. Ask the user for it, show the
      corrected record and send again after the yes.

## Questions for the fix

This chat is a fresh session and does not hold what the fix or worker read. A
question only that session can answer, such as why it weighed an option as it
did, still goes to it. On an audit fix, answer the finding with `not yet` and
put the question in the reply. On an implementation ruling, put the question in
the reply. The session answers and writes a new ruling when the decision stays
open. The run then waits again, and the user answers with `/ruling` once more.
