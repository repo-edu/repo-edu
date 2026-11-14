import assert from "node:assert/strict"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { executionContext } from "../context.js"
import { writePhaseInstructions } from "./helpers.js"

/** Sibling Repo Edu and plan checkouts, with the evidence checkout left to each test. */
async function siblings(t: TestContext) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "audit-round-context-")),
  )
  t.after(() => rm(root, { recursive: true, force: true }))
  const repoEduRoot = join(root, "repo-edu")
  const planRoot = join(root, "plan")
  await mkdir(join(planRoot, "active"), { recursive: true })
  await mkdir(repoEduRoot)
  await writePhaseInstructions(repoEduRoot, planRoot)
  await writeFile(join(repoEduRoot, "pnpm-workspace.yaml"), "packages: []\n")
  return { root, repoEduRoot, planRoot }
}

test("the round folder is the evidence checkout's active folder, apart from the plans", async (t) => {
  const { root, repoEduRoot, planRoot } = await siblings(t)
  await mkdir(join(root, "plan-evidence/active"), { recursive: true })

  const context = await executionContext(repoEduRoot)

  assert.equal(context.activeRoot, join(planRoot, "active"))
  assert.equal(context.evidenceRoot, join(root, "plan-evidence"))
  assert.equal(context.roundRoot, join(root, "plan-evidence/active"))
})

test("no command context exists without the evidence checkout or its round folder", async (t) => {
  const { root, repoEduRoot } = await siblings(t)
  await assert.rejects(executionContext(repoEduRoot), { code: "ENOENT" })

  await mkdir(join(root, "plan-evidence"))
  await assert.rejects(executionContext(repoEduRoot), { code: "ENOENT" })
})
