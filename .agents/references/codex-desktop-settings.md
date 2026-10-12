# Codex desktop task settings

Use this lookup before treating missing environment settings as a blocker.
`CODEX_THREAD_ID` identifies the current task. Its session file lives under
`$CODEX_HOME/sessions`, with `~/.codex` as the default home. Read the latest
`turn_context` record's `model` and `effort` fields. Those record the current
turn's settings, including task overrides. Global `config.toml` values are
defaults and do not prove which settings this task uses.

This lookup prints only those two fields, without loading conversation text
into the audit's context:

```bash
python3 - <<'PY'
import json
import os
from pathlib import Path

thread_id = os.environ["CODEX_THREAD_ID"]
codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
matches = list((codex_home / "sessions").rglob(f"*{thread_id}.jsonl"))
if len(matches) != 1:
    raise SystemExit("Expected one session file for the current task")
settings = None
with matches[0].open() as session:
    for line in session:
        record = json.loads(line)
        if record.get("type") == "turn_context":
            payload = record["payload"]
            settings = {key: payload.get(key) for key in ("model", "effort")}
print(json.dumps(settings))
PY
```

Use the returned values with the strength table and the
[Commit Capability Tag](../../CLAUDE.md#commit-capability-tag). Stop only if
this lookup cannot establish the model and effort or the effort cannot be
spelled in that tag.

Without this lookup, a desktop audit stopped at empty environment variables although both settings
were present in its task record. The lookup lives here so other protocol readers need only one link.
