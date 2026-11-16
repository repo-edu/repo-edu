# Writing a ruling

The fix session or implementation worker writes the final ruling when a user
decision remains open. Use the supplied output path under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) and
report completion under the shared protocol's
[Runner result](../../../references/round-protocol.md#runner-result). Review it
for clarity in this same session. No separate drafting or editing session
follows. The runner prints a notice in place of the ruling's text. The user
answers in the Claude desktop chat through `/ruling`, under
[Answering a ruling](answer.md), and that chat reads this document whole.

## Scope

Explain only the decisions the current work left open. An audit fix does not
reopen settled findings, add findings or change agreed verdicts. If current
code contradicts an open item's evidence, state that uncertainty within the
item.

The user names the winner of each serious contest or split, and the ruler
names the winner of every other one under the shared
[Reconciliation](../../../references/round-protocol.md#reconciliation). A
winner the ruler named is settled like an agreed verdict, and the ruling does
not reopen it. When the ruler's reason says a real choice remains, that choice
is an open item like any other.

## Reading order

Every session that judges an open item reads its evidence in one fixed order.
That holds for the session that writes a ruling, for the `/ruling` chat that
answers it and for the ruler, which names the winner of a contest or split on
a C or D finding. Work each open item in five steps:

1. List every point on which the sides differ. For a contest or a split the
   sides are the audit report, each vetter and the rebuttal. For an item with
   no dispute, such as a real choice or a worker's question, the points are the
   claims that each option rests on.
2. For each point, list the sources that can settle it. These are every source
   a side names and the text that governs the point, even when no side names
   it: the plan decision or step, the boundary entry, the doctrine rule, or the
   code and the test that covers it.
3. Open each source in this session and read the named part with enough around
   it to judge. A quotation in a report or in the ruling is no source.
4. Record, for each point, what each side claims, the source and the place in
   it, the passage read and what that passage settles.
5. Conclude from that record alone. A claim that could not be checked is marked
   as unchecked and carries no conclusion.

A source counts as opened when this session read it: through a tool call, or as
a file the runner supplied whole. A source the session opened earlier, while it
grounded the findings, is not opened twice. The ruler also names and opens each
source in the one form that the shared protocol's
[Ruler duties](../../../references/round-protocol.md#ruler-duties) set.

This section owns the order for every session that judges a dispute. Another
workflow points here instead of copying it. Two copies in two listed files
would drift apart, and a later edit to one would miss the other.

## Evidence record

Each open item carries its evidence record before its recommendation. The
record is the result of steps 1 to 4 of the reading order, written into the
item. Open each source yourself. Mark a claim you could not check as unchecked.
The recommendation uses no unchecked claim.

The record is prose or a list inside the item. It has no parsed form, and no
runner code reads it. A plain choice with no fact in dispute still carries a
record. That record is short: it names the sources the options rest on and says
that no point is in dispute.

An example of a record with two points:

```text
Point 1: whether the report reader admits an empty plan target.
- Audit report: the reader stores it as a deferral.
- Vetter abx: the reader refuses it.
- Opened: .agents/references/round-grammar.md, the case
  report/empty-plan-target.
- Read: "Refusal: `Finding 1 has an empty plan target`".
- Settles: the reader refuses it, so vetter abx is right.

Point 2: whether a past round wrote an empty plan target.
- Rebuttal: two rounds did.
- Unchecked: the rebuttal names no round, and no source this
  session opened shows one.
```

This rule's case: it applies to every ruling that a fix or an implementation
worker writes. Ten rounds wrote one between 2026-11-14 and 2026-11-16. Without
it, a ruling states a side's evidence from the reports, and nothing shows which
claims the writer opened. Three of those ten rulings have an open item with no
word on what the fix checked. Accepting that was rejected because the suggested
answer becomes the stored winner and reason. All eleven winners stored from
those rulings name the vetter the ruling suggested, and ten keep its reason word
for word. Each ruling costs the reads its writer had not yet made and a longer
text for the chat and the user. A plain choice now carries a short record too. A
list of what the session checked was weighed instead and not taken: it shows
what was checked but not what was left out, while a row for each point shows
both.

## Length and voice

Use simple words and scale the explanation to the decision. A straightforward
choice needs a few sentences beside its short record. Expand where competing
benefits, uncertain evidence or consequences need explanation. Do not fill a
fixed set of sections when they would repeat the same point.

Explain what the user would do and see. Describe code changes through what they
must keep track of and enforce. Use paths or identifiers only when the user
needs them to locate evidence. Expand unfamiliar terms where they occur.

## Contents

Use a short title naming the audited scope or implementation step. In a fix,
keep its numbering for open items so the user's reply can refer to them. Each
item covers:

1. The decision and why it needs the user's answer.
2. The viable alternatives and their material differences.
3. The evidence record, under [Evidence record](#evidence-record).
4. One recommendation, its reason and any material tradeoff.
5. A short suggested answer. The `/ruling` chat compares it with its own record
   and proposes what that record supports.

For each serious contest or split under the shared
[Reconciliation](../../../references/round-protocol.md#reconciliation), state
each vetter's position, by its tag, and the rebuttal's answers separately, with the
evidence each names, before the record and the recommendation. The record then
shows what that evidence says. The user gives each such finding
a winner, `report`, the tags of the vetters that were right or `neither`, with a
one-line reason, so the suggested answer names both. Suggest `not yet` when the
user should first ask the fix a question.

Price the request under the plan doctrine's
[Mechanism cases](../../../../../plan/CLAUDE.md#mechanism-cases).
Do not invent a disadvantage for every option. Explain changes to owners, state or rules when they
affect the choice. Include the finding context needed to decide each open item. The full round's
findings and ratings stay in the round transcript.

## Review and replies

Before returning, check that the ruling stands alone and keeps settled matters
settled. Check that each open item carries its evidence record and that its
recommendation uses no unchecked claim. Check that
each open item is a real choice under the shared
[Real choices](../../../references/round-protocol.md#real-choices). An item
that section settles is not open: apply its winning option and drop it from
the ruling. A serious contest or split named in the `contests` phase argument
stays in the ruling even when that section settles the choice. The winning option becomes
the recommendation. Revise any unclear or unsupported claim in this session.

After a user reply, answer any questions before acting. If a decision remains
open, replace the ruling with the current choices and return `needs-ruling`
again. Carry resolved choices into the resumed work; do not ask the user to
decide them again. The resumed phase arguments carry each serious contest's or
split's recorded winner and reason. Apply those answers without reinterpreting the
user's words. Use the shared **Runner result** for required write failures.
Finished work needs no ruling document.
