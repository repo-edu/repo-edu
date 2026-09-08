import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { it } from "node:test"
import {
  checkDesktopInventorySources,
  ownershipEntryLists,
} from "../desktop-inventory-checks.js"
import {
  compareEntryMembers,
  readEntryMembers,
  syntaxTree,
} from "../desktop-inventory-syntax.js"
import { desktopEntryLists } from "../desktop-source-inventory.js"
import { ROOT, repoPathToAbsolute } from "../repo-paths.js"

const sources = new Map(
  ownershipEntryLists.map(({ file }) => [
    file,
    readFileSync(repoPathToAbsolute(ROOT, file), "utf8"),
  ]),
)

it("reconciles each Decision 21 list against its installed owner", () => {
  assert.deepEqual(checkDesktopInventorySources(sources), [])
})

for (const list of desktopEntryLists) {
  it(`${list.owner} refuses missing, extra and differently classified entries`, () => {
    const source = sources.get(list.file)
    assert.ok(source)
    const members = [
      ...new Set(
        readEntryMembers(syntaxTree(list.file, source), list.selector),
      ),
    ]
    assert.ok(members.length > 0)
    assert.deepEqual(compareEntryMembers(list.members, members), [])
    for (const member of members) {
      assert.ok(
        compareEntryMembers(
          list.members,
          members.filter((value) => value !== member),
        ).length > 0,
      )
      assert.ok(
        compareEntryMembers(
          list.members,
          members.map((value) =>
            value === member ? `${value}-changed` : value,
          ),
        ).length > 0,
      )
    }
    assert.ok(
      compareEntryMembers(list.members, [...members, "unclassified-entry"])
        .length > 0,
    )
  })
}

it("detects edited runtime classifications instead of trusting the declared key set", () => {
  const file = "apps/desktop/src/host-entry-inventory.ts"
  const mutated = new Map(sources)
  const original = sources.get(file)
  assert.ok(original)
  mutated.set(
    file,
    original.replace('"course.list": "ordinary"', '"course.list": "exclusive"'),
  )
  assert.ok(
    checkDesktopInventorySources(mutated).some((v) =>
      v.message.includes("course.list:exclusive"),
    ),
  )
})

it("fails when an owner is removed", () => {
  const mutated = new Map(sources)
  mutated.delete("apps/desktop/src/request-port-wire.ts")
  assert.ok(
    checkDesktopInventorySources(mutated).some((v) =>
      v.message.includes("missing list owner"),
    ),
  )
})

for (const [file, before, after, owner] of [
  [
    "apps/desktop/src/desktop-terminal-sources.ts",
    'details.reason === "clean-exit"',
    'details.reason === "crashed"',
    "terminal child-loss classification",
  ],
  [
    "apps/desktop/src/desktop-menu.ts",
    'role: "editMenu"',
    'role: "reload"',
    "native-menu allowlist",
  ],
  [
    "apps/desktop/src/request-port-wire.ts",
    'type: z.literal("cancel")',
    'type: z.literal("stop")',
    "request-port schemas",
  ],
  [
    "apps/desktop/src/main.ts",
    "process.exit(1)",
    "shutdownAsync()",
    "fatal synchronous action",
  ],
  [
    "apps/desktop/src/desktop-session-lifetime.ts",
    "window.focus()",
    "window.reload()",
    "same-program focus action",
  ],
  [
    "apps/desktop/src/preload.ts",
    'parseUpdaterMessage("onUpdateError", error)',
    "error",
    "updater presentation validation",
  ],
  [
    "packages/renderer-app/src/session/session-controller-context.tsx",
    "onPasteCapture={admitInput}",
    "onPasteCapture={allowPaste}",
    "session native-input freeze",
  ],
  [
    "packages/renderer-app/src/session/session-operations.ts",
    "canAdmitSessionChange(this.snapshot())",
    "true",
    "session programmatic mutation admission",
  ],
] as const) {
  it(`detects a changed runtime owner: ${owner}`, () => {
    const mutated = new Map(sources)
    const original = sources.get(file)
    assert.ok(original)
    assert.ok(original.includes(before), `Missing mutation target: ${before}`)
    mutated.set(file, original.replace(before, after))
    assert.ok(
      checkDesktopInventorySources(mutated).some((v) =>
        v.message.startsWith(owner),
      ),
    )
  })
}

it("does not hide computed keys, spreads or dynamic roles", () => {
  const tree = syntaxTree(
    "owner.ts",
    `
    const list = { [key]: "ordinary", ...other }
    const menu = { role: chosenRole }
  `,
  )
  assert.deepEqual(
    readEntryMembers(tree, { kind: "map", name: "list", values: true }),
    ["<dynamic-key>:ordinary", "<non-property>"],
  )
  assert.deepEqual(readEntryMembers(tree, { kind: "property", name: "role" }), [
    "<dynamic:chosenRole>",
  ])
})
