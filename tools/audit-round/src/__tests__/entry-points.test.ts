import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand } from "../command.js"
import { installationRoot } from "../context.js"
import { fixture } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

// These integration checks exercise files owned by both checkouts. Ordinary
// CI checks out Repo Edu alone; the controlled round tests need no peer.
const checkoutRequirement =
  process.platform === "win32"
    ? "The planning command supports macOS and Linux"
    : !existsSync(join(installationRoot, "../plan"))
      ? "Requires the sibling plan checkout"
      : false

for (const working of ["repo-edu", "plan"] as const) {
  test(`the published ${working} pnpm entry resolves the runner without changing directories`, {
    skip: checkoutRequirement,
  }, async (t) => {
    const f = await fixture(t)
    const bin = join(f.root, "bin")
    await mkdir(bin)
    // Even a regression into startup must never reach a real assistant.
    for (const assistant of ["claude", "codex"]) {
      await writeFile(
        join(bin, assistant),
        '#!/bin/sh\nprintf "unexpected assistant invocation" >> "$AUDIT_TEST_CALLS"\nexit 97\n',
        { mode: 0o755 },
      )
    }
    const calls = join(f.root, "unexpected-calls")
    const cwd =
      working === "plan" ? join(installationRoot, "../plan") : installationRoot
    const options = {
      cwd,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        AUDIT_TEST_CALLS: calls,
        XDG_CACHE_HOME: join(f.root, "cache"),
      },
      reject: false,
      timeout: 30_000,
    }
    const help = await execa("pnpm", ["audit-round", "--help"], options)
    assert.equal(help.exitCode, 0, help.stderr)
    assert.match(help.stdout, /Usage: audit-round/)
    const invalid =
      working === "plan"
        ? [
            ["example.md", "1"],
            ["example.md", "1-3"],
            ["HEAD"],
            ["abcdef"],
            ["HEAD-2..HEAD"],
          ]
        : [
            ["example.md", "0"],
            ["HEAD", "--chain"],
          ]
    for (const args of invalid) {
      const result = await execa("pnpm", ["audit-round", ...args], options)
      assert.equal(result.exitCode, 2, result.stderr)
      assert.match(
        result.stderr,
        working === "plan"
          ? /Implementation and commit audits run from Repo Edu/
          : /positive step number|--chain requires a plan target/,
      )
    }
    const brief = await execa(
      "pnpm",
      ["audit-round", "brief", "missing-01-oth-round.md"],
      options,
    )
    assert.equal(brief.exitCode, 1)
    assert.match(brief.stderr, /Name a round's \*-round\.md transcript/)
    await assert.rejects(readFile(calls), { code: "ENOENT" })
  })
}

for (const auditor of ["codex", "claude"] as const) {
  for (const clean of [false, true]) {
    test(`planning hook records ${auditor}'s actual capability and phase models for ${clean ? "clean" : "findings"}`, {
      skip: checkoutRequirement,
    }, async (t) => {
      const f = await roundFixture(
        t,
        auditor,
        "plan",
        false,
        clean ? null : "b",
        false,
        "plan",
      )
      assert.equal(
        await runCommand(
          ["example.md", "--auditor", auditor === "codex" ? "o" : "a"],
          f.runtime,
          f.options,
        ),
        0,
      )
      const call = (await f.calls()).find(
        (call) =>
          call.assistant === "codex" &&
          /^Run the fix phase /.test(call.args.at(-1)),
      )
      const message = join(f.root, "commit-message")
      const suffix = clean
        ? "clean: record a clean round"
        : "B1: correct the plan"
      const bullet = clean
        ? "Preserve the decision."
        : "B [field:missing] [section:decisions] [growth:none] [reach:developer] [complexity:none] Preserve the decision."
      await writeFile(
        message,
        `example/audit ${auditor === "codex" ? "o" : "a"} ${suffix}\n\ngpt-6-astra high\n\n- ${bullet}\n`,
      )
      await execa(
        "sh",
        [join(installationRoot, "../plan/hooks/commit-msg"), message],
        {
          cwd: f.planRoot,
          env: { COMMIT_AUDITOR: call.auditor, COMMIT_PHASES: call.phases },
        },
      )
      assert.equal(
        await readFile(message, "utf8"),
        `example/audit ${call.auditor} ${suffix}\n\n${call.phases}\n\n- ${bullet}\n`,
      )
    })
  }
}
