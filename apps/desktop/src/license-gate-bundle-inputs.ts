type OutputChunkModule = {
  readonly renderedLength?: number
}

type OutputChunk = {
  readonly type: "chunk"
  readonly modules?: Record<string, OutputChunkModule>
  readonly moduleIds?: readonly string[]
}

type OutputAsset = {
  readonly type: "asset"
  readonly originalFileNames?: readonly string[]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOutputChunk(value: unknown): value is OutputChunk {
  return isObjectRecord(value) && value.type === "chunk"
}

function isOutputAsset(value: unknown): value is OutputAsset {
  return isObjectRecord(value) && value.type === "asset"
}

function normalizeBundleInputPath(id: string): string | null {
  const queryStart = id.search(/[?#]/)
  const path = queryStart === -1 ? id : id.slice(0, queryStart)
  if (
    path.length === 0 ||
    path.includes("\0") ||
    (!path.startsWith(".") &&
      !path.startsWith("/") &&
      !path.includes("/") &&
      !/^[A-Za-z]:[\\/]/.test(path))
  ) {
    return null
  }
  return path
}

function recordInput(inputs: Set<string>, id: string): void {
  const path = normalizeBundleInputPath(id)
  if (path !== null) {
    inputs.add(path)
  }
}

function chunkModuleEmitsCode(module: OutputChunkModule): boolean {
  return typeof module.renderedLength !== "number" || module.renderedLength > 0
}

function collectChunkInputs(inputs: Set<string>, chunk: OutputChunk): void {
  const moduleEntries = Object.entries(chunk.modules ?? {})
  if (moduleEntries.length === 0) {
    for (const id of chunk.moduleIds ?? []) {
      recordInput(inputs, id)
    }
    return
  }

  for (const [id, module] of moduleEntries) {
    if (chunkModuleEmitsCode(module)) {
      recordInput(inputs, id)
    }
  }
}

function collectAssetInputs(inputs: Set<string>, asset: OutputAsset): void {
  for (const id of asset.originalFileNames ?? []) {
    recordInput(inputs, id)
  }
}

export function collectBundleInputPaths(bundle: unknown): string[] {
  const inputs = new Set<string>()
  if (!isObjectRecord(bundle)) {
    return []
  }

  for (const output of Object.values(bundle)) {
    if (isOutputChunk(output)) {
      collectChunkInputs(inputs, output)
    } else if (isOutputAsset(output)) {
      collectAssetInputs(inputs, output)
    }
  }

  return [...inputs].sort()
}
