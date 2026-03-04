import type {
  FileFormat,
  ThemePreference,
  WindowChromeMode,
} from "@repo-edu/domain";

export const packageId = "@repo-edu/renderer-host-contract";

export type RendererOpenUserFileRef = {
  kind: "user-file-ref";
  referenceId: string;
  displayName: string;
  mediaType: string | null;
  byteLength: number | null;
};

export type RendererSaveTargetRef = {
  kind: "user-save-target-ref";
  referenceId: string;
  displayName: string;
  suggestedFormat: FileFormat | null;
};

export type OpenUserFileDialogOptions = {
  title?: string;
  acceptFormats?: readonly FileFormat[];
};

export type SaveUserFileDialogOptions = {
  title?: string;
  suggestedName?: string;
  defaultFormat?: FileFormat;
};

export type RendererEnvironmentSnapshot = {
  shell: "browser-mock" | "electron-renderer";
  theme: ThemePreference;
  windowChrome: WindowChromeMode;
  canPromptForFiles: boolean;
  lastOpenedExternalUrl: string | null;
};

export type RendererHost = {
  pickUserFile(
    options?: OpenUserFileDialogOptions,
  ): Promise<RendererOpenUserFileRef | null>;
  pickSaveTarget(
    options?: SaveUserFileDialogOptions,
  ): Promise<RendererSaveTargetRef | null>;
  openExternalUrl(url: string): Promise<void>;
  getEnvironmentSnapshot(): Promise<RendererEnvironmentSnapshot>;
};
