import assert from "node:assert/strict"
import type { AppError } from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"

export function createMockCourse(
  overrides: Partial<PersistedCourse> = {},
): PersistedCourse {
  return {
    id: "course-1",
    name: "Test Course",
    repositoryCloneTargetDirectory: "/tmp/repos",
    repositoryCloneDirectoryLayout: "flat",
    ...overrides,
  } as PersistedCourse
}

export function createMockGitCommandPort(
  responses: Record<
    string,
    { exitCode: number; stdout: string; stderr: string }
  >,
): GitCommandPort {
  return {
    cancellation: "cooperative",
    async run(request) {
      if (request.signal?.aborted) {
        throw Object.assign(new DOMException("Aborted", "AbortError"))
      }

      const key = request.args.join(" ")

      // Match by prefix for flexibility.
      for (const [pattern, response] of Object.entries(responses)) {
        if (key.startsWith(pattern) || key.includes(pattern)) {
          return { ...response, signal: null }
        }
      }

      return { exitCode: 0, stdout: "", stderr: "", signal: null }
    },
  }
}

export const stubFileSystem: FileSystemPort = {
  userHomeSystemDirectories: [],
  async inspect(request) {
    return request.paths.map((path) => ({
      path,
      kind: "missing" as const,
    }))
  },
  async stat() {
    return { kind: "missing", size: null }
  },
  async applyBatch(request) {
    return { completed: request.operations }
  },
  async createTempDirectory() {
    return "/tmp/test"
  },
  async listDirectory() {
    return []
  },
  async listFiles() {
    return []
  },
  async readFileInsideRoot() {
    throw new Error("readFileInsideRoot not implemented in this test")
  },
}

export function emptyPersonDb() {
  return { persons: [], identityIndex: new Map<string, string>() }
}

export async function assertValidationError(
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action()
    assert.fail("Should have thrown validation error")
  } catch (error) {
    assert.ok(isAppError(error))
    assert.equal((error as AppError).type, "validation")
  }
}
