import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import type { ModelSelection } from "../feedback.js"
import {
  modelChangeNotice,
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

const alias = { model: "opus", effort: "high" } as const
const oldRelease = { model: "old-release", effort: "high" } as const
const newRelease = { model: "new-release", effort: "high" } as const
const pinnedRelease = { model: "pinned-release", effort: "xhigh" } as const

function phase(
  name: Exclude<Phase, "close" | "implement">,
  assistant: Assistant,
  launched: ModelSelection | undefined,
  reported: ModelSelection,
): RoundData["phases"][number] {
  return {
    phase: name,
    assistant,
    ...reported,
    ...(launched === undefined ? {} : { launched }),
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

test("the same launched selection reporting another release warns in every phase", () => {
  for (const name of [
    "audit",
    "vet",
    "rebut",
    "fix",
    "watch",
    "judge",
    "close",
  ] as const) {
    const references = previousRoundModels([
      round("2026-11-01T10:00:00.000Z", [
        phase("audit", "claude", alias, oldRelease),
      ]),
    ])
    assert.equal(
      modelChangeNotice(references, name, "claude", alias, newRelease),
      `Model change: ${name} reported new-release high; the newest earlier claude run launched on opus high reported old-release high.`,
    )
  }
})

test("a changed launched selection, a different assistant and an unchanged report are silent", () => {
  const references = previousRoundModels([
    round("2026-11-01T10:00:00.000Z", [
      phase("fix", "codex", oldRelease, oldRelease),
    ]),
  ])
  assert.equal(
    modelChangeNotice(references, "fix", "codex", newRelease, newRelease),
    null,
  )
  assert.equal(
    modelChangeNotice(references, "audit", "claude", oldRelease, newRelease),
    null,
  )
  assert.equal(
    modelChangeNotice(references, "audit", "codex", oldRelease, oldRelease),
    null,
  )
})

test("the newest report on a launched selection is the reference, whatever phase ran it", () => {
  const references = previousRoundModels([
    round("2026-11-02T10:00:00.000Z", [
      phase("vet", "claude", alias, newRelease),
    ]),
    round(
      "2026-11-01T10:00:00.000Z",
      [phase("audit", "claude", alias, oldRelease)],
      "another-plan-impl-01..01",
      2,
    ),
  ])
  assert.equal(
    modelChangeNotice(references, "audit", "claude", alias, newRelease),
    null,
  )
})

test("a phase recorded without its launched selection is no reference", () => {
  const references = previousRoundModels([
    round("2026-11-01T10:00:00.000Z", [
      phase("audit", "claude", undefined, oldRelease),
    ]),
  ])
  assert.deepEqual(references, [])
})

test("round history joins active and archived plans before choosing the newest entry", async (t) => {
  const f = await fixture(t)
  const planRoot = join(f.root, "../plan")
  const activeRoot = join(planRoot, "active")
  const archived = join(planRoot, "archive/closed-plan")
  await mkdir(archived, { recursive: true })
  writeRoundData(
    join(activeRoot, roundDataFilename("active-plan", "implementation")),
    round("2026-11-01T10:00:00.000Z", [
      phase("watch", "codex", pinnedRelease, oldRelease),
    ]),
  )
  const archivedRound = round(
    "2026-11-02T10:00:00.000Z",
    [phase("watch", "codex", pinnedRelease, newRelease)],
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
  const references = await readPreviousRoundModels({ planRoot, activeRoot })
  assert.deepEqual(references, [
    { assistant: "codex", launched: pinnedRelease, reported: newRelease },
  ])
})

test("model-change history ignores commit round data", async (t) => {
  const f = await fixture(t)
  await writeFile(
    join(f.runtime.activeRoot, "commit-abc123-rounds.json"),
    "not plan round data\n",
  )

  assert.deepEqual(await readPreviousRoundModels(f.runtime), [])
})
