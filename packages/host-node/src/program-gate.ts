import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const sqliteBusyCode = 5

export const programConflictMessage = "Another Repo Edu program is running"
export const programGateArtifactProbeEnvironmentVariable =
  "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE"
export const programGateArtifactProbeMarker = "repo-edu-program-gate-artifact"

type SqliteConnection = {
  exec(sql: string): void
  close(): void
}

type BunSqliteModule = {
  Database: new (
    filename: string,
    options?: { create?: boolean; strict?: boolean },
  ) => SqliteConnection
}

export type ProgramGateClaim =
  | { readonly status: "busy" }
  | {
      readonly status: "held"
      readonly release: () => void
    }

function numericErrorProperty(
  error: object,
  property: "errcode" | "errno",
): number | undefined {
  if (!(property in error)) {
    return undefined
  }
  const value = (error as Record<string, unknown>)[property]
  return typeof value === "number" ? value : undefined
}

function isSqliteBusy(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  if ("code" in error && error.code === "SQLITE_BUSY") {
    return true
  }
  const errcode = numericErrorProperty(error, "errcode")
  const errno = numericErrorProperty(error, "errno")
  return (
    (errcode !== undefined && (errcode & 0xff) === sqliteBusyCode) ||
    (errno !== undefined && (errno & 0xff) === sqliteBusyCode)
  )
}

async function openRuntimeSqlite(
  databasePath: string,
): Promise<SqliteConnection> {
  if (typeof process.versions.bun === "string") {
    const bunSqliteSpecifier = "bun:sqlite"
    const { Database } = (await import(bunSqliteSpecifier)) as BunSqliteModule
    return new Database(databasePath, { create: true, strict: true })
  }

  const { DatabaseSync } = await import("node:sqlite")
  return new DatabaseSync(databasePath, { timeout: 0 })
}

export async function claimProgramGate(
  appDataRoot: string,
): Promise<ProgramGateClaim> {
  await mkdir(appDataRoot, { recursive: true })
  const connection = await openRuntimeSqlite(
    join(appDataRoot, "program-gate.db"),
  )

  try {
    connection.exec("PRAGMA busy_timeout = 0")
    connection.exec("BEGIN EXCLUSIVE")
  } catch (error) {
    connection.close()
    if (isSqliteBusy(error)) {
      return { status: "busy" }
    }
    throw error
  }

  let released = false
  return {
    status: "held",
    release() {
      if (released) {
        return
      }
      released = true
      connection.close()
    },
  }
}

export function isProgramGateArtifactProbe(): boolean {
  return (
    process.env[programGateArtifactProbeEnvironmentVariable]?.trim() === "1"
  )
}

export function writeProgramGateArtifactProbeMarker(
  state: ProgramGateClaim["status"],
): void {
  process.stdout.write(
    `${JSON.stringify({ marker: programGateArtifactProbeMarker, state })}\n`,
  )
}

export async function waitForProgramGateArtifactProbeRelease(): Promise<void> {
  process.stdin.resume()
  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve)
    process.stdin.once("data", resolve)
  })
}
