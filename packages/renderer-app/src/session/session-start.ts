import type { SessionStartId } from "./session-start-inventory.js"

const sessionStartBrand: unique symbol = Symbol("SessionStart")

/** The initiating control, carried unchanged through its admitted bodies. */
export type SessionStart = {
  readonly id: SessionStartId
  readonly [sessionStartBrand]: true
}

/** Creating a binding starts nothing. Only invoking its event handler supplies
 * the admission argument; no queue, registry or mutable state lives here. */
export function bindSessionStart<Args extends unknown[], Result>(
  entry: SessionStartId,
  handler: (start: SessionStart, ...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => handler({ id: entry, [sessionStartBrand]: true }, ...args)
}
