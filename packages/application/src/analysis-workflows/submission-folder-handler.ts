import type {
  AnalysisFolderFile,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { SUBMISSION_MAIN_FILE_MAX_BYTES } from "@repo-edu/application-contract"
import {
  DEFAULT_EXTENSIONS,
  normalizeExtension,
} from "@repo-edu/domain/analysis"
import { createValidationAppError } from "../core.js"
import { isAbsolutePath } from "../path-utils.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { AnalysisWorkflowPorts } from "./ports.js"

const MAX_LISTED_SUBMISSION_FILES = 1000

function normalizeExtensionFilter(extensions: readonly string[]): string[] {
  const normalized = [
    ...new Set(
      extensions
        .map((extension) => normalizeExtension(extension))
        .filter((extension) => extension.length > 0),
    ),
  ]
  return normalized.length === 0 ? [...DEFAULT_EXTENSIONS] : normalized
}

function validateAbsoluteFolderPath(folderPath: string): string {
  const normalized = folderPath.trim()
  if (normalized.length === 0 || !isAbsolutePath(normalized)) {
    throw createValidationAppError("Submission folder path is invalid.", [
      {
        path: "folderPath",
        message: "Folder path must be an absolute path.",
      },
    ])
  }
  return normalized
}

async function assertExistingDirectory(
  ports: AnalysisWorkflowPorts,
  folderPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const status = await ports.fileSystem.stat({ path: folderPath, signal })
  if (status.kind !== "directory") {
    throw createValidationAppError("Submission folder path is invalid.", [
      {
        path: "folderPath",
        message: "Folder path must point to an existing directory.",
      },
    ])
  }
}

function normalizeRelativeFilePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/")
  const parts = normalized.split("/")
  const hasInvalidSegment = parts.some(
    (part) => part.length === 0 || part === "." || part === "..",
  )
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.startsWith("//") ||
    hasInvalidSegment
  ) {
    throw createValidationAppError("Submission file path is invalid.", [
      {
        path: "relativePath",
        message: "File path must stay inside the submission folder.",
      },
    ])
  }
  return normalized
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function createSubmissionFolderHandlers(
  ports: AnalysisWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"analysis.listFolderFiles" | "analysis.readFolderFile">,
  "analysis.listFolderFiles" | "analysis.readFolderFile"
> {
  return {
    "analysis.listFolderFiles": async (input, options) => {
      const typedOptions = options as
        | WorkflowCallOptions<never, never>
        | undefined
      const signal = typedOptions?.signal
      const folderPath = validateAbsoluteFolderPath(input.folderPath)
      throwIfAborted(signal)
      await assertExistingDirectory(ports, folderPath, signal)
      const extensions = normalizeExtensionFilter(input.extensions)
      const files = await ports.fileSystem.listFiles({
        rootPath: folderPath,
        extensions,
        signal,
      })
      throwIfAborted(signal)
      if (files.length > MAX_LISTED_SUBMISSION_FILES) {
        throw createValidationAppError(
          "Submission folder has too many files.",
          [
            {
              path: "folderPath",
              message: `Folder contains more than ${MAX_LISTED_SUBMISSION_FILES} matching files.`,
            },
          ],
        )
      }
      const resultFiles: AnalysisFolderFile[] = [...files].toSorted(
        (left, right) => left.relativePath.localeCompare(right.relativePath),
      )
      return { files: resultFiles }
    },
    "analysis.readFolderFile": async (input, options) => {
      const typedOptions = options as
        | WorkflowCallOptions<never, never>
        | undefined
      const signal = typedOptions?.signal
      const folderPath = validateAbsoluteFolderPath(input.folderPath)
      const relativePath = normalizeRelativeFilePath(input.relativePath)
      throwIfAborted(signal)
      await assertExistingDirectory(ports, folderPath, signal)
      const result = await ports.fileSystem.readFileInsideRoot({
        rootPath: folderPath,
        relativePath,
        maxBytes: SUBMISSION_MAIN_FILE_MAX_BYTES,
        signal,
      })
      throwIfAborted(signal)
      return {
        relativePath: result.relativePath,
        mediaType: null,
        byteLength: result.bytes.byteLength,
        base64: bytesToBase64(result.bytes),
      }
    },
  }
}
