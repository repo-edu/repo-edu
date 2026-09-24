# Writing a ruling

The fix session writes the final ruling when a user decision remains open.
Write it before returning `needs-ruling`, at the output path supplied by the
runner. Review it for clarity in this same session. No separate drafting or
editing session follows. The runner displays the ruling directly and collects
the user's reply. The brief runs only after the full fix has completed.

## Evidence and scope

Reuse evidence already established while reconciling the findings. Read more
only when a claim needs verification. Start with the relevant passage in the
report, plan or current code and expand when it does not settle the claim.
Do not reread the whole round merely to write its ruling.

Explain only the decisions the fix left open. Do not reopen settled findings,
add findings or change agreed verdicts. If current code contradicts an open
item's evidence, state that uncertainty within the item.

## Length and voice

Use simple words and scale the explanation to the decision. A straightforward
choice needs a few sentences. Expand where competing benefits, uncertain
evidence or consequences need explanation. Do not fill a fixed set of sections
when they would repeat the same point.

Explain what the user would do and see. Describe code changes through what they
must keep track of and enforce. Use paths or identifiers only when the user
needs them to locate evidence. Expand unfamiliar terms where they occur.

## Contents

Use a short title naming the audited scope. Keep the fix's numbering for open
items, so the user's reply can refer to them. Each item covers:

1. The decision and why it needs the user's answer.
2. The viable alternatives and their material differences.
3. One recommendation, its reason and any material tradeoff.
4. A short suggested reply the user can enter in the runner.

State costs that affect the decision. Do not invent a disadvantage for every
option. Explain changes to owners, state or rules when they affect the choice.
Include the finding context needed to decide each open item. The full round's
findings and ratings belong in the brief after the fix completes.

## Review and replies

Before returning, check that the ruling stands alone, keeps settled matters
settled and supports its recommendation with verified evidence. Revise any
unclear or unsupported claim in this session.

After a user reply, answer any questions before acting. If a decision remains
open, replace the ruling with the current choices and return `needs-ruling`
again. Carry resolved choices into the fix; do not ask the user to decide them
again. Return `failed` if the ruling cannot be written. A finished fix follows
the ordinary completion rules and does not need a ruling document.
