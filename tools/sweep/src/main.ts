import { Command } from "commander"

import {
  findNextCandidate,
  markDone,
  readQueue,
  recordFlag,
  recordOk,
} from "./sweep.js"

function buildProgram(): Command {
  const program = new Command()
    .name("sweep")
    .description(
      "File-growth sweep over repo-edu source files. Surfaces the biggest " +
        "file not yet judged at its current content; records ok verdicts in a " +
        "gitignored local skip cache and flag verdicts in a gitignored local " +
        "refactor backlog beside the tool.",
    )

  program
    .command("next", { isDefault: true })
    .description("Print the biggest source file not yet judged at its content.")
    .action(() => {
      const candidate = findNextCandidate()
      if (!candidate) {
        console.log(
          "clean: every source file is judged at its current content.",
        )
        return
      }
      console.log(`${candidate.path}\t${candidate.lines}`)
    })

  program
    .command("ok")
    .argument(
      "<path>",
      "Repo-relative path of the file judged not worth splitting.",
    )
    .description("Record an ok verdict for the file at its current content.")
    .action((filePath: string) => {
      const entry = recordOk(filePath)
      console.log(`ok ${entry.path} @ ${entry.hash}`)
    })

  program
    .command("flag")
    .argument("<path>", "Repo-relative path of the file to refactor.")
    .requiredOption(
      "-r, --reason <reason>",
      "Why the file should be refactored.",
    )
    .description("Flag the file for refactor at its current content.")
    .action((filePath: string, options: { reason: string }) => {
      const entry = recordFlag(filePath, options.reason)
      console.log(`flagged ${entry.path} @ ${entry.hash}: ${entry.reason}`)
    })

  program
    .command("queue")
    .description("Print the refactor backlog, biggest first, with reasons.")
    .action(() => {
      const items = readQueue()
      if (items.length === 0) {
        console.log("queue: empty.")
        return
      }
      for (const item of items) {
        console.log(`${item.path}\t${item.lines}\t${item.reason}`)
      }
    })

  program
    .command("done")
    .argument("<path>", "Repo-relative path to drop from the backlog.")
    .description("Drop a path from the refactor backlog.")
    .action((filePath: string) => {
      const dropped = markDone(filePath)
      console.log(
        dropped > 0
          ? `done: dropped ${dropped} backlog ${dropped === 1 ? "entry" : "entries"} for ${filePath}.`
          : `done: no backlog entry for ${filePath}.`,
      )
    })

  return program
}

try {
  buildProgram().parse()
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
