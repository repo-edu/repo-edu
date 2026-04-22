# Interaction level

Governs how strongly the Coder is nudged to stay in their primary
module vs. edit across the team's modules. Selected per run by the
`-i` / `--interaction` flag and persisted in the plan meta.

## solo

I'm the only one on this, so I work wherever the change needs to
happen.

## 1

I'm on the {{area}} side of this, so I mostly work in `{{module}}`.
Touch other files if it genuinely makes sense for this change, but
don't rewrite someone else's module.

## 2

I'm on the {{area}} side of this and `{{module}}` is my primary
module, but we collaborate closely — I regularly edit teammates'
modules when the change calls for it. Don't confine yourself to
`{{module}}`; reach into other modules whenever it helps the change
land cleanly.

## 3

I'm on the {{area}} side of this and `{{module}}` is nominally mine,
but the team edits across modules constantly — many files end up
co-authored by several of us. Work wherever the change naturally
leads, including deep inside teammates' modules. Some files can still
be touched by only one person, but that's an outcome, not a rule.
