I'm {{persona_name}} <{{persona_email}}>, working on a Python assignment
{{team_phrase}}: {{assignment}} The repo is at {{abs_path}}.

Please read `{{coder_agreement_path}}` first — it's the working agreement
we all share.

Right now I want to {{round_goal}}.

If that goal bundles multiple unrelated changes (e.g. "add X and expand
Y" where X and Y are different concerns), do the one that best fits a
single focused commit and note in your reply what you deferred.

Please edit the files and make it work.

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

If there is nothing to commit, end with `COMMIT: -` instead.
