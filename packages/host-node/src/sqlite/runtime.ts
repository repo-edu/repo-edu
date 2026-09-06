import type { DatabaseSync } from "node:sqlite"

type BunSqliteConnection = {
  exec(sql: string): void
  close(throwOnError?: boolean): void
}

type BunSqliteModule = {
  Database: new (
    filename: string,
    options?: { create?: boolean; strict?: boolean },
  ) => BunSqliteConnection
}

export type RuntimeSqliteConnection =
  | { runtime: "node"; database: DatabaseSync }
  | { runtime: "bun"; database: BunSqliteConnection }

/** Runtime selection only. Each caller owns transactions and connection release. */
export async function openRuntimeSqlite(
  databasePath: string,
): Promise<RuntimeSqliteConnection> {
  if (typeof process.versions.bun === "string") {
    const bunSqliteSpecifier = "bun:sqlite"
    const { Database } = (await import(bunSqliteSpecifier)) as BunSqliteModule
    return {
      runtime: "bun",
      database: new Database(databasePath, { create: true, strict: true }),
    }
  }

  const { DatabaseSync } = await import("node:sqlite")
  return {
    runtime: "node",
    database: new DatabaseSync(databasePath, { timeout: 0 }),
  }
}
