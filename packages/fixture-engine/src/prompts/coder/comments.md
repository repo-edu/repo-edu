# Comment tiers

Controls whether and how the Coder writes code comments and docstrings,
passed as `{{comments_directive}}`. Selected by the `--comments` flag.

- **Tier 0** (section `0`): no comments, no docstrings.
- **Tier 1** (section `1`): no docstrings
- **Tier 2** (section `2`): no noise docstrings
- **Tier 3**: no directive is injected — the Coder decides. Intentionally
  no section in this file.

## 0

Do not add any code comments or docstrings.

## 1

Do not add any docstrings.

## 2

Skip any docstring that just restates what the function signature already says.
