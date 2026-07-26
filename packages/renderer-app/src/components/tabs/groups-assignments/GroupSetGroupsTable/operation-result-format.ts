import type { OperationResult } from "./use-repo-operations.js"

export function formatOperationResult(result: OperationResult): string {
  const time = new Date(result.result.completedAt).toLocaleTimeString()
  if (result.operation === "update") {
    const { prsCreated, prsSkipped, prsFailed } = result.result
    const prs = `${prsCreated} pull request${prsCreated === 1 ? "" : "s"}`
    return `${prs} created (${prsSkipped} skipped, ${prsFailed} failed) at ${time}.`
  }
  if (result.operation === "create") {
    const { repositoriesCreated, repositoriesAdopted } = result.result
    if (repositoriesAdopted > 0) {
      return `${repositoriesCreated} created, ${repositoriesAdopted} adopted at ${time}.`
    }
    const noun = `repositor${repositoriesCreated === 1 ? "y" : "ies"}`
    return `${repositoriesCreated} ${noun} created at ${time}.`
  }
  const count = result.result.repositoriesCloned
  const noun = `repositor${count === 1 ? "y" : "ies"}`
  return `${count} ${noun} cloned at ${time}.`
}
