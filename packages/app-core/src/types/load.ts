export type LoadResult = {
  ok: boolean
  warnings: string[]
  error: string | null
}

export const okResult = (warnings: string[] = []): LoadResult => ({
  ok: true,
  warnings,
  error: null,
})

export const errorResult = (error: string): LoadResult => ({
  ok: false,
  warnings: [],
  error,
})
