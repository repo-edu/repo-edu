export function createWriteQueue() {
  let chain: Promise<void> = Promise.resolve()

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
