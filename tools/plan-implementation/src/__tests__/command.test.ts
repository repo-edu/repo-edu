import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createPlanImplementationCommand,
  type PlanImplementationCommandHandlers,
  type ResetCursorCommandRequest,
  type RunCommandRequest,
} from "../command.js"

type RecordedCommands = {
  readonly runs: RunCommandRequest[]
  readonly resets: ResetCursorCommandRequest[]
}

function commandFixture(): {
  readonly recorded: RecordedCommands
  readonly handlers: PlanImplementationCommandHandlers
} {
  const recorded: RecordedCommands = { runs: [], resets: [] }
  return {
    recorded,
    handlers: {
      run: async (request) => {
        recorded.runs.push(request)
      },
      resetCursor: async (request) => {
        recorded.resets.push(request)
      },
    },
  }
}

async function parse(
  arguments_: readonly string[],
  handlers: PlanImplementationCommandHandlers,
): Promise<void> {
  await createPlanImplementationCommand(handlers).parseAsync(
    ["node", "implement-plan", ...arguments_],
    { from: "node" },
  )
}

describe("createPlanImplementationCommand", () => {
  it("selects completion, count and through-step run modes", async () => {
    const fixture = commandFixture()

    await parse(["example.md"], fixture.handlers)
    await parse(["example.md", "--count", "2"], fixture.handlers)
    await parse(["--through-step", "5", "example.md"], fixture.handlers)

    assert.deepEqual(fixture.recorded.runs, [
      { planPath: "example.md", run: { mode: "complete" } },
      {
        planPath: "example.md",
        run: { mode: "count", count: 2 },
      },
      {
        planPath: "example.md",
        run: { mode: "through-step", throughStep: 5 },
      },
    ])
  })

  it("routes the cursor-reset root option with its exact positive step", async () => {
    const fixture = commandFixture()

    await parse(["example.md", "--reset-cursor", "3"], fixture.handlers)

    assert.deepEqual(fixture.recorded.resets, [
      { planPath: "example.md", nextStep: 3 },
    ])
    assert.deepEqual(fixture.recorded.runs, [])
  })

  it("rejects conflicting modes and non-canonical positive integers", async () => {
    for (const arguments_ of [
      ["example.md", "--count", "1", "--through-step", "2"],
      ["example.md", "--count", "0"],
      ["example.md", "--count", "01"],
      ["example.md", "--through-step", "1.0"],
      ["example.md", "--count", "9007199254740992"],
      ["example.md", "--reset-cursor", "0"],
      ["example.md", "--reset-cursor", "01"],
      ["example.md", "--reset-cursor", "3", "--count", "1"],
      ["example.md", "--reset-cursor", "3", "--through-step", "4"],
      ["reset-cursor", "example.md", "--next-step", "3"],
    ]) {
      const fixture = commandFixture()
      const command = createPlanImplementationCommand(fixture.handlers)
      command.exitOverride()
      command.configureOutput({ writeErr: () => undefined })

      await assert.rejects(
        command.parseAsync(["node", "implement-plan", ...arguments_], {
          from: "node",
        }),
      )
      assert.deepEqual(fixture.recorded.runs, [])
      assert.deepEqual(fixture.recorded.resets, [])
    }
  })
})
