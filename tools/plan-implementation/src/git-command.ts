import { execFile } from "node:child_process"

const gitOutputLimit = 16 * 1024 * 1024

export type GitCommandOutput = {
  readonly stdout: Buffer
  readonly stderr: Buffer
}

export function runGit(
  cwd: string,
  arguments_: readonly string[],
): Promise<GitCommandOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["--literal-pathspecs", ...arguments_],
      {
        cwd,
        encoding: null,
        maxBuffer: gitOutputLimit,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
}

export async function readGitText(
  cwd: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await runGit(cwd, arguments_)
  return stdout.toString("utf8").replace(/\r?\n$/, "")
}
