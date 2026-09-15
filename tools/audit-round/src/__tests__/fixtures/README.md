# Assistant CLI recordings

These recordings started as copies from the plan repo's retired Bash runner,
taken during implementation step 2 from its fixture commit `aef089b`. The
adjacent version files name the CLIs used for those recordings. Initialisation
metadata was reduced by the original recorder; the consumed assistant, tool and
usage events are retained.

Tests read only these local copies and the process fixture beside them.

Run `pnpm audit-round:contract` from the Repo Edu root to refresh these files
independently. Append `claude` or `codex` to record one assistant. This exercises
the actual invocation, validation and output code with trivial shell probes,
including an intentional tool failure. A failed contract replaces no selected
fixtures. The adjacent version files and `recorded-at.txt` identify the latest
successful recording. Generate streams with this command, never by hand.

During step 2 on 2026-09-11, live Codex CLI 0.154.0 fresh and resumed probes
both recorded `approval_policy = "on-request"`,
`approvals_reviewer = "auto_review"` and `sandbox_policy.type = "workspace-write"`.
The probes used this tool's invocation arguments and requested no repository
work. Both assistants' startup settings requests also completed without an LLM
turn.
