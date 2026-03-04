import type {
  UserFileExportPreviewResult,
  UserFileInspectResult,
  UserFileRef,
  UserSaveTargetRef,
} from "@repo-edu/application-contract";
import type {
  RendererEnvironmentSnapshot,
  RendererHost,
} from "@repo-edu/renderer-host-contract";
import { packageId as uiPackageId } from "@repo-edu/ui";

export const packageId = "@repo-edu/app";
export const workspaceDependencies = [
  uiPackageId,
  "@repo-edu/domain",
  "@repo-edu/application-contract",
  "@repo-edu/renderer-host-contract",
] as const;

const contractPackageId = "@repo-edu/application-contract";
const rendererHostContractPackageId = "@repo-edu/renderer-host-contract";

export type SmokeWorkflowResult = {
  workflowId: string;
  message: string;
  packageLine: string;
  executedAt: string;
  adapterPackageId?: string;
};

type SmokeWorkflowRunner = () => Promise<SmokeWorkflowResult>;
type InspectUserFileRunner = (
  file: UserFileRef,
) => Promise<UserFileInspectResult>;
type ExportPreviewRunner = (
  target: UserSaveTargetRef,
) => Promise<UserFileExportPreviewResult>;

type MountSmokeAppOptions = {
  target: HTMLElement;
  runSmokeWorkflow: SmokeWorkflowRunner;
  inspectUserFile: InspectUserFileRunner;
  exportPreviewFile: ExportPreviewRunner;
  rendererHost: RendererHost;
  shellPackageId: string;
  browserSafePackages: readonly string[];
  providerSummary: string;
  workflowCount: number;
  settingsKind: string;
};

type AppState = {
  status: string;
  smokeResult: SmokeWorkflowResult | null;
  fileSummary: UserFileInspectResult | null;
  exportSummary: UserFileExportPreviewResult | null;
  hostSnapshot: RendererEnvironmentSnapshot | null;
  error: string | null;
};

