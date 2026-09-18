# Claude desktop session settings

Use this lookup before treating a missing or guessed effort as a blocker. Never
spell the effort from a numeric hint in the session's own context: that hint is
not the setting the app runs the session on.

`CLAUDE_CODE_SESSION_ID` identifies the current session. Its transcript lives
under `$CLAUDE_CONFIG_DIR/projects`, with `~/.claude` as the default config
directory. Every `assistant` record carries the `effort` the turn ran at and
the `model` the API reported inside its `message`. The latest one records the
current turn's settings, including changes the user made during the session.
The desktop app also exports `CLAUDE_EFFORT`, and the `get_session` tool of
the desktop app's session server answers `self` with the same two fields, but
the transcript is the record both the desktop app and the terminal CLI write.

This lookup prints only those two fields, without loading conversation text
into the session's context:

```bash
python3 - <<'PY'
import json
import os
from pathlib import Path

session_id = os.environ["CLAUDE_CODE_SESSION_ID"]
config_dir = Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude")))
matches = list((config_dir / "projects").rglob(f"{session_id}.jsonl"))
if len(matches) != 1:
    raise SystemExit("Expected one transcript for the current session")
settings = None
with matches[0].open() as transcript:
    for line in transcript:
        record = json.loads(line)
        if record.get("type") == "assistant":
            settings = {"model": record["message"].get("model"), "effort": record.get("effort")}
print(json.dumps(settings))
PY
```

Use the returned values with the strength table and effort letters named in
the [shared round protocol](round-protocol.md#writer-tags). Apply its
missing-setting stop only if this lookup cannot establish them or the effort
cannot be spelled.

The user requested this lookup on 2026-09-18 after a desktop vet spelled its
effort as low from a guess while the session ran at high. The lookup lives
here, beside the Codex one, so other protocol readers need only one link per
assistant.
