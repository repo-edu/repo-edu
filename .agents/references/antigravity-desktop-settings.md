# Antigravity desktop session settings

For a hand-run commit, take the **Artifact Directory Path** or **Conversation
ID** from the current Antigravity session context. Replace the argument below
with that value. The path leads straight to the transcript. With an ID, the
lookup checks the desktop, CLI and IDE conversation directories for that ID.

The latest `PLANNER_RESPONSE` records the model used for the turn, including
its effort suffix. For example, `gemini-4-neon-xhigh` gives the model
`gemini-4-neon` and effort `xhigh`. This command prints only those fields.

```bash
python3 - '<artifact-directory-path-or-conversation-id>' <<'PY'
import json
import sys
from pathlib import Path

location = Path(sys.argv[1]).expanduser()
roots = [location] if location.is_absolute() else [
    Path.home() / ".gemini" / app / "brain" / location
    for app in ("antigravity", "antigravity-cli", "antigravity-ide")
]
logs = [root / ".system_generated/logs/transcript.jsonl" for root in roots]
matches = [log for log in logs if log.is_file()]
if len(matches) != 1:
    raise SystemExit("Expected one transcript for the current conversation")

reported = None
with matches[0].open() as transcript:
    for line in transcript:
        record = json.loads(line)
        if record.get("type") == "PLANNER_RESPONSE":
            reported = record.get("model")

model, _, effort = (reported or "").rpartition("-")
if not model or effort not in ("low", "medium", "high", "xhigh"):
    raise SystemExit("The latest planner response has no model and effort usable in a commit tag")
print(json.dumps({"model": model, "effort": effort}))
PY
```

Use the reported values with the configured strength models and the
[Commit Capability Tag](../../CLAUDE.md#commit-capability-tag).