export async function mountSmokeApp({
  target,
  runSmokeWorkflow,
  inspectUserFile,
  exportPreviewFile,
  rendererHost,
  shellPackageId,
  browserSafePackages,
  providerSummary,
  workflowCount,
  settingsKind,
}: MountSmokeAppOptions) {
  const state: AppState = {
    status: "Bootstrapping Phase 2 browser-safe workflow harness...",
    smokeResult: null,
    fileSummary: null,
    exportSummary: null,
    hostSnapshot: null,
    error: null,
  };

  const setState = (next: Partial<AppState>) => {
    Object.assign(state, next);
    render();
  };

  const onInspectClick = async () => {
    try {
      setState({
        error: null,
        status: "Selecting a browser-safe user file...",
      });
      const file = await rendererHost.pickUserFile({
        acceptFormats: ["csv", "json"],
      });

      if (!file) {
        setState({ status: "File selection was cancelled." });
        return;
      }

      setState({
        status: `Inspecting ${file.displayName} through UserFilePort...`,
      });
      const result = await inspectUserFile(file);
      setState({
        fileSummary: result,
        status: `Inspected ${result.displayName}.`,
      });
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : String(error),
        status: "User-file inspection failed.",
      });
    }
  };

  const onExportClick = async () => {
    try {
      setState({
        error: null,
        status: "Picking an opaque save target...",
      });
      const targetRef = await rendererHost.pickSaveTarget({
        suggestedName: "repo-edu-phase-2-preview.csv",
        defaultFormat: "csv",
      });

      if (!targetRef) {
        setState({ status: "Save target selection was cancelled." });
        return;
      }

      setState({
        status: `Writing export preview to ${targetRef.displayName}...`,
      });
      const result = await exportPreviewFile(targetRef);
      setState({
        exportSummary: result,
        status: `Export preview written to ${result.displayName}.`,
      });
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : String(error),
        status: "Export preview failed.",
      });
    }
  };

  const onOpenDocsClick = async () => {
    await rendererHost.openExternalUrl("https://repo-edu.github.io/repo-edu/");
    setState({
      hostSnapshot: await rendererHost.getEnvironmentSnapshot(),
      status: "Renderer host handled the external-open capability.",
    });
  };

  const render = () => {
    const hostSummary = state.hostSnapshot
      ? `${state.hostSnapshot.shell} | theme ${state.hostSnapshot.theme} | chrome ${state.hostSnapshot.windowChrome}`
      : "Loading host snapshot...";

    target.innerHTML = `
    <section
      style="
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 32px;
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 40%),
          linear-gradient(145deg, #082f49, #0f172a 48%, #172554);
        color: #e2e8f0;
        font-family: 'Iowan Old Style', 'Palatino Linotype', serif;
      "
    >
      <article
        style="
          width: min(720px, 100%);
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.82);
          box-shadow: 0 32px 80px rgba(2, 6, 23, 0.45);
          padding: 32px;
        "
      >
        <p style="margin: 0; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #7dd3fc;">
          Phase 2 Browser-Safe Foundation Harness
        </p>
        <h1 style="margin: 12px 0 0; font-size: clamp(32px, 7vw, 56px); line-height: 1.05;">
          Shared contracts are driving the docs shell.
        </h1>
        <p style="margin: 16px 0 0; font-size: 16px; line-height: 1.7; color: #cbd5e1;">
          The docs shell mounts <strong>${packageId}</strong>, imports the
          browser-safe shared packages, and crosses the file boundary only with
          opaque refs.
        </p>
        <dl
          style="
            margin: 28px 0 0;
            display: grid;
            gap: 12px;
            grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
            font-size: 14px;
          "
        >
          <dt style="color: #93c5fd;">Docs shell</dt>
          <dd style="margin: 0;">${shellPackageId}</dd>
          <dt style="color: #93c5fd;">Contracts</dt>
          <dd style="margin: 0;">${contractPackageId} + ${rendererHostContractPackageId}</dd>
          <dt style="color: #93c5fd;">Domain file kind</dt>
          <dd style="margin: 0;">${settingsKind}</dd>
          <dt style="color: #93c5fd;">Workflow count</dt>
          <dd style="margin: 0;">${workflowCount}</dd>
          <dt style="color: #93c5fd;">UI package</dt>
          <dd style="margin: 0;">${uiPackageId}</dd>
          <dt style="color: #93c5fd;">Renderer host</dt>
          <dd style="margin: 0;">${hostSummary}</dd>
          <dt style="color: #93c5fd;">Provider guardrail</dt>
          <dd style="margin: 0;">${providerSummary}</dd>
          <dt style="color: #93c5fd;">Status</dt>
          <dd id="repo-edu-smoke-status" style="margin: 0;">${state.status}</dd>
        </dl>
        <div style="margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button
            id="repo-edu-open-file"
            type="button"
            style="border: 0; border-radius: 999px; padding: 12px 18px; font: inherit; background: #38bdf8; color: #082f49; cursor: pointer;"
          >
            Inspect Demo File
          </button>
          <button
            id="repo-edu-save-file"
            type="button"
            style="border: 1px solid rgba(125, 211, 252, 0.4); border-radius: 999px; padding: 12px 18px; font: inherit; background: transparent; color: #e0f2fe; cursor: pointer;"
          >
            Write Export Preview
          </button>
          <button
            id="repo-edu-open-docs"
            type="button"
            style="border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 999px; padding: 12px 18px; font: inherit; background: rgba(15, 23, 42, 0.45); color: #e2e8f0; cursor: pointer;"
          >
            Open Docs URL
          </button>
        </div>
        <pre
          id="repo-edu-smoke-result"
          style="
            margin: 24px 0 0;
            padding: 18px;
            border-radius: 18px;
            overflow-x: auto;
            background: rgba(8, 47, 73, 0.7);
            color: #bae6fd;
            font-family: 'SFMono-Regular', 'Menlo', monospace;
            font-size: 13px;
            line-height: 1.6;
          "
        >${JSON.stringify(
          {
            smoke: state.smokeResult,
            file: state.fileSummary,
            export: state.exportSummary,
            browserSafePackages,
            error: state.error,
          },
          null,
          2,
        )}</pre>
      </article>
    </section>
  `;

    target
      .querySelector<HTMLButtonElement>("#repo-edu-open-file")
      ?.addEventListener("click", () => {
        void onInspectClick();
      });
    target
      .querySelector<HTMLButtonElement>("#repo-edu-save-file")
      ?.addEventListener("click", () => {
        void onExportClick();
      });
    target
      .querySelector<HTMLButtonElement>("#repo-edu-open-docs")
      ?.addEventListener("click", () => {
        void onOpenDocsClick();
      });
  };

  render();

  try {
    const [hostSnapshot, smokeResult] = await Promise.all([
      rendererHost.getEnvironmentSnapshot(),
      runSmokeWorkflow(),
    ]);

    setState({
      hostSnapshot,
      smokeResult,
      status: "Shared workflows completed in a browser-safe path.",
    });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : String(error),
      status: "Shared workflow bootstrap failed.",
    });
  }
}
