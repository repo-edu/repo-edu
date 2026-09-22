# Shared round protocol

This reference owns the file-name grammar for rounds in Repo Edu and the
sibling plan repo. Each repo's audit workflow owns its round allocation rule.
Read this file from the Repo Edu checkout; plan-repo workflows reach it at
`../repo-edu/.agents/references/round-protocol.md`.

## File names

Round documents and logs use `<target>-<round>-<tag>-<kind>.<ext>`.
The kind is `round`, `audit`, `vet`, `rebut`, `brief`, `ruling` or `watch`.
Documents use `.md`; the transcript log and standalone brief log use `.log`.
Two files omit the tag: the empty `<target>-<round>-claim.md` reserves a
number, and `<stem>-handoff.<sha>.md` briefs the commit it names. The runner
claims at the invoking repository root; a hand-run audit claims at its report
root.
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
- **Round** is the two-digit number allocated under the Repo Edu audit
  workflow's round allocation rule, at either report root. A runner-supplied
  `<target>-<round>` takes precedence at either report root. Every later phase
  keeps it exactly, even when another assistant writes the next file. A later
  phase never allocates another round.
- **Tag** names the file's writer under [Writer tags](#writer-tags). The
  transcript and its log use the auditor's tag. All other tagged files use
  their own writer's tag.

Read a name from the right: remove the extension, kind and three-letter tag,
then split the remaining name at its last hyphen into target and round.
The tagless claim and handoff are the two exceptions above. Do not read repo
names or audited heads from a filename; they belong in the report opening.

For example, one round can contain `example-step-2-01-otm-audit.md` and
`example-step-2-01-abx-vet.md`. Their target and round match; their writer tags
differ. Do not look for twins by changing only the kind while keeping the
auditor's tag.

Old prefix names are neither read nor renamed. The user deletes them.

## Writer tags

Use Repo Edu's `CLAUDE.md`, **Commit Capability Tag** and **Commit Model
Record**, to spell your own model and effort as a full three-letter tag.
The runner's strength table is in `tools/audit-round/src/phase.ts`; a model
outside that table takes `u`. A session takes its own tag, never the tag of
the auditor from an input path. Use the tag's first letter alone when checking
which assistant wrote a file: `a` is Claude and `o` is Codex.

Under the runner, audit, vet, rebuttal and fix read their own selection from
`COMMIT_PHASES`. Other sessions use their current model and effort. Codex desktop
sessions resolve them through [task settings](codex-desktop-settings.md) and
Claude sessions through [session settings](claude-desktop-settings.md).
The runner's brief uses its pinned `gpt-5.6-terra` at low effort,
spelled `oul`; a hand-run brief uses its own session's selection. Resolve the
tag before writing a file or claiming a number. When the effort is missing or
cannot be spelled, stop and name the assistant and phase. For a runner audit,
advise a full `--auditor` tag; for another phase following CLI settings,
advise setting that assistant's effort there, since `--auditor` controls only
the audit and rebuttal.

The runner resolves the tags of every file-writing phase it may invoke before
opening any output. Startup updates and settings discovery write only to the
terminal. The run log begins with the selected models table.

## Later files

Vet and rebuttal files live beside their report. Match twins by the exact
target and round, kind and writer's vendor letter, not by equality of the full
tag. The vet belongs to the other assistant and the rebuttal to the auditor.
If several files match an expected twin, name them and ask which to use.

Brief and ruling files live beside their transcript. Keep its target and
round, replace the tag with the current writer's tag and use the required kind.
Replace an existing output at that name. A standalone brief log uses the brief
writer's tag and is opened for overwrite; it makes no claim. The runner gives
the watch its complete `-watch.md` path with the watch writer's tag.
The second ruling or watch pass replaces the supplied draft at the same path.

A fix consumes only its report and the matched vet and rebuttal files. Claims,
transcripts, logs, briefs, rulings, watches and reports from other rounds remain
until their own cleanup.
