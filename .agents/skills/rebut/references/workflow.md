# Implementation-vet rebuttal workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/rebut.md` and the Codex skill
`.agents/skills/rebut/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

The rebuttal is the auditor's answer to the vet. An implementation-audit
round writes its `AUDIT-*.md` report, the other assistant vets it into the
`VET-` twin, and this workflow answers those verdicts in the audit session,
which already holds the evidence the findings rest on, writing the `REBUT-`
twin. The fix workflow at `.agents/skills/fix/references/workflow.md` then
reads all three files. The user directed this chain on 2026-09-09 to give the
fix phase both assistants' views. On 2026-09-11 the user directed Codex to run
the fix in a fresh session, with the audit report and both twins as its brief.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. The `REBUT-` twin is the one file it writes.

When unattended, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after grounding and answering every verdict
and writing the answers and grouped outcome to the `REBUT-` twin; return its
absolute path. Contested verdicts and items for the user's ruling still
complete the rebuttal: the fix phase presents them.

This procedure also serves reports stored at the plan repo root. The plan
repo's rebuttal workflow routes those here and supplies the local
substitutions: that repo's report name and finding metadata.

## Report discovery

The report file's name carries its metadata, parsed from the right as the
vet workflow describes: one or two short shas, the auditor token, `claude`
or `codex`, then the scope and the plan name. When the invocation names a
report file, answer that report's vet. When it names nothing, list
`AUDIT-*.md` at this repo's root and keep each file whose auditor token is
your own and which has a `VET-` twin and no `REBUT-` twin yet. One file left
means answer it. More than one means name them and ask which. None means
ask for the report and wait.

Never answer the vet on a report whose auditor token is the other
assistant's. The rebuttal is the auditor's reply, and the other assistant's
verdicts are not yours to defend. Continue only when the user explicitly
says to.

When the invocation names a report stored at the plan repo root, say the
rebuttal belongs in `../plan` and stop. Continue only when the user
explicitly says to.

## Grounding

Read the report end to end, then the `VET-` twin. Check each sha in the
report name against its repo's `git rev-parse --short HEAD`, and when one
differs list what moved with `git diff --name-only <sha>..HEAD` in that
repo. Answer against HEAD either way, and say where a moved file changes an
answer.

For every verdict, read the source the verdict rests on yourself: the file
path the finding names, the test that covers it, the plan decision or
boundary the vet cites, and the episode's commit bodies where the vet calls
a departure unrecorded. Do not trust the report's quotes or the vet's; the
answer stands on what you read now. Read `../plan/BOUNDARIES.md` and
`../plan/GROWTH-PATTERNS.md` where a verdict invokes them.

## Answers

Answer each verdict in the report's order, one answer per finding.
Every answer starts with exactly `<finding number>. [<tier>] <answer>`.
Use the report's finding number and A/B/C/D tier. The answer is exactly one
of `Agree`, `Contest` or `For user's ruling`.
The first line contains nothing else, for example `1. [B] Agree`.
Conditions, notes and required explanations follow on separate lines.
An unconditional Agree with no additional notes ends after the first line;
do not repeat the finding title, evidence or reasoning. Other answers use a
few short sentences. Every answer is one of three kinds.

- Agree. The verdict stands. Add further information only when agreement is
  conditional or there are additional notes. Agreement with a revise carries
  the revised correction in full as a note so the fix phase has one text to
  apply. Agreement with a drop needs no explanation unless there is a condition
  or an additional note.
- Contest. The verdict rests on something the vet misread. Quote the
  evidence, name its file and line or its plan section, and state what the
  verdict should have been. Contest only on evidence the vet can go and
  read. A disagreement of taste is not a contest; it is an agree with a
  note.
- For user's ruling. The vet sent the item to the user: a full
  reversal of a settled decision or a real unresolved choice about machinery's
  cost, including a run price. State the auditor's position and its
  evidence in the same short form, and stop there. Never settle it here.

A verdict marked `corroborated` by a sibling report still gets its own
answer; corroboration is a reading-order signal, not evidence.

Close with the reconciled outcome in the three groups the fix phase
presents: verdicts both assistants agree on, verdicts this rebuttal
contests, and the items for the user's ruling. This closing section is the
part the fix phase copies forward, so it lists only each finding's first line
under its outcome group.

## Rebuttal file

Write the answers and the closing outcome to the report's twin file, the
same name with `REBUT-` in place of `AUDIT-`, as well as into the chat. The
chat and the file must not differ. The twin is untracked and gitignored, so
writing it keeps the rebuttal read-only.

Then stop. The fix phase runs through the fix launcher, `/fix` for Claude
and `$fix` for Codex, in a fresh Codex session.
The audit report and both twins are its brief. The fix workflow deletes those
files when the records land; this workflow deletes nothing.
