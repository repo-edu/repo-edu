import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const trpcMarker = "repo-edu-desktop-trpc";

const child = spawn("pnpm", ["exec", "electron", "./out/main/main.js"], {
  cwd: desktopDir,
  env: {
    ...process.env,
    REPO_EDU_DESKTOP_VALIDATE_TRPC: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let marker;
let stderr = "";
const timeout = setTimeout(() => {
  child.kill("SIGTERM");
}, 15000);

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (chunk) => {
  for (const line of chunk.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);

      if (parsed.marker === trpcMarker) {
        marker = parsed;
      }
    } catch {
      // Ignore unrelated stdout from Electron startup.
    }
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const [exitCode] = await once(child, "exit");

clearTimeout(timeout);

if (exitCode !== 0) {
  throw new Error(`Electron exited with code ${exitCode}\n${stderr}`.trim());
}

if (!marker) {
  throw new Error(`electron-trpc marker was not emitted.\n${stderr}`.trim());
}

if (marker.validationProfileId !== "seed-profile") {
  throw new Error(
    `unexpected validation profile id: ${String(marker.validationProfileId)}`,
  );
}

if (marker.environmentShell !== "electron-renderer") {
  throw new Error(
    `unexpected environmentShell: ${String(marker.environmentShell)}`,
  );
}

if (marker.environmentCanPromptForFiles !== true) {
  throw new Error(
    `unexpected environmentCanPromptForFiles: ${String(marker.environmentCanPromptForFiles)}`,
  );
}

if (marker.environmentWindowChrome !== "hiddenInset") {
  throw new Error(
    `unexpected environmentWindowChrome: ${String(marker.environmentWindowChrome)}`,
  );
}

if (!Array.isArray(marker.listedProfileIds)) {
  throw new Error("listedProfileIds was not an array.");
}

if (typeof marker.profileCount !== "number" || marker.profileCount < 1) {
  throw new Error("profileCount was not a positive number.");
}

if (!marker.listedProfileIds.includes("seed-profile")) {
  throw new Error("seed-profile was not listed by profile.list.");
}

if (marker.loadedProfileId !== "seed-profile") {
  throw new Error(
    `unexpected loadedProfileId: ${String(marker.loadedProfileId)}`,
  );
}

if (marker.savedProfileId !== "seed-profile") {
  throw new Error(
    `unexpected savedProfileId: ${String(marker.savedProfileId)}`,
  );
}

if (typeof marker.savedProfileUpdatedAt !== "string") {
  throw new Error("savedProfileUpdatedAt was not emitted as a string.");
}

if (marker.settingsKind !== "repo-edu.app-settings.v1") {
  throw new Error(`unexpected settingsKind: ${String(marker.settingsKind)}`);
}

if (marker.settingsSchemaVersion !== 1) {
  throw new Error(
    `unexpected settingsSchemaVersion: ${String(marker.settingsSchemaVersion)}`,
  );
}

if (!Array.isArray(marker.rosterIssueKinds)) {
  throw new Error("rosterIssueKinds was not an array.");
}

if (!Array.isArray(marker.assignmentIssueKinds)) {
  throw new Error("assignmentIssueKinds was not an array.");
}

if (marker.spikeWorkflowId !== "spike.e2e-trpc") {
  throw new Error(
    `unexpected spikeWorkflowId: ${String(marker.spikeWorkflowId)}`,
  );
}

if (
  typeof marker.spikeProgressCount !== "number" ||
  marker.spikeProgressCount < 1
) {
  throw new Error("spikeProgressCount was not a positive number.");
}

if (marker.repoDeleteErrorType !== "validation") {
  throw new Error(
    `unexpected repoDeleteErrorType: ${String(marker.repoDeleteErrorType)}`,
  );
}

process.stdout.write(`${JSON.stringify(marker)}\n`);
