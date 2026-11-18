# Commit hooks

This file describes the commit-message hook both repositories run: the subject reader, the record
bullet reader, the stamps and the refusals. Read
[`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names the
source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

## Commit hooks

`commit-msg-main.ts` is the entry both repositories' hooks run, as
`<repo-edu|plan> <message file>` with the NUL-separated changed paths on standard input. A refusal
names the grammar file.

### Subjects

`subject.ts` is the one reader of the commit subject grammar in
[the subject grammar](../../../.agents/references/subject-grammar.md). It parses a subject under
either repository's form, names the class it matched and refuses with the first slot that does not
fit. The commit hooks and the glance both read through it.

Its loose form read, the first token split at its slash, is the one read that reaches subjects
older than the settled grammar, because episode scoping and auditor stamping need nothing else
from them.

### Record bullets

`findings.ts` reads the complete current bullet form for commit hooks and episodes, D included.

- It validates token values without consulting the area model. `commit-msg.ts` checks primary and
  cover IDs against the current model at write time.
- It requires the `Title: prose` form.
- It reads the optional leading `[finding:<n>]` token that names the audit report finding the
  bullet lands, `[applies:<full-sha>/<position>]` citations on graded bullets and the untiered
  `The plan stands.` form. A citation keeps the full commit ID.
- The hook therefore refuses a malformed bullet before the round-data join or the deferral owner
  reads it.

`sequence.ts` derives severity from the strict read and fills the subject's severity slot under
its role and repository rules. The growth mark remains authored and is required beside every
sequence outside a deferral record.

### The hook's rule

`commit-msg.ts` is the hook's rule. It derives severity from the graded bullets before parsing the
subject. It then stamps and refuses as follows.

Stamps the runner supplies:

- It replaces a record's auditor tag with `COMMIT_AUDITOR` when the runner supplies it.
- It replaces the body's opening phase lines and time line with `COMMIT_PHASES` when a round
  supplies it, so a second stamp repeats neither. It requires a model line otherwise.
- Every assistant child carries the round's commit stamps, overriding any inherited ones, so a
  phase that commits records the round that ran rather than whatever started it.
- The stamps are read when the child starts, from the output's record of the phases that have run.
  A clean round that skipped the vet and the rebuttal therefore stamps neither into its record, and
  a round whose vetters accepted every finding stamps no rebuttal.
- Commit stamps use the phase selections the output recorded and add a time line for the audit,
  every vetter and the rebuttal that finished. The commit-record set is the four recorded phases
  and leaves the ruler out, because the subject grammar's model record names those alone.

Refusals:

- a commit while `COMMIT_OPEN_CONTESTS` names serious findings that still need the user's winner;
- a single-model record whose effort disagrees with the tag;
- a step record without active implementation time;
- a ready marker without its coder;
- a commit that changes a listed file unless the subject has an `impl-<n>` or
  `impl-audit-<scope>` role. That refusal names `FAILURES.md` and the plan repo's
  **Doctrine changes** rule, which owns the route.

### Listed files

`listed-files.json` keeps each repository's listed paths apart. A path ending in `/` names a
folder and covers every path under it, and any other path names one file. The list names its own
path, so a change to it goes through a plan too.

Each hook collects the paths the commit changes in its own repository, both names of a rename
included, and passes them on standard input; the reader asks Git nothing. The plan repo's hook
collects them before it moves to the Repo Edu checkout, where Git would answer for Repo Edu's
index.
