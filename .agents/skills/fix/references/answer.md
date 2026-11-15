---
reads:
  - ruling.md
---

# Answering a ruling

This workflow runs the `/ruling [target]` chat. A run in the terminal waits for
the user's ruling. The chat explains the ruling, proposes an answer, takes the
user's decision and sends it to the waiting run.

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
   5. the winner words, with the tags of the round's vets, and the answer
      form

   When several runs wait, it names their targets. Ask the user which one.
   When none waits, say so and stop.
2. **Explain.** Read the ruling file whole. For an audit fix with findings
   that need a winner, also read the round's audit report, every vet twin and
   the rebuttal twin. They sit beside the ruling in the evidence
   checkout's `plan-evidence/active/` folder. Their names share the ruling's start up to the order
   number: 2 for the report, 3 for each vet twin, named by its vet's tag, and 4
   for the rebuttal. An implementation
   worker's ruling has no finding; read the plan step it names. Then explain:
   1. what is being decided
   2. each option and what it means for the user
   3. the recommendation and its reason

   Answer the user's questions from those files and the sources they cite.
   Read a cited source before stating what it says.
3. **Propose the record.** In the same message as the explanation, show the
   record the chat would send: each finding's winner and reason, then the
   reply, exactly as they will be sent. Take them from the ruling's suggested
   answer. When the files read in step 2 contradict that answer, say so, name
   the evidence and propose what it supports instead.

   Each finding that needs a winner gets one answer:
   1. a winner word with a one-line reason
   2. `not yet`, which leaves the finding open for a question to the fix

   Use the winner words `ruling` printed, because the runner's one list owns
   them. A winner may name one or more vet tags, written as a list. `not yet`
   takes no reason.

   The reply is the free text for the fix. It holds the user's decision on an
   implementation ruling, the question behind a `not yet` and anything else the
   user wants the fix to know. It may be empty only when every finding has a
   winner.

   The chat proposes because the ruling already holds a recommendation and a
   suggested answer. Asking the user to type them again adds work and checks
   nothing, because step 4 shows the user every word before it is sent.
4. **Take the decision and wait for the user's yes.** The user's yes makes the
   proposed record the decision. The user's own words replace any part of it.
   A reason the user gives keeps the user's words, joined on one line. When
   the user's words leave a winner or a reason unclear, ask. After each
   change, show the new record and wait again. Send nothing before the yes.
   Without it a winner or reason that the chat proposed or read from free
   words would be stored unseen.
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
