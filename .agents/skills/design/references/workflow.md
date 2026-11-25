---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-grammar.md
  - ../../../../tools/statement-move/CLAUDE.md
  - ../../../../tools/architecture-check/src/area-model.json
---

# Split design workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole. Read each file once. Apply the `simple`
requirement to the whole session and skip its confirm-and-wait step.

A design session reads one source file whole and gives one of three answers:
the file is fine, the file needs a plan, or a move list. It changes no code and
writes no file. Other listed designers read the same source independently. The
runner saves each answer and tries its moves in memory. A fresh picker chooses
among the answers when a choice remains.

The phase arguments are exactly:

1. the source file's path, relative to the Repo Edu root
2. the blob hash of the source's content, which the runner read before this
   session started
3. this designer's density, `normal` or `coarse`

The round grammar's [Move list](../../../references/round-grammar.md#move-list)
owns the form of every answer. The statement move tool's
[documentation](../../../../tools/statement-move/CLAUDE.md) owns which ranges a
move admits and how the tool carries out a whole list.

## Read the file

Read the source file whole, numbering blank lines too. Use the last line number
for the move list's `Size:` field, or zero for an empty file. Search the workspace
for the files that import it and read them and the files it imports as far as
you need them to judge its seams.

## Judge whether to split

First judge whether the file should be split at all. Ask three questions:

1. Does the file hold more than one responsibility?
2. Does it have natural seams?
3. Would splitting the file improve AI efficiency?

A split saves reading when work on one responsibility can leave the others
unopened. It costs reading when one change needs several files and the reader
must find them and follow the names between them. Judge both costs by the
responsibilities in the source.

Size made the file a candidate, but size never decides the answer. A large file
that holds one responsibility is fine. No line count, metric or other
mechanical rule decides any of the three answers.

## Choose the answer

Give exactly one answer:

1. **The file is fine.** Your judgement on the three questions is that it
   should stay whole.
2. **The file needs a plan.** Its division needs more than moves of complete
   top-level statements. This holds in three cases:
   1. A seam cuts through one function, class or hook.
   2. The split changes something other files rely on. For example, another
      package imports a statement that would move. The statement move tool
      repoints importers only inside the source's package, so that split would
      fail the checks after the write.
   3. No target path keeps the source's area, under [Targets](#targets).
3. **A move list.** The file divides between complete top-level statements.

## Write the move list

Write the moves under these rules:

1. **Number of targets.** Add a target only where it improves AI efficiency.
   At `normal` density, weigh both costs and favour fewer targets when in doubt.
   At `coarse` density, move a group only where work on it almost never needs
   the rest of the file, accepting larger files.
2. **Ranges.** Every range names lines of the file as you read it, before any
   move. Do no arithmetic between moves: the tool follows each range through
   the moves before it. A range holds complete top-level statements: no
   statement may start or end outside it, it holds no import and it holds
   every declaration of an overloaded function. No statement sits in two
   ranges. A statement that no range names stays in the source.
3. **Order.** List the moves in the order the tool carries them out. In a test
   file, first move the shared helpers to a module that holds no tests, then
   move the tests. A test file that imports another test file runs that file's
   tests again.
4. **Responsibility.** Give each target one sentence that states the one
   responsibility it holds. The picker checks these sentences against the file.
5. **Names.** Name each target after what it holds, in the naming style of its
   folder.

### Targets

Every target joins the source's primary area. Write that area's ID on the
`Area:` line.

The area model decides each file's area from its path alone. Each partition
area has member patterns, and some also have `exclude` patterns. Each pattern
is a regular expression that is matched against the path relative to the Repo
Edu root. A partition area owns a path when one of its member patterns matches
the path and none of its `exclude` patterns does. The source's area is the
partition area that owns the source's path. Choose each target path so that the
source's area owns it and no other partition area does. Several areas
match files by exact name or by name prefix, so a path without that name or
prefix lands in another area or in none. When no path fits a target, the file
needs a plan, because a split that needs a new area needs a plan.

## Return the answer

Return the answer as one document in the Move list form, then the phase result
line:

1. A move list holds the `## Moves` section.
2. The answers "the file is fine" and "the file needs a plan" hold the
   `## No split` section, with the word `fine` or `needs-plan` and the reason
   on one line.

Copy the source path and the hash from the phase arguments. Put nothing before
the `# Move list` heading and nothing between the document and the phase result
line.

Change no file and run no command that changes a tracked file. That includes
the statement move tool's single-range form, which writes, and every formatter.
Commit nothing.

End under the shared round protocol's
[Runner result](../../../references/round-protocol.md#runner-result): `finished`
when the answer is complete, and `failed` with a short reason when it is not.
