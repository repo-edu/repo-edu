# Shared round protocol

This reference owns the file-name grammar for rounds in Repo Edu and the
sibling plan repo. The runner owns round allocation for both entry routes.
Read this file from the Repo Edu checkout; plan-repo workflows reach it at
`../repo-edu/.agents/references/round-protocol.md`.

## File names

Round documents and logs use `<target>-<round>-<order>-<kind>.<tag>.<ext>`.
The kind is `round`, `audit`, `vet`, `rebut`, `brief`, `ruling` or `watch`.
Documents use `.md`; the transcript log and standalone brief log use `.log`.
Two files omit the tag: the empty `<target>-<round>-claim.md` reserves a
number, and `<stem>-handoff.<sha>.md` briefs the commit it names. The runner
claims at the invoking repository root; a hand-run audit claims there too.
The plan repo's handoff rule owns that six-character sha.

- **Target** names what was audited. A planning-artifact audit uses its bare
  stem, without `.md` or `-widen`. For an archived `plan.md`, use the archive
  folder's name. An implementation audit adds `-step-<n>`, `-steps-<a>-<b>`
  or `-all` to that stem at either report root.
- **Commit targets** preserve the references as typed, replacing `HEAD` with
  its short sha at the start of the round. Keep offsets: `HEAD-4..HEAD` becomes
  `b7ca0b3b-4..b7ca0b3b`. For a list, use its first reference followed by
  `-plus-<n>`, where `n` counts the remaining references. Never take a word
  from a commit subject or name a range with two resolved endpoint shas.
- **Round** is the number allocated by the runner, padded to at least two digits.
  A supplied report path already fixes the target and round.
  Every later phase keeps it exactly, even when another assistant writes the next file. A later
  phase never allocates another round.
- **Tag** names the file's writer under [Writer tags](#writer-tags). The
  transcript and its log use the auditor's tag. All other tagged files use
  their own writer's tag.

The runner's `output.ts` owns the fixed order numbers:

| Order | Kind | Files |
| --- | --- | --- |
| 0 | round | Transcript and log |
| 1 | audit | Report |
| 2 | vet | Vet twin |
| 3 | rebut | Rebuttal twin |
| 4 | fix | Reserved, no report |
| 5 | brief | Brief and standalone log |
| 6 | ruling | Ruling |
| 7 | glance | Reserved, no report |
| 8 | watch | Watch |

Skipped phases leave gaps. Every round file lives at the invoking root.

Read a name from the right: remove the extension, three-letter tag, kind and order,
then split the remaining name at its last hyphen into target and round.
The tagless claim and handoff are the two exceptions above. Do not read repo
names or audited heads from a filename; they belong in the report opening.

For example, one round can contain `example-step-2-01-1-audit.otm.md` and
`example-step-2-01-2-vet.abx.md`. Their target and round match; their writer tags
differ. Sessions receive complete paths and do not search for twins.

Old prefix names are neither read nor renamed. The user deletes them.

## Writer tags

Use Repo Edu's `CLAUDE.md`, **Commit Capability Tag** and **Commit Model
Record**, to spell your own model and effort as a full three-letter tag.
The runner's strength table is in `tools/audit-round/settings.json`; a model
outside that table takes `u`. A session takes its own tag, never the tag of
the auditor from an input path. Use the tag's first letter alone when checking
which assistant wrote a file: `a` is Claude and `o` is Codex.

Under the runner, audit, vet, rebuttal and fix read their own selection from
`COMMIT_PHASES`. Other sessions use their current model and effort. Codex desktop
sessions resolve them through [task settings](codex-desktop-settings.md) and
Claude sessions through [session settings](claude-desktop-settings.md).
The runner resolves file tags from its configured phase selections. A hand-run
session resolves its own tag before claiming a number. When the effort is missing or
cannot be spelled, stop and name the assistant and phase. For a runner audit,
advise a full `--auditor` tag; for another phase following CLI settings,
advise setting that assistant's effort there, since `--auditor` controls only
the audit and rebuttal.

The runner resolves the tags of every file-writing phase it may invoke before
opening any output. Startup updates and settings discovery write only to the
terminal. The run log begins with the selected models table.

## Later files

The runner names the report and every twin before the audit starts. It supplies
these absolute paths in order:

- audit: report to write, target, scope or commit references
- vet: report to read, vet twin to write
- rebut: report and vet twin to read, rebuttal twin to write
- fix: report, then the vet and rebuttal twins that exist
- brief: transcript to read, brief to write
- watch: watch to write, cache root
- watch-edit: watch to replace

Sessions write at the supplied output path without reconstructing a name or
adding an opening writer tag. A standalone brief reuses the transcript's target
and round. Its document and log share `5-brief.<tag>`; the log is opened for
overwrite without another claim. The round transcript and log share
`0-round.<tag>`. The second watch pass replaces the supplied draft.

The fix receives the ruling output path separately from its report arguments.
It writes the final ruling at that path before returning `needs-ruling`, using
the fix writer's tag. A resumed fix receives the same path and the user's reply.

A hand-run audit runs `pnpm audit-round name <target> [scope-or-commits...] --auditor <full tag>`
before auditing. It passes its own resolved three-letter tag, including `u` for
an unlisted model. The command claims the next number and prints absolute paths
in this order: claim, transcript, log, audit, vet, rebuttal, brief, ruling and
watch. The audit and rebuttal keep the supplied tag; other writers use the
runner's settings and the vet uses the other assistant. Hand-run vet, rebuttal
and fix invocations take the printed paths in the same argument order above.
They run no naming command and never search for twins.

The runner deletes the audit, vet and rebuttal reports as soon as a fix returns
`finished`. Other outcomes retain them. After a hand-run fix lands its records,
`pnpm audit-round close <target>-<round>` at the report's root deletes those
same numbered report kinds for that exact round, regardless of writer tag.
Claims, transcripts, logs, briefs, rulings, watches and other rounds remain.
