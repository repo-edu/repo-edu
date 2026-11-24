---
reads:
  - ../../../../glossaries/audit-round.md
  - ruling.md
---

# Answering a ruling

This workflow runs the ruling chat, which Claude's `/ruling [target]` and
Codex's `$ruling [target]` start. A run in the terminal waits for the user's
answer: to the questions the runner asks before an audit fix starts, or to a
ruling that a fix or an implementation worker wrote. The chat reads the
evidence itself, explains each open item and what its options cost, proposes
the answer its own reading supports, takes the user's decision and sends it to
the waiting run.

[Writing a ruling](ruling.md) owns what a ruling holds and the reading order
every judging session follows. This file owns how a waiting run is answered.
The two are halves of one contract and change together.

The chat writes only its answer file. It never edits a ruling, the round's
files, the plan or the code.

## Runner commands

The chat uses two hidden runner commands. Run each as a bare `pnpm` command
from the checkout the chat runs in:

1. `pnpm audit-round ruling [target]` prints what the waiting run asks and the
   form of the answer.
2. `pnpm audit-round answer [target] <file>` sends one answer document and
   prints the run's response.

Both open a Unix socket, which a chat's sandbox refuses. When either fails on a
permission error, follow the runner's
[Invocation](../../../../tools/audit-round/CLAUDE.md#invocation) section for
this chat's app. Permission to run a command is not the user's yes to the
proposed record, and that yes grants no permission to run a command.

## Order

1. **Ask what is open.** Run `ruling` with the user's target, or with none when
   the user named none. It prints:
   1. the round or step and its target
   2. the ruling file, when a fix or a worker wrote one
   3. the round's reports: the audit report, every vet report and any rebuttal
      and ruler report
   4. the findings that need a winner and the findings that need a choice
   5. whose model runs the fix, for an audit round
   6. the winner words, with the tags of the round's vetters, and the answer
      form

   When several runs wait, it names their targets. Ask the user which one.
   When none waits, say so and stop.

2. **Read the evidence yourself.** Read the ruling file whole when `ruling`
   names one. For each finding that needs an answer, read its part of every
   round report: the audit report's finding, each vet verdict, the rebuttal's
   answers and any ruler entry with its open choice. An implementation
   worker's ruling has no finding; read the plan step it names.

   Then follow the [Reading order](ruling.md#reading-order) for each open item
   and build your own evidence record. Take the points from the round's
   reports, never from a ruling's record. On a worker's ruling, take them from
   the options the ruling weighs. Open every source a ruling's record names
   beside the sources the reading order adds. Read the open items only and
   reopen no settled finding.

   Before you recommend, read the paragraph on ruling requests in the shared
   protocol's **Mechanism cases** and its **Real choices**, through the links
   `ruling.md` holds. Apply **Real choices** to each open item and price each
   option under that paragraph. A serious contest or split still needs the
   user's winner when **Real choices** settles the recommendation.

3. **Explain and propose the record.** The first message shows what the user
   needs to decide and keeps the rest of the record for a request. It holds
   three parts, in this order:
   1. **The result.** One line for each open item says what the chat
      recommends, or that a point that decides the open item could not be
      checked. On a ruling, the line also says whether the chat's reading
      supports the ruling's suggested answer or differs from it. The result
      leads because it is what the user acts on first. For an audit round,
      follow the opening recommendations with one line, `Auditor model: <model> <effort>`.
      Use the model and effort the audit phase reported in that round's log.
      Write `extra high` as `xhigh`.
   2. **Each open item in turn.** Under a heading that names the open item,
      such as `Finding 2`, the open item shows:
      1. what is being decided, each option and what it means for the user
      2. what each option costs, as that paragraph prices it
      3. the chat's recommendation with its reason
      4. the points that settle it: the chat's own record in short form
      5. on a ruling, the differences from the ruling's record
   3. **The proposed record.** Each finding's winner and reason or its choice,
      then any reply, in the words that will be sent.

   The costs stand before the request for a decision, because a bare
   recommendation can hide the tradeoff. The proposed record comes last, so
   the user meets it where the message ends.
   Only the request for the yes and the line on asking for the full record
   follow it.

   Scale the explanation to the decision. A plain choice takes a few sentences.
   The message holds several numbered lists, so each list inside an open item
   stands under a label that names its entries: the options, the costs, the
   points and the differences. A reference then names the open item, the kind
   of entry and its number, such as `finding 2, point 1`. A bare number, or a
   word that fits every list, would not say which list is meant.

   The points that settle it stand under a label that calls them points, such
   as `Points that settle it`. Each point holds three things: the question or
   claim the sides differ on, the source the chat opened with the place in it
   and what that source settles. A claim the chat could not check keeps its
   place, and its entry says what could not be opened. On an open item with no
   dispute, such as a referred choice or a worker's question, the points are
   the claims an option rests on. The shown point leaves out each side's claim
   in full and the passage read. A claim on which all sides agree is not
   listed; when the chat finds such a claim false, it says so. An example:

   ```text
   Points that settle it:
   1. Would the watch lose the wide-name rule? No. Its workflow states
      the rule itself, at lines 482 to 484. Vetter `abx` is right.
   2. Would the close lose rules? No. Its workflow states each of them
      itself, at lines 51, 71 and 138. Vetter `abx` is right.
   3. Is Failure-record check item 2.4 false? No. "Both kinds" means
      both kinds of round, by Decision 4, item 1. Vetter `abx` is right.
   ```

   Each point keeps its source and the place, so the user can check any point
   and a point without a source shows as unchecked. What the short form leaves
   out the user needs only when a point surprises.

   On a ruling, a difference is a source that reads otherwise than the ruling
   says, a point the ruling leaves out or a claim the ruling marks as unchecked
   that the chat could check. A difference that changes the proposed answer or
   the reply, or that leaves a deciding point unchecked, is told with its
   evidence: the source, the place and the passage. Any other difference gets
   one line, because it still shows how exact the ruling was. When there is
   none, the result line says that both readings agree and the open item has
   no differences to list.

   The proposed record is shown once, in words. The JSON document is written
   only at sending, in step 5: the words are what the user confirms, and the
   run checks the document's form.

   Propose for each finding the answer that the chat's own record supports. On
   a ruling, use the words of its suggested answer when they match and fit,
   and say so when they differ and name the evidence. When a point that
   decides a finding stays unchecked, propose no answer for that finding, say
   what could not be opened and leave the finding open.

   Each finding gets the answer `ruling` asks for:
   1. A finding that needs a winner gets a winner word with a one-line reason.
      A choice joins it when the winning side leaves one open.
   2. A finding that needs a choice gets the user's choice: what the fix does,
      in the user's words. A choice credits no reviewer.

   Use the winner words `ruling` printed, because the runner's one list owns
   them. A winner may name one or more vetter tags, written as a list.

   The reply is free text for the session that wrote a ruling. It holds the
   user's decision on a ruling that asks about no finding and anything else the
   user wants that session to know. Before the fix no session reads a reply, so
   it stays empty and the user's words go into a finding's reason or choice.

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
   by typing it. A yes turns the proposal into the stored winner and reason or
   into the choice the fix applies. The chat is the one reader before the user
   that wrote nothing in the round. On a ruling it proposes from its own record
   and not from the ruling's suggested answer, because the fix often runs on
   one side's model, and a chat that passed on the fix's answer would pass on
   that lean.
   Case: [`ruling-chat-record`](../../../../../plan/CASES.md#ruling-chat-record).

4. **Take the decision and wait for the user's yes.** The user's yes makes the
   proposed record the decision. The user's own words replace any part of it.
   A reason the user gives keeps the user's words, joined on one line. When
   the user's words leave a winner, a reason or a choice unclear, ask. After
   each change, show the new record and wait again. Send nothing before the
   yes. Without it a winner, reason or choice that the chat proposed or read
   from free words would reach the run unseen.

5. **Send and relay.** Write the record as one JSON document in the form
   `ruling` printed, to a new file under `$TMPDIR` with the chat's file-editing
   tool. Send it with `answer`, naming the target `ruling` printed. Relay the
   run's response:
   1. Accepted: the run starts the fix with the answer, or resumes the fix or
      worker session that wrote the ruling, in its terminal, and this chat's
      work ends.
   2. Refused: the response names what is missing. Ask the user for it, show the
      corrected record and send again after the yes.

## Questions the chat cannot settle

Before the fix, the chat answers the user's questions itself, and a finding it
cannot settle waits for the user's own words. A fact the fix finds later
reaches the user through a ruling of its own.

On a ruling that a fix or worker wrote, this chat is a fresh session and does
not hold what that session read. A question only that session can answer, such
as why it weighed an option as it did, goes to it in the reply. So does a point
that decides the ruling when this chat could not open its source. The session
answers and writes a new ruling when the decision stays open. The run then
waits again, and the user answers in a ruling chat once more.
