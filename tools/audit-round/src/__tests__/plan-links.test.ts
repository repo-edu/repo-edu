import assert from "node:assert/strict"
import { test } from "node:test"
import { retargetLinks } from "../plan-links.js"

const from = "/plan/active/example-widen.md"
const to = "/plan/active/example.md"

test("links to the widening plan take the settled name and keep their form", () => {
  const source = `# Peer

The [example plan](example-widen.md#decisions) and
[the same](./example-widen.md) and an image ![shape](<example-widen.md>).

[peer]: example-widen.md "Example"
`
  assert.equal(
    retargetLinks(source, "/plan/active/peer.md", from, to),
    `# Peer

The [example plan](example.md#decisions) and
[the same](./example.md) and an image ![shape](<example.md>).

[peer]: example.md "Example"
`,
  )
})

test("a link resolves from its own file's folder", () => {
  const source =
    "[plan](../active/example-widen.md) [other](example-widen.md)\n"
  assert.equal(
    retargetLinks(source, "/plan/notes/design.md", from, to),
    "[plan](../active/example.md) [other](example-widen.md)\n",
  )
})

test("a link whose whole text is the old file name takes the new name", () => {
  const source =
    "[`example-widen.md`](example-widen.md), [example-widen.md](example-widen.md) and [`example-widen.md` peer](example-widen.md)\n"
  assert.equal(
    retargetLinks(source, "/plan/active/peer.md", from, to),
    "[`example.md`](example.md), [example.md](example.md) and [`example-widen.md` peer](example.md)\n",
  )
})

test("code, other files and other names stay as they are", () => {
  const source = `Inline \`[x](example-widen.md)\` and
[archived](../archive/example-widen.md) and
[another](another-example-widen.md) and [web](https://example.test/example-widen.md).

\`\`\`md
[fenced](example-widen.md)
\`\`\`
`
  assert.equal(retargetLinks(source, "/plan/active/peer.md", from, to), source)
})
