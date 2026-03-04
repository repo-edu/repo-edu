import { packageId as uiPackageId } from "@repo-edu/ui";

export const packageId = "@repo-edu/app";
export const workspaceDependencies = [uiPackageId] as const;

type SmokeWorkflowResult = {
  workflowId: string
  message: string
  packageLine: string
  executedAt: string
  adapterPackageId: string
}

type SmokeWorkflowRunner = () => Promise<SmokeWorkflowResult>

type MountSmokeAppOptions = {
  target: HTMLElement
  runSmokeWorkflow: SmokeWorkflowRunner
  shellPackageId: string
}

export async function mountSmokeApp({
  target,
  runSmokeWorkflow,
  shellPackageId,
}: MountSmokeAppOptions) {
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
          Phase 1 Docs Smoke Harness
        </p>
        <h1 style="margin: 12px 0 0; font-size: clamp(32px, 7vw, 56px); line-height: 1.05;">
          Browser-safe app mount is live.
        </h1>
        <p style="margin: 16px 0 0; font-size: 16px; line-height: 1.7; color: #cbd5e1;">
          The docs shell mounts <strong>${packageId}</strong> and runs a shared workflow through browser-safe mocks.
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
          <dt style="color: #93c5fd;">UI package</dt>
          <dd style="margin: 0;">${uiPackageId}</dd>
          <dt style="color: #93c5fd;">Status</dt>
          <dd id="repo-edu-smoke-status" style="margin: 0;">Running shared workflow...</dd>
        </dl>
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
        ></pre>
      </article>
    </section>
  `;

  const statusNode = target.querySelector<HTMLElement>("#repo-edu-smoke-status");
  const resultNode = target.querySelector<HTMLElement>("#repo-edu-smoke-result");

  if (!statusNode || !resultNode) {
    throw new Error("Smoke harness mount nodes were not created");
  }

  try {
    const result = await runSmokeWorkflow();

    statusNode.textContent = "Shared workflow completed in a browser-safe path.";
    resultNode.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    statusNode.textContent = "Shared workflow failed.";
    resultNode.textContent = String(error);
  }
}
