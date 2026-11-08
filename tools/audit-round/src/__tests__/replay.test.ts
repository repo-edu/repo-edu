import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { formatReplay, replayAnswersMatch, replayRows } from "../replay.js"
import type { PlanningRoundData } from "../round-data.js"
import { writeRoundData } from "../round-data.js"
import type { Auditor } from "../settings.js"
import { fixture } from "./helpers.js"
import { commitFixture } from "./round-fixture.js"

const claude: Auditor = {
  assistant: "claude",
  model: "claude-opus-5-5",
  effort: "high",
}
const codex: Auditor = {
  assistant: "codex",
  model: "gpt-5.6-sol",
  effort: "high",
}

test("legacy continuations match by assistant and stored pools match the full entry", () => {
  const otherCodex = { ...codex, model: "gpt-5.6-terra" }
  assert.equal(replayAnswersMatch(codex, otherCodex, false), true)
  assert.equal(replayAnswersMatch(codex, otherCodex, true), false)
  assert.equal(replayAnswersMatch("stop", "stop", true), true)
})

function round(
  auditor: Auditor,
  number: number,
  started: string,
  commit: string,
  answer: PlanningRoundData["judge"],
): PlanningRoundData {
  return {
    target: "example-plan-audit",
    round: number,
    tag: auditor.assistant === "claude" ? "abh" : "obh",
    started,
    status: "finished",
    settings: {
      vet: {
        claude: { model: "fixture", effort: "high" },
        codex: { model: "fixture", effort: "high" },
      },
      fix: { assistant: "codex", model: "fixture", effort: "high" },
    },
    auditor: { ...auditor, chosenBy: "settings" },
    phases: [
      {
        phase: "audit",
        assistant: auditor.assistant,
        model: auditor.model,
        effort: auditor.effort,
        milliseconds: 1_000,
        tokens: [],
        peakContext: null,
        compactions: 0,
      },
    ],
    commits: [{ repository: "plan", sha: commit }],
    findings: [],
    judge: answer,
    phase: "detailing",
    settling: "",
  }
}

test("replay uses the fixed legacy pool and reports the next round's findings", async (t) => {
  const f = await fixture(t)
  const initial = await commitFixture(
    f.runtime.planRoot,
    "example/init abh: initialise fixture",
    "2026-11-08T09:00:00Z",
  )
  await commitFixture(
    f.runtime.repoEduRoot,
    "fixture commit",
    "2026-11-08T09:00:00Z",
  )
  const sha = (
    await execa("git", ["rev-parse", initial], { cwd: f.runtime.planRoot })
  ).stdout
  const first = round(claude, 1, "2026-11-08T10:00:00Z", sha, {
    answer: codex,
    reason: "Stored continuation",
  })
  const second = round(codex, 2, "2026-11-08T11:00:00Z", sha, {
    answer: "ready",
    reason: "Stored ending",
  })
  writeRoundData(join(f.runtime.activeRoot, "example-plan-rounds.json"), first)
  writeRoundData(join(f.runtime.activeRoot, "example-plan-rounds.json"), second)

  const rows = await replayRows(f.runtime)
  assert.deepEqual(
    rows.map((row) => ({
      round: row.round,
      computed: row.computed,
      matches: row.matches,
      nextFindings: row.nextFindings,
    })),
    [
      {
        round: 1,
        computed: codex,
        matches: true,
        nextFindings: "none",
      },
      {
        round: 2,
        computed: "ready",
        matches: true,
        nextFindings: "no next round",
      },
    ],
  )
  assert.match(
    formatReplay(rows),
    /\| all \| 2 \| 2 \| 0 \|[\s\S]*Fixed corpus/,
  )
})
