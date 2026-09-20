import { readFile, writeFile } from "node:fs/promises"
import { stampCommitMessage } from "./commit-msg.js"
import { type Repository, SubjectError } from "./subject.js"

/**
 * The commit-msg hook of both repositories: `<repository> <message file>`.
 * A refusal names the subject grammar, so whoever meets one lands on the
 * document that owns the shape.
 */
const [repository, file] = process.argv.slice(2)
if (
  (repository !== "repo-edu" && repository !== "plan") ||
  file === undefined
) {
  process.stderr.write(
    "commit-msg: usage: commit-msg-main.ts <repo-edu|plan> <message file>\n",
  )
  process.exit(2)
}
try {
  const stamped = stampCommitMessage(
    await readFile(file, "utf8"),
    repository as Repository,
    {
      auditor: process.env.COMMIT_AUDITOR || null,
      phases: process.env.COMMIT_PHASES || null,
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
