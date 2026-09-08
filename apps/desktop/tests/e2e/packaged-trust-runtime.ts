import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { _electron as electron } from "@playwright/test"
import { findPackagedElectronExecutable } from "../../scripts/packaged-electron-executable.mjs"

/** Exercises the packaged runtime with the current gateway fixtures. It does not
 * claim release-bundle or signing validation and never changes the release. */
export async function createPackagedTrustRuntime() {
  const executable = await findPackagedElectronExecutable()
  if (!executable)
    throw new Error(
      "Package the desktop application before running validate:trust.",
    )
  const directory = await mkdtemp(join(tmpdir(), "repo-edu-packaged-trust-"))
  try {
    const source =
      process.platform === "darwin"
        ? resolve(dirname(executable), "../..")
        : dirname(executable)
    const destination = join(directory, basename(source))
    await cp(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (path) =>
        !["app.asar", "app.asar.unpacked"].includes(basename(path)),
    })
    const resources =
      process.platform === "darwin"
        ? join(destination, "Contents", "Resources")
        : join(destination, "resources")
    const appRoot = join(resources, "app")
    await mkdir(appRoot, { recursive: true })
    await writeFile(
      join(appRoot, "package.json"),
      JSON.stringify({
        name: "repo-edu-trust-fixture",
        version: "1.0.0",
        main: "main.cjs",
      }),
    )
    await writeFile(
      join(appRoot, "main.cjs"),
      "require(process.env.REPO_EDU_TRUST_FIXTURE)\n",
    )
    return {
      documentPath(name: string) {
        return join(appRoot, name)
      },
      launch(fixture: string, args: string[]) {
        return electron.launch({
          executablePath: join(destination, relative(source, executable)),
          args,
          env: { ...process.env, REPO_EDU_TRUST_FIXTURE: fixture } as Record<
            string,
            string
          >,
        })
      },
      dispose: () => rm(directory, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
