/**
 * A request the command cannot carry out as given: a bad path, a line range
 * that does not select complete top-level statements, a package without a
 * typecheck configuration or a move the engine declines. The command prints
 * the message and writes nothing.
 */
export class MoveInputError extends Error {
  override name = "MoveInputError"
}
