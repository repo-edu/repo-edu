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

## Evidence and scope

Reuse evidence already established while reconciling the findings. Read more
only when a claim needs verification. Start with the relevant passage in the
report, plan or current code and expand when it does not settle the claim.
Do not reread the whole round merely to write its ruling.

Explain only the decisions the current work left open. An audit fix does not
reopen settled findings, add findings or change agreed verdicts. If current
code contradicts an open item's evidence, state that uncertainty within the
item.

## Length and voice

Use simple words and scale the explanation to the decision. A straightforward
choice needs a few sentences. Expand where competing benefits, uncertain
evidence or consequences need explanation. Do not fill a fixed set of sections
when they would repeat the same point.

Explain what the user would do and see. Describe code changes through what they
must keep track of and enforce. Use paths or identifiers only when the user
needs them to locate evidence. Expand unfamiliar terms where they occur.

## Contents

Use a short title naming the audited scope or implementation step. In a fix,
keep its numbering for open items so the user's reply can refer to them. Each
item covers:

1. The decision and why it needs the user's answer.
2. The viable alternatives and their material differences.
3. One recommendation, its reason and any material tradeoff.
4. A short suggested answer the user can give in the `/ruling` chat.

For each serious contest or split under the shared
[Reconciliation](../../../references/round-protocol.md#reconciliation), state
each vet's position, by its tag, and the auditor's answers separately, with the
evidence each uses, before the recommendation. The user gives each such finding
a winner, `report`, the tags of the vets that were right or `neither`, with a
one-line reason, so the suggested answer names both. Suggest `not yet` when the
user should first ask the fix a question.

Price the request under the plan doctrine's
[Mechanism cases](../../../../../plan/CLAUDE.md#mechanism-cases).
Do not invent a disadvantage for every option. Explain changes to owners, state or rules when they
affect the choice. Include the finding context needed to decide each open item. The full round's
findings and ratings stay in the round transcript.

## Review and replies

Before returning, check that the ruling stands alone, keeps settled matters
settled and supports its recommendation with verified evidence. Check that
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
