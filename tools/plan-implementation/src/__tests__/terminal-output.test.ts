import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createTerminalDisplay } from "../terminal-output.js"

describe("terminal display", () => {
  it("keeps TTY detail on one replaceable terminal-width line", () => {
    const calls: string[] = []
    const refreshes: Array<() => void> = []
    let elapsed = "12:34"
    const update = Object.assign(
      (line: string) => calls.push(`detail:${line}`),
      {
        clear: () => calls.push("clear"),
        done: () => calls.push("done"),
        persist: (...lines: string[]) =>
          calls.push(`overview:${lines.join(" ")}`),
      },
    )
    const output = {
      columns: 24,
      isTTY: true,
      write() {
        throw new Error("The injected updater owns TTY writes.")
      },
    }
    const display = createTerminalDisplay(
      output as unknown as NodeJS.WritableStream & {
        readonly columns: number
        readonly isTTY: boolean
      },
      () => update,
      (callback) => {
        calls.push("schedule")
        refreshes.push(callback)
        return () => calls.push("cancel")
      },
    )

    display.detail(() => `[${elapsed}] Search files for a very long expression`)
    elapsed = "12:35"
    refreshes[0]?.()
    display.detail(() => `[${elapsed}] Inspect Git commit`)
    display.overview("[12:35] Phase: checking")
    refreshes[0]?.()
    display.close()

    assert.equal(refreshes.length, 1)
    assert.deepEqual(calls, [
      "detail:[12:34] Search files fo…",
      "schedule",
      "detail:[12:35] Search files fo…",
      "detail:[12:35] Inspect Git com…",
      "overview:[12:35] Phase: checking",
      "cancel",
      "clear",
      "done",
    ])
  })

  it("writes only overview lines when output is redirected", () => {
    const writes: string[] = []
    const output = {
      isTTY: false,
      write(text: string) {
        writes.push(text)
        return true
      },
    }
    const display = createTerminalDisplay(
      output as unknown as NodeJS.WritableStream & {
        readonly isTTY: boolean
      },
      () => {
        throw new Error("Redirected output must not create a line updater.")
      },
      () => {
        throw new Error("Redirected output must not schedule refreshes.")
      },
    )

    display.detail(() => "[0:01] Search files")
    display.overview("[0:02] Phase: checking")
    display.close()

    assert.deepEqual(writes, ["[0:02] Phase: checking\n"])
  })
})
