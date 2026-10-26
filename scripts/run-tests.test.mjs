import assert from "node:assert/strict"
import test from "node:test"
import { packageManagerCommand } from "./package-manager-command.mjs"
import { createPnpmTestArguments } from "./run-tests.mjs"

test("runs every workspace test when no package is given", () => {
  assert.deepEqual(createPnpmTestArguments([]), [
    "-r",
    "--stream",
    "--if-present",
    "run",
    "test",
  ])
})

test("filters tests by workspace package path", () => {
  assert.deepEqual(createPnpmTestArguments(["tools/audit-round"]), [
    "--filter",
    "./tools/audit-round",
    "--fail-if-no-match",
    "run",
    "test",
  ])
})

test("normalises explicit and Windows-style relative paths", () => {
  assert.deepEqual(
    createPnpmTestArguments(["./packages/domain/"]),
    createPnpmTestArguments(["packages\\domain"]),
  )
})

test("rejects selectors that do not name one workspace package", () => {
  for (const argv of [
    ["domain"],
    ["packages/*"],
    ["../repo-edu"],
    ["packages/domain", "packages/application"],
  ]) {
    assert.throws(
      () => createPnpmTestArguments(argv),
      /Usage: pnpm test/,
    )
  }
})

test("launches a JavaScript package manager entrypoint through Node", () => {
  assert.deepEqual(
    packageManagerCommand(["run", "test"], {
      npmExecPath: "C:\\pnpm\\pnpm.cjs",
      nodeExecPath: "C:\\node\\node.exe",
      platform: "win32",
    }),
    {
      command: "C:\\node\\node.exe",
      args: ["C:\\pnpm\\pnpm.cjs", "run", "test"],
    },
  )
})

test("launches a native package manager entrypoint directly", () => {
  assert.deepEqual(
    packageManagerCommand(["run", "test"], {
      npmExecPath: "C:\\pnpm\\pnpm.exe",
      nodeExecPath: "C:\\node\\node.exe",
      platform: "win32",
    }),
    {
      command: "C:\\pnpm\\pnpm.exe",
      args: ["run", "test"],
    },
  )
})

test("requires the pnpm lifecycle entrypoint on Windows", () => {
  assert.throws(
    () =>
      packageManagerCommand(["run", "test"], {
        npmExecPath: "",
        nodeExecPath: "C:\\node\\node.exe",
        platform: "win32",
      }),
    /Run this script through pnpm on Windows\./,
  )
})
