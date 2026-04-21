# Coder skill tiers

Explicit code-style directives per skill level, passed into the Coder
prompt as `{{coder_level_rules}}`.

All tiers: use 4-space indentation consistently across every file in
the project.

## 1

Procedural style, short main block. Functions only when repetition forces
it. No classes, no type hints. Use print() for debugging. Minimal error
handling. Generic names are fine (data, result, temp).

## 2

Functions and basic module split. Simple classes if they help (no
inheritance). Type hints only on obvious public functions. Basic
try/except where needed. Readable, not polished.

## 3

Clean module boundaries. Type hints on public APIs. Targeted error
handling. Dataclasses where they fit. Idiomatic but not clever. No
design-pattern hunting.

## 4

Tight idiomatic code. Type hints throughout. Proper exception types.
Protocols or dataclasses when they clarify. No over-engineering.
