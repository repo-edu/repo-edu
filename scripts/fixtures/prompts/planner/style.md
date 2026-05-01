# Plan style

Selects the structural shape of the commit timeline. Each style
constrains how the commits introduce and grow modules across the
build rounds. Reviews are inserted at planner-chosen build slots and
re-examine recent work regardless of style.

## big-bang

The first commit is performed by one author and creates a skeleton
architecture defining every module the team will build (empty files
or minimal stubs for each `team[i].module` plus any shared
scaffolding). Every subsequent build commit fleshes out content
inside those existing modules. No new top-level modules appear after
round 1.

## incremental

Round 1 introduces a single module skeleton — typically the one
owned by author 0. Each of the next few build rounds introduces one
additional module, authored by that module's owner, until all
`team[i].module` entries exist. Remaining rounds flesh out content
inside the already-introduced modules. There is no upfront
whole-system architecture commit.

## vertical-slice

Every build commit must touch multiple modules — no single-module
commits. Each round delivers a thin end-to-end slice that cuts
through several layers (e.g. data + logic + UI in one commit).
Modules grow in lockstep rather than one-at-a-time. Module files
appear in the first commit that needs them and gain content
gradually across rounds.

Round 1 is itself a thin slice, not a scaffolding commit. Do not
bundle whole-system setup ("create tokenizer, parser, evaluator,
CLI, and first test") into round 1; only the modules exercised by
the first slice appear in round 1, the rest arrive with their own
slice. All slices should be comparable in size — no round should
dwarf the others.

This style overrides any "module owner" interpretation of
`coder-interaction`: every commit spans modules, so there is no
single owner. Treat `coder-interaction` as the lead-author rotation
rate across slices — 1 = same author leads most slices, 3 = the
lead rotates each slice.

## bottom-up

Early rounds build shared utilities, types, constants, and
primitives that other modules will depend on. Higher-level features
and integrations appear only in the second half of the schedule.
The first commit is a utilities or types module rather than a full
architecture.

Round 1 introduces one foundational primitive module — not a sweep
of utilities, types, constants, and primitives all at once. Each of
the next early rounds adds one more primitive. All build rounds
should be comparable in size — no round should dwarf the others.

## top-down

Early rounds scaffold high-level features as stubs — function
signatures with `pass` bodies, `TODO` comments, or placeholder
return values that capture the user-facing surface area. Later
rounds replace those stubs with real implementations and pull in
helpers as needed. The first commit defines the public surface;
inner workings come later.

Round 1 defines the entry-point's public surface only — not stubs
for every `team[i].module` at once. Other modules' stubs appear in
later rounds, when the orchestrating layer first calls into them.
All build rounds should be comparable in size — no round should
dwarf the others.

## test-driven

Tests are written before the code that satisfies them. Each
behaviour-adding round splits across two commits: first a `test_*.py`
introducing failing assertions for the new capability, then the
production code that turns those tests green. File pairs grow in
lockstep (`foo.py` is preceded by `test_foo.py`). Notes use
"add tests for X" / "implement X" language. The first commit is a
test file, not production code or scaffolding.

## walking-skeleton

Round 1 wires every `team[i].module` together end-to-end with
placeholder bodies — every module file exists, imports resolve,
the entry point runs, but each function returns dummy values
(`return None`, hard-coded constants, `pass`). Subsequent rounds
deepen one module at a time in place, replacing dummies with real
behaviour without adding new modules. The system runs from round 1
onward; it just doesn't do anything useful until later rounds.

## spike-and-stabilize

Round 1 is a rough working prototype concentrated in one or two
files — usually a single `main.py` or `prototype.py` that does the
end-to-end task crudely (long functions, hard-coded values,
duplication). The next 1-2 rounds also pile on capability in those
same files. The remaining rounds split, rename, extract helpers,
and move logic into the proper `team[i].module` files. Notes shift
from "add X" / "make Y work" early to "extract Y into module",
"split X into helpers", "clean up Z" later.

## demo-driven

Each build round adds one user-visible capability and ends with
the project runnable from the command line — typically by growing
a `demo.py` or `main.py` script that exercises the new feature.
Commits are aligned to demo-able milestones rather than module
boundaries; one commit may touch several modules to make the new
demo work. Notes read like demo descriptions ("demo: load a CSV
and print summary", "demo: filter rides by date").

Round 1 demonstrates the smallest end-to-end capability, not a
project skeleton: only modules required by that first demo appear
in round 1, others arrive with their own demos. Demos should be
comparable in size — no round should dwarf the others.

This style overrides any "module owner" interpretation of
`coder-interaction`: commits are demo-driven, not module-driven,
so there is no single owner. Treat `coder-interaction` as the
lead-author rotation rate across demos — 1 = same author leads
most demos, 3 = the lead rotates each demo.

## refactor-heavy

Build rounds alternate between adding capability and refactoring
recent work in place. Roughly half the build commits add new
behaviour; the other half rename, extract helpers, split modules,
or move responsibilities without changing observable behaviour.
Refactor notes use "extract X", "rename Y", "split Z into ...",
"move W to ..." language and don't introduce new features.

Round 1 adds a normal-sized initial capability — there is no
whole-system scaffolding round. All build rounds, capability and
refactor alike, should be comparable in size — no round should
dwarf the others.
