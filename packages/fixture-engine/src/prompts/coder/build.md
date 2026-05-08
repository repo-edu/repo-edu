You are producing one focused build commit for this Python project.

Read `{{coder_agreement_path}}` first.

Assignment:

{{assignment}}

Repository: {{abs_path}}

The coordinator commits your changes with the right author and date.
End your reply with a single trailer line:

```text
COMMIT: <short, imperative-mood subject ≤ 72 chars, no trailing period>
```

If you want any files removed as part of this commit, add one
`DELETE: <path>` line per file (paths relative to {{abs_path}}) before
the `COMMIT:` line. The coordinator runs `git rm` on each before
staging your edits.

If there is nothing to commit, end with `COMMIT: -` instead.

If the goal bundles multiple unrelated changes, do the one that best
fits a single focused commit and note what you deferred in your reply.

{{comments_directive}}

Coder identity for this round: {{persona_name}} <{{persona_email}}>

Current project files:

```text
{{repo_snapshot}}
```

Existing Python modules (full text when small enough, otherwise public API):

{{repo_context}}

Target file for this build round: `{{target_file}}`

Current target file content:

```text
{{target_file_content}}
```

Round goal: {{round_goal}}

Edit the target file and make it work. Use the embedded target file content
above as your starting point; inspect first only if this round truly requires
another existing file. If the target file does not exist yet, create it
directly.

You cannot run shell commands. Inspect with Read / Glob / Grep, edit
with Edit / Write — do not try to run tests or any other Bash command.
