import { fileURLToPath } from "node:url"

export type CodingHelperCommand = {
  readonly command: string
  readonly arguments: readonly string[]
}

export function createCodingHelperCommand(): CodingHelperCommand {
  return {
    command: process.execPath,
    arguments: [
      "--import",
      "tsx",
      fileURLToPath(new URL("./coding-helper-entry.ts", import.meta.url)),
    ],
  }
}
