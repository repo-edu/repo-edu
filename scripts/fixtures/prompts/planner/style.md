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

## bottom-up

Early rounds build shared utilities, types, constants, and
primitives that other modules will depend on. Higher-level features
and integrations appear only in the second half of the schedule.
The first commit is a utilities or types module rather than a full
architecture.

## top-down

Early rounds scaffold high-level features as stubs — function
signatures with `pass` bodies, `TODO` comments, or placeholder
return values that capture the user-facing surface area. Later
rounds replace those stubs with real implementations and pull in
helpers as needed. The first commit defines the public surface;
inner workings come later.
