import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { promisify } from "node:util"
import {
  PlanReaderError,
  readCommittedImplementationPlan,
} from "../plan-reader.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()

const validPlan = `# Example

## Implementation plan

1. **Read the source.** Keep the whole plan available.

2. **Run its proofs.** Execute the declared commands.

    \`\`\`repo-edu-proofs
    [
      {
        "program": "pnpm",
        "arguments": ["check"]
      },
      {
        "user-action": "Inspect the rendered result."
      }
    ]
    \`\`\`

    1. A nested ordered list stays inside step 2.

## Later section

1. This list is outside the implementation section.
`

async function git(root: string, arguments_: readonly string[]) {
  return await execFileAsync("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  })
}

async function createPlanRepository(
  markdown = validPlan,
): Promise<{ readonly root: string; readonly planPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-plan-reader-test-"))
  temporaryRoots.add(root)
  await git(root, ["init", "--quiet"])
  await git(root, ["config", "user.name", "Plan Reader Test"])
  await git(root, ["config", "user.email", "plan-reader@example.invalid"])
  const planDirectory = join(root, "plans")
  await mkdir(planDirectory)
  const planPath = join(planDirectory, "plan-example.md")
  await writeFile(planPath, markdown)
  await git(root, ["add", "--", "plans/plan-example.md"])
  await git(root, ["commit", "--quiet", "-m", "add plan"])
  return { root, planPath }
}

async function readRejectedPlan(markdown: string): Promise<unknown> {
  const { planPath } = await createPlanRepository(markdown)
  try {
    await readCommittedImplementationPlan(planPath)
  } catch (error) {
    return error
  }
  assert.fail("Expected the plan reader to reject the plan.")
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  temporaryRoots.clear()
})

describe("readCommittedImplementationPlan", () => {
  it("reads exact steps, proof data and source spans", async () => {
    const { root, planPath } = await createPlanRepository()
    const plan = await readCommittedImplementationPlan(planPath)

    assert.equal(plan.source.planName, "example")
    assert.equal(plan.source.planPath, planPath)
    assert.match(plan.source.commitOid, /^[0-9a-f]{40,}$/)
    assert.match(plan.source.blobOid, /^[0-9a-f]{40,}$/)
    const { stdout: committedBlob } = await git(root, [
      "rev-parse",
      "HEAD:plans/plan-example.md",
    ])
    assert.equal(plan.source.blobOid, committedBlob.trim())
    assert.deepEqual(
      plan.steps.map((step) => ({
        number: step.number,
        title: step.title,
        proofs: step.proofs.items,
      })),
      [
        { number: 1, title: "Read the source", proofs: [] },
        {
          number: 2,
          title: "Run its proofs",
          proofs: [
            { program: "pnpm", arguments: ["check"] },
            { "user-action": "Inspect the rendered result." },
          ],
        },
      ],
    )
    assert.equal(plan.steps[0].proofs.sourceSpan, null)
    assert.match(
      plan.markdown.slice(
        plan.steps[0].sourceSpan.start.offset,
        plan.steps[0].sourceSpan.end.offset,
      ),
      /^1\. \*\*Read the source/,
    )
    const proofSpan = plan.steps[1].proofs.sourceSpan
    assert.ok(proofSpan)
    assert.match(
      plan.markdown.slice(proofSpan.start.offset, proofSpan.end.offset),
      /^```repo-edu-proofs/,
    )
    assert.match(
      plan.markdown.slice(
        plan.implementationListSpan.start.offset,
        plan.implementationListSpan.end.offset,
      ),
      /^1\. \*\*Read the source/,
    )
  })

  it("allows unrelated working changes in the plan checkout", async () => {
    const { root, planPath } = await createPlanRepository()
    const unrelatedPath = join(root, "notes.md")
    await writeFile(unrelatedPath, "committed\n")
    await git(root, ["add", "--", "notes.md"])
    await git(root, ["commit", "--quiet", "-m", "add notes"])
    await writeFile(unrelatedPath, "changed\n")

    const plan = await readCommittedImplementationPlan(planPath)
    const { stdout: lastTouchCommit } = await git(root, [
      "log",
      "-1",
      "--format=%H",
      "--",
      "plans/plan-example.md",
    ])
    const { stdout: headCommit } = await git(root, ["rev-parse", "HEAD"])
    assert.equal(plan.source.commitOid, lastTouchCommit.trim())
    assert.notEqual(plan.source.commitOid, headCommit.trim())
  })

  it("rejects changed working bytes for the plan itself", async () => {
    const { planPath } = await createPlanRepository()
    await writeFile(planPath, `${validPlan}\nChanged after commit.\n`)

    await assert.rejects(
      readCommittedImplementationPlan(planPath),
      /working bytes do not match its committed Git blob/,
    )
  })

  it("requires exactly one implementation section", async () => {
    const missing = await readRejectedPlan("# Example\n")
    assert.ok(missing instanceof PlanReaderError)
    assert.match(missing.message, /exactly one .* found 0/)

    const duplicate = await readRejectedPlan(
      `${validPlan}\n## Implementation plan\n`,
    )
    assert.ok(duplicate instanceof PlanReaderError)
    assert.match(duplicate.message, /exactly one .* found 2/)
  })

  it("requires exactly one top-level ordered implementation list", async () => {
    const missing = await readRejectedPlan(
      "# Example\n\n## Implementation plan\n\n- Not ordered.\n",
    )
    assert.ok(missing instanceof PlanReaderError)
    assert.match(missing.message, /ordered list; found 0/)

    const duplicate = await readRejectedPlan(
      "# Example\n\n## Implementation plan\n\n1. First.\n\nText.\n\n1. Second.\n",
    )
    assert.ok(duplicate instanceof PlanReaderError)
    assert.match(duplicate.message, /ordered list; found 2/)
  })

  it("rejects duplicate proof blocks within one step", async () => {
    const error = await readRejectedPlan(`# Example

## Implementation plan

1. First.

    \`\`\`repo-edu-proofs
    []
    \`\`\`

    \`\`\`repo-edu-proofs
    []
    \`\`\`
`)
    assert.ok(error instanceof PlanReaderError)
    assert.match(error.message, /step 1 contains 2 repo-edu-proofs blocks/)
  })

  it("rejects malformed JSON and non-exact proof shapes", async () => {
    const malformed = await readRejectedPlan(`# Example

## Implementation plan

1. First.

    \`\`\`repo-edu-proofs
    [{]
    \`\`\`
`)
    assert.ok(malformed instanceof PlanReaderError)
    assert.match(malformed.message, /invalid JSON/)

    const extraField = await readRejectedPlan(`# Example

## Implementation plan

1. First.

    \`\`\`repo-edu-proofs
    [{"program":"pnpm","arguments":[],"user-action":"No"}]
    \`\`\`
`)
    assert.ok(extraField instanceof PlanReaderError)
    assert.match(extraField.message, /invalid repo-edu-proofs data/)

    const blankAction = await readRejectedPlan(`# Example

## Implementation plan

1. First.

    \`\`\`repo-edu-proofs
    [{"user-action":"   "}]
    \`\`\`
`)
    assert.ok(blankAction instanceof PlanReaderError)
    assert.match(blankAction.message, /non-whitespace character/)
  })

  it("rejects proof blocks outside a top-level step", async () => {
    const error = await readRejectedPlan(`# Example

## Implementation plan

1. First.

\`\`\`repo-edu-proofs
[]
\`\`\`
`)
    assert.ok(error instanceof PlanReaderError)
    assert.match(error.message, /must belong to a top-level step/)
  })
})
