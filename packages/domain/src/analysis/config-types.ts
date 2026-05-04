// ---------------------------------------------------------------------------
// Analysis config types — extracted as a dependency leaf so both
// `analysis/types.ts` and the top-level `types.ts` can import without cycles.
// ---------------------------------------------------------------------------

export type AnalysisConfig = {
  since?: string
  until?: string
  subfolder?: string
  extensions?: string[]
  includeFiles?: string[]
  excludeFiles?: string[]
  excludeAuthors?: string[]
  excludeEmails?: string[]
  excludeRevisions?: string[]
  excludeMessages?: string[]
  nFiles?: number
  whitespace?: boolean
  maxConcurrency?: number
  blameSkip?: boolean
}

export type AnalysisBlameConfig = {
  subfolder?: string
  extensions?: string[]
  includeFiles?: string[]
  excludeFiles?: string[]
  excludeAuthors?: string[]
  excludeEmails?: string[]
  whitespace?: boolean
  maxConcurrency?: number
  copyMove?: number
}
