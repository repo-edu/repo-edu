# Output

This file describes what the audit-round runner prints and records while a run is in progress: the
settings header, the status line, the log, the transcript and the notices. Read
[`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. The [Ownership](../CLAUDE.md#ownership) table there names the
source files this file describes. It follows the runner documentation's
[Document layout](../CLAUDE.md#document-layout) rule: each fact is stated once.

The runner documentation owns the neighbouring subjects: file names and round data under
[Round files](../CLAUDE.md#round-files), the continued round under
[Stopped rounds](../CLAUDE.md#stopped-rounds) and the token readings of each assistant under
[Assistant sessions](sessions.md#assistant-sessions).

## Owners

- `output.ts` owns terminal presentation and incremental run recording. It uses `round-paths.ts`
  for file names and round identity.
- `run-clock.ts` owns what the time readings count.
- `terminal.ts` renders assistant Markdown for the terminal.
- `model-change.ts` owns the non-blocking model and effort notice.
- `run-files.ts` completes each required write before returning to the invocation. No complete
  transcript accumulates in memory.

## Run description

A run description names the run, lists the phases it may run and locates its files:

- Every round records a log and a transcript.
- A round on an active plan updates one machine-readable per-plan data file.
- A commit or move-list audit updates its label's machine-readable series data file.
- A close and a split call record only their log.

Startup messages go only to the terminal. The run log begins with the models table.

## Settings header

Each entry of the run description carries its phase, so the settings header reports the model and
effort that phase will run on, each in its own aligned column.

- The rows keep the order the round runs its phases in, with the vetters in panel order, so the
  header reads as the round runs. A vetter's row is labelled `vet <tag>`.
- A pinned model reads as the release its CLI resolved it to at startup, so every row names a
  release.
- A phase whose two fields came from different places names both, model first.

Each row names what set its model and effort:

| Source text | Meaning |
| --- | --- |
| `--auditor` or `--first` | The option named the field |
| `audit-round auditors` | A listed auditor |
| `audit-round <class> vetters` | A vetter |
| `audit-round <class> ruler` | The ruler |
| `audit-round <class> watch` | The watch |
| `audit-round settings` | The close's own pin |
| `audit-round defaults` | The field reads the assistant's default selection |

## Recorder slots

The output holds its round mark. `start` returns a recorder bound to one invocation's slot. The
slot is keyed by its phase or, for a vetter, by `vet <tag>` from its vet report's filename, so the
vetters of a panel never share a slot or a record.

- Each line the output writes for a vetter opens with that key.
- A vetter's text is held until its vet ends and is then written whole under its own transcript
  heading, because vetters that run at once would otherwise mix paragraph by paragraph.
- The live status line joins every running slot's stamp.
- Releasing an invocation that never finished fixes its time and closing stamp in memory only, so a
  failed record write cannot hide the phase's outcome. The round's finish writes its held text and
  stamp.

## Measurements

The output keeps context observations and each started slot's model selection, time, tokens, peak
context and compaction count.

- A phase starts with its launch selection, then its CLI's model feedback replaces it.
- Each finished invocation adds its elapsed time to the phase's time.
- Both assistants' latest session totals replace the earlier reading, so a resumed fix counts each
  token once.
- Each phase prints its per-model input, cached input and output totals beside its elapsed time.
- The output warns once when audit, vet, rebuttal, ruler or fix first compacts. The watch returns
  its final compaction count to `round.ts` instead, under [Watch](watch.md#watch).

## Time readings

Every status stamp shows three assistant times, as `[fix] 01:00  round 03:05  run 42:10`: the
phase's, the round's and the runner invocation's.

- Every logged tool line opens with its step's own time: the assistant time since the previous
  tool line, or since the phase start for the first. The round's and the invocation's totals
  follow it.
- The run's ending lines repeat the invocation's reading, so it survives the last stamp.
- Minutes count on past the hour, as `102:10`, so every reading keeps one shape.
- The readings are display only. Round data keeps per-phase milliseconds and no run total.

`runCommand` creates one clock per invocation and hands it to every output, so a chained run's
rounds, implementation and close share it. Each output takes its round mark at construction.

A round measures its assistants, so time the user holds is not the run's. Printing the ruling
notice opens a wait, and an accepted answer or an ended wait closes it. Each phase, each round and
the invocation read the same waiting total through their own mark. A wait therefore leaves all
three alike, and one rule serves every reading.

## Context growth

Two baselines measure context growth:

- A written status stamp reports the tokens added since the previous written stamp.
- A logged tool line reports the tokens added since the previous tool line, beside the time since
  it.

Both chain into the totals beside them. A fresh phase starts its stamp baseline at zero, and a
resumed phase reports no first change.

## Terminal rendering

`terminal.ts` renders assistant Markdown through the `pi-tui` Markdown component
(`@earendil-works/pi-tui`, which replaced Glow) at the current terminal width.

- It preserves paragraph spacing, nested lists and source finding numbers, and it keeps tables
  aligned.
- It uses cyan for inline code without background blocks.
- It honours `NO_COLOR`; set `NO_COLOR=1` to disable colour.
- It writes the rendered document directly and uses log-update only for the live status line, so
  permanent text is not wrapped twice.
- Redirected output retains the original Markdown.

Preserve these qualities when changing terminal rendering.

## What reaches the terminal, the log and the transcript

- The log records each tool invocation once, with shell wrappers removed and no event envelopes or
  result payloads. Invocation lines stay complete in the log. Only terminal tool lines shorten.
- Assistant texts stay complete in Markdown.
- The terminal omits the final `PHASE RESULT` control line. The transcript retains it.
- Assistant output goes through the normal phase output, so launch prompts stay in the log and
  never reach the terminal. Supplied instruction files appear in the log by path only; their full
  contents go to the assistant.

## Ruling notice

`beginRuling` releases the live status display and prints the ruling notice in place of the
ruling's text. The notice names:

- the round or step;
- the target;
- the ruling file, when a fix or worker wrote one;
- the round's reports, when the runner asks before the fix;
- the findings that need a winner and the findings that need a choice;
- whose model runs the fix;
- the two chat commands, Claude's `/ruling <target>` and Codex's `$ruling <target>`, in the
  wording the dialog shares under [Ruling wait](rounds.md#ruling-wait).

`endRuling` excludes the user's waiting time and records an accepted answer's winners, choices and
reply in the log and the transcript before any fix process starts or resumes.

## Model-change notice

Each assistant's reported model line is followed by the model-change notice when the comparison
below differs. Every round phase and the close compare the same way.

- The notice reads every active and archived plan's checked round data. It compares the reported
  model and effort with the newest earlier reading by the same assistant on the same launched
  selection, whatever phase ran it.
- The launched selection is what the settings named before the CLI resolved any alias. An alias
  that now resolves to another release therefore warns, and so does a tool running another release
  or effort than it did on that selection before.
- A changed launched selection is already visible in the settings header, so a coder rotation or an
  edited default is no warning.
- A first observation, a different assistant and an unchanged reading produce no notice.
- A phase entry recorded before the launched selection was kept matches nothing.
- Invalid round data still stops the run before an assistant starts.
