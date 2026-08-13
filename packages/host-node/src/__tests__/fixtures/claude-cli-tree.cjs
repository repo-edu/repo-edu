#!/usr/bin/env node

const { spawn } = require("node:child_process")
const { join } = require("node:path")

const markerPath = process.env.REPO_EDU_CLAUDE_TREE_MARKER
if (!markerPath) {
  process.stderr.write("Missing REPO_EDU_CLAUDE_TREE_MARKER.\n")
  process.exit(2)
}

const treeFixture = join(__dirname, "child-process-tree.cjs")
const grandchild = spawn(
  process.execPath,
  [treeFixture, "grandchild", markerPath],
  { stdio: ["ignore", "ignore", "ignore", "ipc"] },
)

grandchild.once("message", () => {
  grandchild.disconnect()
  grandchild.unref()
  process.stdout.write(
    '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n',
  )
  process.stdout.write(
    '{"type":"result","subtype":"success","result":"Hi","usage":{"input_tokens":1,"output_tokens":2}}\n',
  )
})
