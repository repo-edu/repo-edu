You are producing one focused refactor commit for this Python project.

Read `{{coder_agreement_path}}` first.

Assignment:

{{assignment}}

Repository: {{abs_path}}

The coordinator commits your changes with the right author and date.
End with a single trailer line:

```text
COMMIT: <imperative subject ≤ 72 chars, no trailing period>
```

Optionally precede with `DELETE: <path>` lines for files to remove
(paths relative to {{abs_path}}). Use `COMMIT: -` if there is
nothing worth refactoring.

Refactor-round scope:

- Rework code introduced in recent build commits without changing
  observable behavior. Use "extract X", "rename Y", "split Z into …",
  "move W to …" framing in commit subject and edits.
- You MAY split modules, extract helpers, rename identifiers, and
  move logic between files. You MAY span multiple files in this
  single commit.
- You MUST NOT add new public surface, new features, new CLI entry
  points, or new tests. Behavior visible to a caller stays the same.
- If the recently-introduced code has no focused refactor opportunity
  worth doing, return `COMMIT: -`.

{{comments_directive}}

Coder identity for this round: {{persona_name}} <{{persona_email}}>

Recent commits (most recent last):

```text
{{commit_log}}
```

Current project files:

```text
{{repo_snapshot}}
```

Existing Python modules (full text when small enough, otherwise public API):

{{repo_context}}

{{round_goal}}

You cannot run shell commands. Inspect with Read / Glob / Grep, edit
with Edit / Write. The coordinator commits your changes for you.
