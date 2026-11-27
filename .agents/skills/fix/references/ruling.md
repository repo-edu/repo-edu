# Writing a ruling

The fix session or implementation worker writes the final ruling when a user
decision remains open. The runner asks the questions an audit's reviews leave
before the fix starts, without a ruling, so a fix writes one only for a
decision that arises during the fix. Use the supplied output path under the runner's
[Phase routing](../../../../tools/audit-round/CLAUDE.md#phase-routing) and
report completion under the shared protocol's
[Runner result](../../../references/round-protocol.md#runner-result). Review it
for clarity in this same session. No separate drafting or editing session
follows. The user answers in a ruling chat with `/ruling` in Claude or
Antigravity or `$ruling` in Codex. That chat reads this document whole under
[Answering a ruling](answer.md).

## Scope

Explain only the decisions the current work left open. An audit fix does not
reopen settled findings, add findings or change agreed verdicts. If current
code contradicts an open item's evidence, state that uncertainty within the
item.

Every winner and choice the fix receives was settled before it started, under
the shared
[Reconciliation](../../../references/round-protocol.md#reconciliation). Each is
settled like an agreed verdict, and the ruling does not reopen it.

## Reading order

Every session that judges an open item reads its evidence in one fixed order. That holds for the
session that writes a ruling, for the ruling chat that answers a ruling or a question the runner
asks before the fix, and for the ruler, which names the winner of a contest or split on a C or D
finding. Work each open item in five steps:

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

In a ruler result put each point's question, sources and evidence in the
supplied fields. A ruling document may use the following prose form:

```text
Point 1: whether a deferral citation can use an abbreviated commit ID.
- Audit report: the reader accepts six characters.
- Vetter abx: the reader requires the full ID.
- Opened: .agents/references/round-grammar.md, Common terminals.
- Read: "An `<applies-token>` keeps the full commit ID and resolves it exactly".
- Settles: the citation requires the full ID, so vetter abx is right.

Point 2: whether a past round wrote an abbreviated citation.
- Rebuttal: two rounds did.
- Unchecked: the rebuttal names no round, and no source this
  session opened shows one.
```

Without the record, a ruling states a side's evidence from the reports, and nothing shows which
claims the writer opened. Case:
[`ruling-evidence-record`](../../../../../plan/CASES.md#ruling-evidence-record).

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
5. A short suggested answer. The ruling chat compares it with its own record
   and proposes what that record supports.

Price the request under the shared protocol's
[Mechanism cases](../../../references/round-protocol.md#mechanism-cases).
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
the ruling. Revise any unclear or unsupported claim in this session.

After a user reply, answer any questions before acting. If a decision remains
open, replace the ruling with the current choices and return `needs-ruling`
again. Carry resolved choices into the resumed work; do not ask the user to
decide them again. Use the shared **Runner result** for required write
failures. Finished work needs no ruling document.
