import { openRuntimeSqlite } from "../sqlite/runtime.js"

type SqlValue = string | number | null
type SqlRow = Record<string, unknown>

/** Private statement seam; runtime adapters own statement release. */
export type CourseConnection = {
  exec(sql: string): void
  get(sql: string, ...values: SqlValue[]): SqlRow | undefined
  all(sql: string, ...values: SqlValue[]): SqlRow[]
  run(sql: string, ...values: SqlValue[]): void
  close(): void
}

export async function openCourseConnection(
  path: string,
): Promise<CourseConnection> {
  const connection = await openRuntimeSqlite(path)
  if (connection.runtime === "bun") {
    const { database } = connection
    function statement<T>(
      sql: string,
      body: (prepared: ReturnType<typeof database.prepare>) => T,
    ): T {
      const prepared = database.prepare(sql)
      try {
        return body(prepared)
      } finally {
        prepared.finalize()
      }
    }
    return {
      exec: (sql) => database.exec(sql),
      get: (sql, ...values) =>
        statement(sql, (prepared) => prepared.get(...values) ?? undefined),
      all: (sql, ...values) =>
        statement(sql, (prepared) => prepared.all(...values)),
      run: (sql, ...values) => {
        statement(sql, (prepared) => prepared.run(...values))
      },
      close: () => database.close(true),
    }
  }
  const { database } = connection
  return {
    exec: (sql) => database.exec(sql),
    get: (sql, ...values) => database.prepare(sql).get(...values),
    all: (sql, ...values) => database.prepare(sql).all(...values),
    run: (sql, ...values) => {
      database.prepare(sql).run(...values)
    },
    close: () => database.close(),
  }
}
