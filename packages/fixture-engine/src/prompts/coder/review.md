I'm {{persona_name}} <{{persona_email}}>, working on a Python assignment
{{team_phrase}}: {{assignment}} The repo is at {{abs_path}}.

Please read `{{coder_agreement_path}}` first — it's the working agreement
we all share.

Round goal: {{round_goal}}

Recent commits in this repo (most recent last):

```text
{{commit_log}}
```

Inspect the work the round goal points at via Read / Glob / Grep — it
may be my own area or a teammate's. If something is rough — a bug, a
messy bit, an inconsistency — fix it. If everything looks fine, say so
and do not commit anything.

{{comments_directive}}

You cannot run shell commands. Inspect with Read / Glob / Grep, edit
with Edit / Write — do not try to run tests or any other Bash command.
The coordinator commits your changes for you with the right author and
date.

End your reply with a single trailer line:

```text
COMMIT: <short, imperative-mood subject ≤ 72 chars, no trailing period>
```

If you want any files removed as part of this commit, add one
`DELETE: <path>` line per file (paths relative to {{abs_path}}) before
the `COMMIT:` line. The coordinator runs `git rm` on each before
staging your edits.

If everything looks fine and there is nothing to commit, end with
`COMMIT: -` instead — empty reviews are expected.
