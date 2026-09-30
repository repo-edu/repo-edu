# Implementation-vet rebuttal workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/rebut.md` and the Codex skill
`.agents/skills/rebut/SKILL.md`. Each launcher carries only what is
specific to it and points here for the rest, so the two cannot drift
apart. Where a launcher and this file disagree, this file is right.

The rebuttal is the auditor's answer to the vet. An implementation-audit round writes its
`*-2-audit.<tag>.md` report, the other assistant vets it into the `-3-vet.<tag>.md` twin and this
workflow answers those verdicts, writing the `-4-rebut.<tag>.md` twin. The answers come from the
auditor. The automated rebuttal always starts fresh on the audit's model and effort. A hand-run
reply may use the audit session while it still holds the round. In either route, ground answers as
the shared round protocol requires under **Rebuttal grounding**. The fix phase then reads all three
files. The user directed this chain on 2026-09-09 to give the fix phase both assistants' views.
Under the runner the rebuttal runs only when the vet's verdicts leave the auditor something to
answer: a vet that accepted every finding without a condition sends the report and its vet twin
straight to the fix, which the user directed on 2026-09-20 so the fix starts sooner.

The rebuttal is read-only and lands nothing. It runs no command that changes
a tracked file. Only a hand-run rebuttal writes its `-4-rebut.<tag>.md` twin.

When unattended, follow the shared
[Runner result](../../../references/round-protocol.md#runner-result) for every ending. Report
`finished` only after grounding and returning the required answers in the final
response. The runner saves the twin at its supplied path. Contested verdicts and items for the
user's ruling still complete the rebuttal: the fix phase presents them.

This procedure also serves reports stored at the plan repo root. The plan
repo's rebuttal workflow routes those here and supplies the local
substitutions: that repo's report root and finding metadata.

## Report discovery

Read the whole [shared round protocol](../../../references/round-protocol.md) for path resolution,
rebuttal grounding, answers and runner results. Follow its **Rebuttal grounding** and
**Rebuttal answers** rules. The arguments name the report and vet to read and the rebuttal output,
in that order; read the judged repos and audited heads from the report opening and the auditor's
vendor letter from its filename.

A hand-run invocation may omit the audit report. Resolve the report, vet input
and rebuttal output under the shared round protocol's **Manual phases** with
`paths rebut` and your current writer tag. Automated invocations use their
supplied paths unchanged.

Never answer the vet on a report whose tag's vendor letter is the other
assistant's. The rebuttal is the auditor's reply, and the other assistant's
verdicts are not yours to defend. Continue only when the user explicitly
says to.

When the invocation names a report stored at the plan repo root, say the
rebuttal belongs in `../plan` and stop. Continue only when the user
explicitly says to.

## Rebuttal file

Return the complete answers in the final response, without a grouped closing
list. When no verdict needs an answer, state that once. When hand-run, also
write the same text to the supplied rebuttal path. The twin is untracked and
gitignored, so that write keeps the rebuttal read-only.

Then stop. The fix phase runs through the fix launcher, `/fix` for Claude
and `$fix` for Codex.
The audit report and both twins are its brief. The runner closes that set after
a finished fix; a hand-run fix uses `pnpm audit-round close`. This workflow deletes nothing.
