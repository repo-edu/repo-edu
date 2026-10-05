import { randomUUID } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname } from "node:path"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import type { FileFormat } from "@repo-edu/domain/types"
import type {
  UserFilePort,
  UserFileReadRef,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract"
import type {
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
} from "@repo-edu/renderer-host-contract"

type ReadReferenceRecord = {
  path: string
  displayName: string
  mediaType: string | null
}

type WriteReferenceRecord = {
  path: string
  displayName: string
  suggestedFormat: FileFormat | null
}

export function inferFormatFromPath(filePath: string): FileFormat | null {
  const extension = extname(filePath).toLowerCase()

  if (extension === ".csv") {
    return "csv"
  }
  if (extension === ".xlsx") {
    return "xlsx"
  }
  if (extension === ".json") {
    return "json"
  }
  if (extension === ".txt") {
    return "txt"
  }

  return null
}

function mediaTypeForFormat(format: FileFormat | null): string | null {
  switch (format) {
    case "csv":
      return "text/csv"
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "json":
      return "application/json"
    case "txt":
      return "text/plain"
    default:
      return null
  }
}

function byteLengthFor(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/** Refuses bytes that are not UTF-8 and leaves a byte-order mark in the text. */
const utf8Text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

/** Nothing was written, so the failure is a refusal. */
function fileRefusal(message: string): CommandOutcomeError {
  return new CommandOutcomeError({
    disposition: "refused",
    error: { type: "effect", message },
  })
}

/** The files the teacher picked, known to the renderer only by opaque
 * reference, and the port that reads and writes them. */
export type DesktopUserFiles = {
  readonly userFilePort: UserFilePort
  registerReadable(filePath: string): Promise<RendererOpenUserFileRef>
  registerWritable(
    filePath: string,
    suggestedFormat: FileFormat | null,
  ): RendererSaveTargetRef
}

export function createDesktopUserFiles(): DesktopUserFiles {
  const readableReferences = new Map<string, ReadReferenceRecord>()
  const writableReferences = new Map<string, WriteReferenceRecord>()

  const userFilePort: UserFilePort = {
    async readText(reference: UserFileReadRef, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new CommandOutcomeError({ disposition: "stopped", result: null })
      }

      const file = readableReferences.get(reference.referenceId)
      if (!file) {
        throw fileRefusal(
          `Unknown user-file reference: ${reference.referenceId}`,
        )
      }

      const bytes = await readFile(file.path).catch((error: unknown) => {
        throw fileRefusal(
          error instanceof Error ? error.message : String(error),
        )
      })
      // A lenient decoder would put replacement characters where the bytes
      // are not UTF-8, so an import would succeed with altered names.
      let text: string
      try {
        text = utf8Text.decode(bytes)
      } catch {
        throw fileRefusal(
          `${file.displayName} is not UTF-8 text. Save it with UTF-8 encoding and try again.`,
        )
      }

      if (signal?.aborted) {
        throw new CommandOutcomeError({ disposition: "stopped", result: null })
      }

      return {
        displayName: file.displayName,
        mediaType: file.mediaType,
        byteLength: bytes.byteLength,
        text,
      }
    },

    async writeText(
      reference: UserSaveTargetWriteRef,
      text: string,
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        throw new CommandOutcomeError({ disposition: "stopped", result: null })
      }

      const file = writableReferences.get(reference.referenceId)
      if (!file) {
        throw fileRefusal(
          `Unknown save-target reference: ${reference.referenceId}`,
        )
      }

      try {
        await mkdir(dirname(file.path), { recursive: true })
        await writeFile(file.path, text, "utf8")
      } catch (error) {
        // The write call has ended and nothing keeps running, so the failure
        // is known even though the file may hold part of the text.
        const reason = error instanceof Error ? error.message : String(error)
        throw new CommandOutcomeError({
          disposition: "completed",
          completion: {
            status: "failed",
            error: {
              type: "effect",
              message: `Could not write ${file.displayName}; the file may be incomplete. ${reason}`,
            },
            result: null,
          },
        })
      }

      return {
        displayName: file.displayName,
        mediaType: mediaTypeForFormat(
          file.suggestedFormat ?? inferFormatFromPath(file.path),
        ),
        byteLength: byteLengthFor(text),
        savedAt: new Date().toISOString(),
      }
    },
  }

  return {
    userFilePort,

    async registerReadable(filePath) {
      const referenceId = randomUUID()
      const displayName = basename(filePath)
      const mediaType = mediaTypeForFormat(inferFormatFromPath(filePath))

      let byteLength: number | null = null
      try {
        const fileStats = await stat(filePath)
        byteLength = fileStats.size
      } catch {
        byteLength = null
      }

      readableReferences.set(referenceId, {
        path: filePath,
        displayName,
        mediaType,
      })

      return {
        kind: "user-file-ref",
        referenceId,
        displayName,
        mediaType,
        byteLength,
      }
    },

    registerWritable(filePath, suggestedFormat) {
      const referenceId = randomUUID()
      const displayName = basename(filePath)

      writableReferences.set(referenceId, {
        path: filePath,
        displayName,
        suggestedFormat,
      })

      return {
        kind: "user-save-target-ref",
        referenceId,
        displayName,
        suggestedFormat,
      }
    },
  }
}
