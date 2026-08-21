import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  codingCommandActivity,
  unwrapCodingCommand,
} from "../coding-command-display.js"

describe("Codex command display", () => {
  it("decodes a failed wrapped shell command without quote artifacts", () => {
    const wrapped =
      "/bin/zsh -lc \"rg --files | rg 'BOUNDARIES\\\\.md\"'$|boundar|child-lifetime.*md|host.*lifetime'\"' && rg -n \\\"unobserved-host-death|unobserved host death|residue|heartbeat|watchdog|parent watch\\\" . --glob '*.md' --glob '\"'!node_modules/**'\"'\""

    assert.equal(
      unwrapCodingCommand(wrapped),
      "rg --files | rg 'BOUNDARIES\\.md$|boundar|child-lifetime.*md|host.*lifetime' && rg -n \"unobserved-host-death|unobserved host death|residue|heartbeat|watchdog|parent watch\" . --glob '*.md' --glob '!node_modules/**'",
    )
  })

  it("decodes supported shell wrappers and preserves variable references", () => {
    assert.equal(
      unwrapCodingCommand("bash -c \"printf '%s' \\$RESULT\""),
      "printf '%s' $RESULT",
    )
  })

  it("leaves plain and malformed commands intact", () => {
    assert.equal(unwrapCodingCommand("pnpm test"), "pnpm test")
    assert.equal(
      unwrapCodingCommand("zsh -lc 'pnpm test"),
      "zsh -lc 'pnpm test",
    )
  })

  it("turns common decoded commands into short activity labels", () => {
    assert.equal(
      codingCommandActivity(
        "/bin/zsh -lc 'rg -n terminal-view src'",
        "started",
      ),
      "Search files",
    )
    assert.equal(
      codingCommandActivity(
        "sed -n '1,120p' src/terminal-view.ts",
        "succeeded",
      ),
      "Finished: Read src/terminal-view.ts",
    )
    assert.equal(
      codingCommandActivity(
        "TSX_TSCONFIG_PATH=tsconfig.base.json pnpm --filter @repo-edu/plan-implementation typecheck",
        "failed",
      ),
      "Failed: Check TypeScript",
    )
    assert.equal(
      codingCommandActivity("git diff --check", "started"),
      "Inspect Git changes",
    )
  })

  it("falls back to a decoded command when its program has no label", () => {
    assert.equal(
      codingCommandActivity("/bin/zsh -lc 'custom-tool --flag'", "started"),
      "Run: custom-tool --flag",
    )
  })
})
