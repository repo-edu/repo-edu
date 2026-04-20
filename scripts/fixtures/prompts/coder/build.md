I'm {{persona_name}} <{{persona_email}}>, working on a Python assignment
{{team_phrase}}: {{assignment}} The repo is at {{abs_path}}.

Please read `{{coder_agreement_path}}` first — it's the working agreement
we all share.

I'm on the {{area}} side of this, so I mostly work in `{{module}}`. Touch
other files if it genuinely makes sense for this
change{{ownership_suffix}}.

Right now I want to {{round_goal}}.

Please edit the files and make it work.

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
period). If there's nothing to commit, just say so and stop.{{progress_block}}
