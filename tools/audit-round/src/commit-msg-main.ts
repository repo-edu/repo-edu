import { readFile, writeFile } from "node:fs/promises"
import { text } from "node:stream/consumers"
import areaModel from "../../architecture-check/src/area-model.json" with {
  type: "json",
}
import { stampCommitMessage } from "./commit-msg.js"
import { type Repository, SubjectError } from "./subject.js"

/**
 * The commit-msg hook of both repositories: `<repository> <message file>`,
 * with the paths the commit changes in that repository on standard input,
 * each ended by a NUL byte as `git diff --cached --name-only --no-renames -z`
 * writes them. A refusal names the subject grammar, so whoever meets one
 * lands on the document that owns the shape.
 */
const [repository, file] = process.argv.slice(2)
if (
  (repository !== "repo-edu" && repository !== "plan") ||
  file === undefined
) {
  process.stderr.write(
    "commit-msg: usage: commit-msg-main.ts <repo-edu|plan> <message file> < <NUL-separated changed paths>\n",
  )
  process.exit(2)
}
try {
  const openContestValue = process.env.COMMIT_OPEN_CONTESTS ?? ""
  if (
    openContestValue.length > 0 &&
    !/^[1-9]\d*(?:,[1-9]\d*)*$/.test(openContestValue)
  )
    throw new SubjectError(
      "COMMIT_OPEN_CONTESTS must be a comma-separated list of positive finding numbers",
    )
  const stamped = stampCommitMessage(
    await readFile(file, "utf8"),
    repository as Repository,
    {
      auditor: process.env.COMMIT_AUDITOR || null,
      phases: process.env.COMMIT_PHASES || null,
    },
    new Map(areaModel.areas.map((area) => [area.id, area.kind])),
    {
      openContests:
        openContestValue.length === 0
          ? []
          : openContestValue.split(",").map(Number),
      changedPaths: (await text(process.stdin))
        .split("\0")
        .filter((path) => path.length > 0),
    },
  )
  await writeFile(file, stamped)
} catch (error) {
  if (error instanceof SubjectError) {
    process.stderr.write(
      `commit-msg: ${error.message}\ncommit-msg: commit body rules are in CLAUDE.md; the subject grammar is .agents/references/subject-grammar.md in the Repo Edu checkout\n`,
    )
    process.exit(1)
  }
  throw error
}
