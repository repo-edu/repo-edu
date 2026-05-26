import { parseArgs } from "./cli"
import {
  handleEvaluate,
  handleInit,
  handlePlan,
  handleProject,
  handleRepo,
} from "./fixture-commands"
import { scaffoldFixturesDir } from "./fixture-shared"
import { handleSweep } from "./fixture-sweep"

export async function runFixtureSubcommand(argv: string[]): Promise<void> {
  const opts = parseArgs(argv)
  if (opts.subcommand === "init") {
    handleInit(opts)
    return
  }
  scaffoldFixturesDir()
  const runStart = Date.now()
  switch (opts.subcommand) {
    case "project":
      await handleProject(opts, runStart)
      break
    case "plan":
      await handlePlan(opts, runStart)
      break
    case "repo":
      await handleRepo(opts, runStart)
      break
    case "sweep":
      await handleSweep(opts, runStart)
      break
    case "evaluate":
      await handleEvaluate(opts, runStart)
      break
  }
}
