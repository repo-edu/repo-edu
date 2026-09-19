# Ruling workflow

One shared workflow behind two launchers, both Claude commands:
`.claude/commands/rule.md` writes the draft and `.claude/commands/revise.md`
rewrites it. Each launcher carries only what is specific to it and points here
for the rest, so the two cannot drift apart. Where a launcher and this file
disagree, this file is right. There is no Codex skill beside this file, because
Claude writes both passes.

`/revise` is the second pass over any draft twin a round produces, so it is
given this file as the shape to rewrite towards. It serves the watch document
the same way, under its own workflow.

The ruling is written when the fix phase of a planning or implementation-audit round stops
for the user's decision. It is the document the user rules from. The round's
brief already retells what the round found and what was agreed. The ruling does
the other job: it explains the open item in plain words, says what each way out
costs the user and the plan or code and argues for one of them.

The user directed this on 2026-09-13. Until then they opened a separate chat for
each ruling and asked for the same explanation by hand, twice.

## Why two passes

The draft and the rewrite are separate sessions on purpose. A session that wrote
a draft defends it, and reads its own shorthand as if it were clear. A session
that has never seen the draft reads it the way the user will. So the second pass
is not a polish of the first; it is a fresh reading that rewrites what does not
survive.

## Input

Read the shared [round protocol](../../../references/round-protocol.md) for
file names, writer tags and twin matching.

The first pass is given the round transcript and the audit report. The second
pass is given this workflow, the draft ruling, the transcript and the report.

The launchers and this workflow stay in Repo Edu. Resolve their workflow
references from that checkout. Transcripts may live at either checkout root;
the transcript's directory owns the ruling output, regardless of the launcher
or session directory.

Both passes read what they need to be right:

- the transcript, for what the round found, vetted, rebutted and left open
- the report and its matched vet and rebuttal twins, for the evidence behind each
  open item
- the planning artifact the report names, or the implementation plan for its
  named steps and every **Decisions** entry an open item cites
- the code each open item rests on, at HEAD

This is the difference from the brief, which reads only the transcript and adds
nothing the round did not say. A ruling cannot be written that way: what an
option costs the user and what it costs the code are not in the transcript.

The report's opening names the judged repos and their audited heads. Follow the
`CLAUDE.md` of every repo you read, including its complexity escalation and
build-versus-buy rules, because those rules decide what an option really costs.

## Boundary

The open items belong to the fix phase. This workflow explains them and argues a
choice between the ways they can be settled. It does not reopen a finding the
round settled, add a finding of its own, or change a verdict the vet and the
rebuttal agreed. When the code plainly contradicts the round, say so inside the
item as a caution for the user, and still present the choice the round left.

Both passes are read-only except for the ruling file. Change no code, run no
writing command and land no commit. The user rules in the fix session that is
opened after this workflow finishes, and that session applies the ruling.

## Output

Write the ruling beside the transcript under the shared round protocol: keep
its target and round, spell your own writer tag and use the ruling kind. The
second pass replaces the supplied draft at that same path. The transcript and the brief stay as they
are.

The ruling is Markdown for a person reading in a Markdown viewer. Use headings
and numbered lists where they help. Bold the first words of a paragraph or
bullet, never a whole sentence.

## Voice

The `simple` requirement governs the ruling. Beyond it:

- Explain the mechanism in words, not in names. Say what a piece of code does
  and what goes wrong, not which function or file it is. Keep a path or an
  identifier only where the user needs it to find something.
- Describe from the user's chair: what they do, what they see, and what happens
  instead of what they expect.
- Expand every acronym and coined term the first time.
- Tiers become plain words with the letter after them: `A` is the wrong shape,
  `B` is a real bug, `C` is a detail an implementer would get wrong and `D` is
  wording. Write "a real bug [B]", never "B-tier".
- Keep the fix phase's numbering for the open items, so a reply can point at one
  by number.
- Every item ends with a recommendation. An item that presents options and no
  recommendation has failed this workflow.

## Shape

The ruling has these sections in this order.

1. **Title**: `# <scope>: what needs your ruling`, naming the planning artifact,
   implementation steps or commits the way the transcript's first heading does.
2. **Opening**: one sentence on how the round ended, one sentence on how many
   items are open, and one sentence on what happens after the user rules.
3. **One numbered section per open item**, each holding:
   - **The choice**, one paragraph in plain words: what the round is deciding
     and why it could not decide alone.
   - **What happens today**, one paragraph: what the user does, what they see,
     and what goes wrong.
   - **The options**, one subsection each: what the user would do and see under
     it, and what the code carries afterwards in owners, state and rules. Name a
     real cost for each; an option with no cost is a sign the option is not
     understood yet.
   - **The recommendation**, one paragraph: which option, and the reason it wins
     for this repo under its own rules.
   - **The reply**, one sentence the user can send to the fix session as it
     stands.

Nothing else belongs in the file. The brief already holds the round's findings,
ratings and coverage.

## The second pass

Read the draft, then judge it against these tests before writing anything:

1. Does every option say what the user would do and see, not only what the code
   would become?
2. Does every option name what the code carries afterwards, in owners, state and
   rules?
3. Does every item end with one recommendation and the reason it wins?
4. Is any sentence impossible to follow without the transcript open beside it?
5. Does the draft reopen a settled finding, add one, or quietly decide something
   the round left to the user?

Then rewrite the whole file. Fix what the tests caught, and re-ground anything
the draft asserts that you cannot confirm in the report, the plan or the code.
Never append a critique, a change list or a note about the draft: the file the
user opens must read as the finished ruling and nothing else.

## Runner result

When the prompt identifies an unattended round phase, follow the
audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after the ruling file is written, and return its
absolute path. A wrong or unreadable input is `failed`, with the reason. Never
return `needs-ruling`: this workflow presents a ruling, it never asks one.
