import assert from "node:assert/strict"
import { it } from "node:test"
import {
  parseUpdaterMessage,
  updaterMessageChannels,
  updaterMessageSchemas,
} from "../updater-wire.js"

it("validates each presentation message before delivery", () => {
  const messages = {
    onUpdateAvailable: { version: "1.2.3" },
    onUpdateDownloaded: undefined,
    onUpdateError: { message: "Download failed" },
    onDownloadProgress: {
      percent: 50,
      bytesPerSecond: 20,
      transferred: 100,
      total: 200,
    },
  }
  assert.deepEqual(Object.keys(updaterMessageSchemas), Object.keys(messages))
  assert.deepEqual(Object.keys(updaterMessageChannels), Object.keys(messages))
  assert.equal(new Set(Object.values(updaterMessageChannels)).size, 4)
  for (const kind of Object.keys(messages) as Array<keyof typeof messages>) {
    assert.deepEqual(parseUpdaterMessage(kind, messages[kind]), messages[kind])
    for (const malformed of [null, "payload", { unexpected: true }])
      assert.throws(() => parseUpdaterMessage(kind, malformed))
  }
  assert.throws(() =>
    parseUpdaterMessage("onUpdateAvailable", { version: "1", action: "quit" }),
  )
  assert.throws(() =>
    parseUpdaterMessage("onDownloadProgress", {
      ...messages.onDownloadProgress,
      percent: NaN,
    }),
  )
})
