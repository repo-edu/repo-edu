import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import type { LogCommit } from "../episode-log.js"
import type { ModelSelection } from "../feedback.js"
import {
  modelChangeNotice,
  previousCloseModel,
  previousRoundModels,
  readPreviousRoundModels,
} from "../model-change.js"
import type { Assistant, Phase } from "../phase.js"
import {
  type ImplementationRoundData,
  type RoundData,
  roundDataFilename,
  writeRoundData,
} from "../round-data.js"
import { fixture } from "./helpers.js"

const oldSelection = { model: "old-model", effort: "high" } as const
const newSelection = { model: "new-model", effort: "xhigh" } as const

function phase(
  name: Exclude<Phase, "close" | "implement">,
  assistant: Assistant,
  selection: ModelSelection,
): RoundData["phases"][number] {
  return {
    phase: name,
    assistant,
    ...selection,
    milliseconds: 1,
    tokens: [],
    peakContext: null,
    compactions: 0,
  }
}

function round(
  started: string,
  phases: RoundData["phases"],
  target = "fixture-impl-01..01",
  number = 1,
): ImplementationRoundData {
  return {
    target,
    round: number,
    tag: "obx",
    started,
    status: "finished",
    settings: {
      audit: {
        claude: { model: "claude-model", effort: "high" },
        codex: { model: "codex-model", effort: "xhigh" },
      },
      vet: {
        claude: { model: "claude-model", effort: "high" },
        codex: { model: "codex-model", effort: "xhigh" },
      },
      fix: { assistant: "codex", model: "codex-model", effort: "xhigh" },
    },
    auditor: {
      assistant: "codex",
      model: "codex-model",
      effort: "xhigh",
      chosenBy: "settings",
    },
    phases: [...phases],
    commits: [],
    findings: [],
    judge: null,
    scope: "1",
    judgedRepos: ["repo-edu"],
  }
}

test("every recorded non-fix round phase reports a changed model or effort", () => {
  for (const name of [
    "audit",
    "vet",
    "rebut",
    "brief",
    "watch",
    "judge",
  ] as const) {
    const references = previousRoundModels([
      round("2026-11-01T10:00:00.000Z", [phase(name, "codex", oldSelection)]),
    ])
    assert.equal(
      modelChangeNotice(references, name, "codex", newSelection, newSelection),
      `Model change: ${name} reported new-model xhigh; the newest earlier ${name} run by codex reported old-model high.`,
    )
  }
})

test("fix compares the report with the model and effort the runner launched", () => {
  assert.equal(
    modelChangeNotice([], "fix", "claude", oldSelection, oldSelection),
    null,
  )
  assert.equal(
    modelChangeNotice([], "fix", "claude", oldSelection, newSelection),
    "Model change: fix reported new-model xhigh; the runner launched claude on old-model high.",
  )
})

test("close compares with the newest earlier close by the same assistant", () => {
  const commit = (subject: string, body: string, sha: string): LogCommit => ({
    sha,
    committedAt: "2026-11-01T10:00:00.000Z",
    subject,
    body,
    files: [],
    renames: [],
  })
  const reference = previousCloseModel(
    [
      commit("newest/closed abx: archive the plan", "claude-new xhigh", "2"),
      commit("earlier/closed obh: archive the plan", "codex-old high", "1"),
    ],
    "codex",
  )
  assert.ok(reference)
  assert.equal(
    modelChangeNotice(
      [reference],
      "close",
      "codex",
      newSelection,
      newSelection,
    ),
    "Model change: close reported new-model xhigh; the newest earlier close run by codex reported codex-old high.",
  )
})

test("a different assistant and an unchanged small history produce no notice", () => {
  const references = previousRoundModels([
    round("2026-11-01T10:00:00.000Z", [phase("audit", "claude", oldSelection)]),
    round(
      "2026-11-02T10:00:00.000Z",
      [phase("audit", "claude", newSelection)],
      "another-plan-impl-01..01",
      2,
    ),
  ])
  assert.equal(
    modelChangeNotice(
      references,
      "audit",
      "claude",
      newSelection,
      newSelection,
    ),
    null,
  )
  assert.equal(
    modelChangeNotice(references, "audit", "codex", newSelection, newSelection),
    null,
  )
})

test("round history joins active and archived plans before choosing the newest entry", async (t) => {
  const f = await fixture(t)
  const planRoot = join(f.root, "../plan")
  const archived = join(planRoot, "archive/closed-plan")
  await mkdir(archived, { recursive: true })
  writeRoundData(
    join(planRoot, roundDataFilename("active-plan", "implementation")),
    round("2026-11-01T10:00:00.000Z", [phase("watch", "codex", oldSelection)]),
  )
  const archivedRound = round(
    "2026-11-02T10:00:00.000Z",
    [phase("watch", "codex", newSelection)],
    "closed-plan-plan",
  )
  const {
    scope: _scope,
    judgedRepos: _judgedRepos,
    ...archivedRoundCommon
  } = archivedRound
  writeRoundData(join(archived, roundDataFilename("closed-plan", "planning")), {
    ...archivedRoundCommon,
    phase: "detailing",
    settling: "",
  })
  const references = await readPreviousRoundModels(planRoot)
  assert.equal(
    references.find(
      (reference) =>
        reference.phase === "watch" && reference.assistant === "codex",
    )?.selection.model,
    "new-model",
  )
})
