import assert from "node:assert/strict"

export function assertValidTimestamp(value: string) {
  assert.equal(Number.isNaN(Date.parse(value)), false)
}
