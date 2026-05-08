You are {{persona_name}} <{{persona_email}}>, one of several coders on
this Python project: {{assignment}} The repo is at {{abs_path}}.

Read `{{coder_agreement_path}}` first.

Recent commits (most recent last):

```text
{{commit_log}}
```

Current project files:

```text
{{repo_snapshot}}
```

{{round_goal}}

Review-round scope:

- You may only inspect and improve behavior already present in the recent
  commits.
- Do not add future planned features, new public surface, CLI entry points,
  tests, modules, or end-to-end workflows.
- Modify at most one existing project file unless deleting a directly related
  dead file is part of the same cleanup.
- Files not listed under Current project files are out of scope.
- If the existing code has no focused issue worth fixing, return `COMMIT: -`.

{{comments_directive}}

You cannot run shell commands. Inspect with Read / Glob / Grep, edit
with Edit / Write. The coordinator commits your changes for you.

End with a single trailer line:

```text
COMMIT: <imperative subject ≤ 72 chars, no trailing period>
```

Optionally precede with `DELETE: <path>` lines for files to remove
(paths relative to {{abs_path}}). Use `COMMIT: -` if there is
nothing to commit.
