---
reads:
  - ../../../../glossaries/audit-round.md
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../design/references/workflow.md
  - ../../../../tools/statement-move/CLAUDE.md
  - ../../../../tools/architecture-check/src/area-model.json
---

# Choose a split design

Apply the simple-words requirement throughout and skip its confirm-and-wait step. This fresh session
chooses among the saved answers named for the pick. Read the source whole and every supplied answer
in answer number order. The phase arguments give the source path, its Git blob hash and the answers.
Each answer has a number, an absolute path and the tool's refusal message or null.

## Judge the answers

Use the [design workflow](../../design/references/workflow.md) for the division rules. Apply the
same measure to every answer. A separate responsibility can save a later session reading unrelated
code. A change crossing several files costs time finding them and following names between them.

1. Should the file be split at all?
2. Does each target hold one responsibility?
3. Does a cut divide code that belongs together?
4. Are statements in the right places, and do the target names and areas fit?

Choose one whole answer, including a designer's no-split answer when it fits. When lists are equal,
choose the one with fewer targets. A refusal is evidence about whether a plan is needed. A refused
list is ineligible. You may give your own no-split answer only when every move list fails the first
question.

## Repair a fault

A repair needs a fact visible in the source, the target's responsibility sentence or the area model.
A target may contain a statement outside its stated responsibility. Its path may leave the source's
primary area. A test target may import another test target and run its tests twice.

You may move statements between the chosen targets or back to the source, remove a target or change
a path. Keep to the chosen division. A preference for another cut belongs in the choice. A repair
adds no target and takes nothing from a competing design.

## Return the pick

Use the supplied schema. Give one or two sentences about each answer's strengths
and faults in its judgement field. Give the main reason for the choice and state
each repair with the fact that requires it. Case:
[`pick-report`](../../../../../plan/CASES.md#pick-report).

1. For an unchanged answer, return its number and a null replacement.
2. For a repair, return the original answer's number and the complete repaired move list.
3. For your own no-split result, return a null number and the complete no-split answer.

The runner writes the pick report and any replacement answer. Make no file changes,
commits or ruling requests. End under the shared
[Runner result](../../../references/round-protocol.md#runner-result).
