I'm {{persona_name}} <{{persona_email}}>, working on a Python assignment
{{team_phrase}}: {{assignment}} The repo is at {{abs_path}}.

Please read `{{coder_agreement_path}}` first — it's the working agreement
we all share.

{{ownership_directive}}

Round goal: {{round_goal}}

Run `git -C {{abs_path}} log --oneline` and inspect the work the round
goal points at — it may be my own area or a teammate's. If something is
rough — a bug, a messy bit, an inconsistency — fix it and commit. If
everything looks fine, say so and don't commit anything.

Code style: {{coder_level_rules}}

{{comments_directive}}

When you're done, stage and commit your work with:

```bash
git -C {{abs_path}} add -A
GIT_AUTHOR_NAME="{{persona_name}}" GIT_AUTHOR_EMAIL="{{persona_email}}" GIT_AUTHOR_DATE="{{commit_date}}" \
GIT_COMMITTER_NAME="{{persona_name}}" GIT_COMMITTER_EMAIL="{{persona_email}}" GIT_COMMITTER_DATE="{{commit_date}}" \
git -C {{abs_path}} commit -m "<your one-line message>"
```

Use a short, imperative-mood subject line (≤ 72 chars, no trailing
period). If there's nothing to commit, just say so and stop.
