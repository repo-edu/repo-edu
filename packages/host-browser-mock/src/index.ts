import type { FileFormat } from "@repo-edu/domain";
import type {
  UserFilePort,
  UserFileReadRef,
  UserFileText,
  UserFileWriteReceipt,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract";

export const packageId = "@repo-edu/host-browser-mock";
export const workspaceDependencies = [
  "@repo-edu/domain",
  "@repo-edu/host-runtime-contract",
  "@repo-edu/integrations-lms-contract",
  "@repo-edu/integrations-git-contract",
] as const;

type MockReadableFile = {
  referenceId: string;
  displayName: string;
  mediaType: string | null;
  text: string;
};

type MockWritableFile = {
  displayName: string;
  mediaType: string | null;
  text: string;
  savedAt: string;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.");
  }
}

function inferMediaType(format: FileFormat | null): string | null {
  switch (format) {
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "yaml":
      return "application/yaml";
    default:
      return "text/plain";
  }
}

function byteLengthFor(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

export function createBrowserMockHostEnvironment() {
  let selectionCounter = 0;
  let lastOpenedExternalUrl: string | null = null;

  const readableFiles = new Map<string, MockReadableFile>([
    [
      "seed-students",
      {
        referenceId: "seed-students",
        displayName: "students.csv",
        mediaType: "text/csv",
        text: [
          "student_id,display_name,git_username",
          "s-1001,Ada Lovelace,adal",
          "s-1002,Grace Hopper,ghopper",
        ].join("\n"),
      },
    ],
    [
      "seed-groups",
      {
        referenceId: "seed-groups",
        displayName: "groups.json",
        mediaType: "application/json",
        text: JSON.stringify(
          {
            groups: [
              { name: "group-1", members: ["s-1001"] },
              { name: "group-2", members: ["s-1002"] },
            ],
          },
          null,
          2,
        ),
      },
    ],
  ]);

  const writableFiles = new Map<string, MockWritableFile>();

  const userFilePort: UserFilePort = {
    async readText(
      reference: UserFileReadRef,
      signal?: AbortSignal,
    ): Promise<UserFileText> {
      throwIfAborted(signal);
      const file = readableFiles.get(reference.referenceId);

      if (!file) {
        throw new Error(`User file not found: ${reference.displayName}`);
      }

      return {
        displayName: file.displayName,
        mediaType: file.mediaType,
        text: file.text,
        byteLength: byteLengthFor(file.text),
      };
    },

    async writeText(
      reference: UserSaveTargetWriteRef,
      text: string,
      signal?: AbortSignal,
    ): Promise<UserFileWriteReceipt> {
      throwIfAborted(signal);
      const savedAt = new Date().toISOString();
      const mediaType = inferMediaType(reference.suggestedFormat);

      writableFiles.set(reference.referenceId, {
        displayName: reference.displayName,
        mediaType,
        text,
        savedAt,
      });

      return {
        displayName: reference.displayName,
        mediaType,
        byteLength: byteLengthFor(text),
        savedAt,
      };
    },
  };

  return {
    rendererHost: {
      async pickUserFile(options?: { acceptFormats?: readonly FileFormat[] }) {
        const nextFile = [...readableFiles.values()].find((file) => {
          if (!options?.acceptFormats || options.acceptFormats.length === 0) {
            return true;
          }

          return options.acceptFormats.some((format) =>
            file.displayName.endsWith(`.${format}`),
          );
        });

        if (!nextFile) {
          return null;
        }

        return {
          kind: "user-file-ref" as const,
          referenceId: nextFile.referenceId,
          displayName: nextFile.displayName,
          mediaType: nextFile.mediaType,
          byteLength: byteLengthFor(nextFile.text),
        };
      },

      async pickSaveTarget(options?: {
        suggestedName?: string;
        defaultFormat?: FileFormat;
      }) {
        selectionCounter += 1;

        const format = options?.defaultFormat ?? "csv";
        const displayName =
          options?.suggestedName ??
          `repo-edu-export-${selectionCounter}.${format}`;

        return {
          kind: "user-save-target-ref" as const,
          referenceId: `save-target-${selectionCounter}`,
          displayName,
          suggestedFormat: format,
        };
      },

      async openExternalUrl(url: string) {
        lastOpenedExternalUrl = url;
      },

      async getEnvironmentSnapshot() {
        return {
          shell: "browser-mock" as const,
          theme: "light" as const,
          windowChrome: "system" as const,
          canPromptForFiles: true,
          lastOpenedExternalUrl,
        };
      },
    },
    userFilePort,
    listSavedDocuments() {
      return [...writableFiles.entries()].map(([referenceId, file]) => ({
        referenceId,
        ...file,
      }));
    },
  };
}
