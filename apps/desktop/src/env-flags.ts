/**
 * Launch-scoped env flags consulted by both the main process composition
 * root and the tRPC router. Kept in one module to avoid drift between
 * parallel parsers of the same variable.
 */
export function envDisableCache(): boolean {
  const raw = process.env.REPO_EDU_DISABLE_CACHE?.trim()
  return raw === "1" || raw === "true"
}
