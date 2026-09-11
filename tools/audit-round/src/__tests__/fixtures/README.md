# Assistant CLI recordings

These recordings were copied from the plan repo's
`home/local/bin/audit-round-tests/fixtures/` during implementation step 2.
The last source-fixture commit was `aef089b`. The adjacent version files name
the CLIs used for those recordings. Initialisation metadata was reduced by the
original recorder; the consumed assistant, tool and usage events are retained.

This fixture set belongs to the TypeScript tool. Tests read only these local
copies and use the TypeScript process fixture. They do not invoke the Bash
runner or use it as an oracle. The tool's contract recorder will refresh these
files independently.

During step 2 on 2026-09-11, live Codex CLI 0.154.0 fresh and resumed probes
both recorded `approval_policy = "on-request"`,
`approvals_reviewer = "auto_review"` and `sandbox_policy.type = "workspace-write"`.
The probes used this tool's invocation arguments and requested no repository
work. Both assistants' startup settings requests also completed without an LLM
turn.
