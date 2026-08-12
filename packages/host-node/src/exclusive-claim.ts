import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

const sqliteBusyCode = 5

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

export type ExclusiveClaim =
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

export async function claimExclusive(
  databasePath: string,
): Promise<ExclusiveClaim> {
  await mkdir(dirname(databasePath), { recursive: true })
  const connection = await openRuntimeSqlite(databasePath)

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
