---
reads:
  - ../../../../glossaries/audit-round.md
  - ruling.md
---

# Answering a ruling

This workflow runs the `/ruling [target]` chat. A run in the terminal waits for
the user's ruling. The chat reads the evidence itself, explains the ruling,
proposes the answer its own reading supports, takes the user's decision and
sends it to the waiting run.

[Writing a ruling](ruling.md) owns what a ruling holds and the reading order
both sessions follow. This file owns how a ruling is answered. The two are
halves of one contract and change together. The launcher lives in the plan
checkout at `home/claude/commands/ruling.md`. It has no Codex counterpart,
because the waiting run's notice and dialog name only the Claude desktop app.

The chat writes only its answer file. It never edits the ruling, the round's
files, the plan or the code.

## Runner commands

The chat uses two hidden runner commands. Run each as a bare `pnpm` command
from the checkout the chat runs in:

1. `pnpm audit-round ruling [target]` prints what the waiting run asks and the
   form of the answer.
2. `pnpm audit-round answer [target] <file>` sends one answer document and
   prints the run's response.

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
   5. the winner words, with the tags of the round's vetters, and the answer
      form

   When several runs wait, it names their targets. Ask the user which one.
   When none waits, say so and stop.
2. **Read the evidence yourself.** Read the ruling file whole. For an audit fix
   with findings that need a winner, also read the round's audit report, every
   vet report and the rebuttal report. They sit beside the ruling in the evidence
   checkout's `plan-evidence/active/` folder. Their names share the ruling's start up to the order
   number: 2 for the audit report, 3 for each vet report, named by its vetter's tag, and 4
   for the rebuttal. An implementation
   worker's ruling has no finding; read the plan step it names.

   Then follow the [Reading order](ruling.md#reading-order) for each open item
   and build your own evidence record. Take the points from the round's reports,
   not from the ruling's record. On a worker's ruling, take them from the
   options the ruling weighs, and open every source its record names beside the
   sources the reading order adds. Read the open items only and reopen no
   settled finding.
3. **Explain and propose the record.** The first message shows what the user
   needs to decide and keeps the rest of the record for a request. It holds
   three parts, in this order:
   1. **The result.** One line for each open item says what the chat's own
      reading gives: it supports the ruling's suggested answer, it differs from
      it or a point that decides the open item could not be checked. The result
      leads because it is what the user acts on first.
   2. **Each open item in turn.** Under a heading that names the open item,
      such as `Finding 2`, the open item shows:
      1. what is being decided, each option and what it means for the user, and
         the ruling's recommendation with its reason
      2. the points that settle it: the chat's own record in short form
      3. the differences from the ruling's record
   3. **The proposed record.** Each finding's winner and reason, then the
      reply, in the words that will be sent.

   The proposed record comes last, so the user meets it where the message ends.
   Only the request for the yes and the line on asking for the full record
   follow it.

   Scale the explanation to the decision. A plain choice takes a few sentences.
   The message holds several numbered lists, so each list inside an open item
   stands under a label that names its entries: the options, the points and
   the differences. A reference then names the open item, the kind of entry and
   its number, such as `finding 2, point 1`. A bare number, or a word that fits
   every list, would not say which list is meant.

   The points that settle it stand under a label that calls them points, such
   as `Points that settle it`. Each point holds three things: the question or
   claim the sides differ on, the source the chat opened with the place in it
   and what that source settles. A claim the chat could not check keeps its
   place, and its entry says what could not be opened. On an open item with no
   dispute, such as a real choice or a worker's question, the points are the
   claims an option rests on. The shown point leaves out each side's claim in
   full and the passage read. A claim on which all sides agree is not listed;
   when the chat finds such a claim false, that is a difference. An example:

   ```text
   Points that settle it:
   1. Would the watch lose the wide-name rule? No. Its workflow states
      the rule itself, at lines 482 to 484. Vetter `abx` is right.
   2. Would the close lose rules? No. Its workflow states each of them
      itself, at lines 51, 71 and 138. Vetter `abx` is right.
   3. Is Walk-through item 2.4 false? No. "Both kinds" means both kinds
      of round, by Decision 4, item 1. Vetter `abx` is right.
   ```

   Each point keeps its source and the place, so the user can check any point
   and a point without a source shows as unchecked. What the short form leaves
   out the user needs only when a point surprises.

   A difference is a source that reads otherwise than the ruling says, a point
   the ruling leaves out or a claim the ruling marks as unchecked that the chat
   could check. A difference that changes the proposed winner, its reason or
   the reply, or that leaves a deciding point unchecked, is told with its
   evidence: the source, the place and the passage. Any other difference gets
   one line, because it still shows how exact the ruling was. When there is
   none, the result line says that both readings agree and the open item has
   no differences to list.

   The proposed record is shown once, in words. The JSON document is written
   only at sending, in step 5: the words are what the user confirms, and the
   run checks the document's form.

   Propose for each finding the winner and the one-line reason that the chat's
   own record supports. When they match the ruling's suggested answer, use its
   words if they fit. When they differ, say so and name the evidence. When a
   point that decides a finding stays unchecked, propose no winner for that
   finding. Say what could not be opened and propose `not yet` with the
   question for the fix.

   Each finding that needs a winner gets one answer:
   1. a winner word with a one-line reason
   2. `not yet`, which leaves the finding open for a question to the fix

   Use the winner words `ruling` printed, because the runner's one list owns
   them. A winner may name one or more vetter tags, written as a list. `not yet`
   takes no reason.

   The reply is the free text for the fix. It holds the user's decision on an
   implementation ruling, the question behind a `not yet` and anything else the
   user wants the fix to know. It may be empty only when every finding has a
   winner.

   Answer the user's later questions from the same files and the sources they
   cite. Read a cited source before stating what it says.

   The full record stays in this session and is written to no file. When the
   user asks about an open item or names a point, give that part in full: what
   each side claims, the source and the place in it, the passage read and what
   it settles. The chat opened those sources itself, so it gives a passage
   without a new round of reading. The first message closes with one line,
   after the proposed record and the request for the yes, that says how to ask:
   name the open item and the point's number, such as `finding 2, point 1`.

   The chat proposes because a user who must retype an answer checks nothing
   by typing it. It proposes from its own record and not from the ruling's
   suggested answer, because a yes turns the proposal into the stored winner and
   reason. The chat is the one reader between the fix and the user that wrote
   nothing in the round. The fix often runs on one side's model, and a chat that
   passed on the fix's answer would pass on that lean.

   This rule's case: the own record and the bar on an unchecked point apply to
   every `/ruling` chat, one for each ruling. Ten rulings were written between
   2026-11-14 and 2026-11-16. Without the rule, the chat explains and proposes
   from the ruling and the reports, and nothing shows what it opened. Accepting
   that was rejected because of what a wrong winner costs: the fix applies the
   wrong side, and the model read-out counts the wrong side as wrong. Each chat
   costs the reading before its first message, a short list of the points that
   settle each open item in that message and a second reading of sources the
   fix already read. A finding whose deciding source cannot be opened gets no
   proposed winner and costs one more exchange. Two smaller rules were weighed
   and not taken. Opening the sources without a record leaves nothing for the
   user to see. Checking only the sources the ruling's record names keeps out a
   point the fix left out.

4. **Take the decision and wait for the user's yes.** The user's yes makes the
   proposed record the decision. The user's own words replace any part of it.
   A reason the user gives keeps the user's words, joined on one line. When
   the user's words leave a winner or a reason unclear, ask. After each
   change, show the new record and wait again. Send nothing before the yes.
   Without it a winner or reason that the chat proposed or read from free
   words would be stored unseen.
5. **Send and relay.** Write the record as one JSON document in the form
   `ruling` printed, to a new file under `$TMPDIR` with the Write tool. Send it
   with `answer`, naming the target `ruling` printed. Relay the run's response:
   1. Accepted: the run resumes the same fix or worker session in its
      terminal, and this chat's work ends.
   2. Refused: the response names what is missing. Ask the user for it, show the
      corrected record and send again after the yes.

## Questions for the fix

This chat is a fresh session and does not hold what the fix or worker read. A
question only that session can answer, such as why it weighed an option as it
did, still goes to it. So does a point that decides a finding when this chat
could not open its source. On an audit fix, answer the finding with `not yet`
and put the question in the reply. On an implementation ruling, put the
question in the reply. The session answers and writes a new ruling when the
decision stays open. The run then waits again, and the user answers with
`/ruling` once more.
