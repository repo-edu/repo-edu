import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const trpcMarker = "repo-edu-desktop-trpc";
const fixtureSelector = "small/shared-teams/canvas";
const expectedFixtureCourseId = "fixture-small-shared-teams";

function errorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function emitSuccess(marker) {
  process.stdout.write("PASS desktop runtime (trpc fixture)\n");
  process.stdout.write(
    `  course=${marker.validationCourseId} courses=${marker.courseCount} assignment=${marker.validationAssignmentId ?? "-"}\n`,
  );
}

function emitFailure(error) {
  const message = errorText(error);
  process.stderr.write("FAIL desktop runtime (trpc fixture)\n");
  process.stderr.write(`  ${message}\n`);
}

async function main() {
  const temporaryStorageRoot = await mkdtemp(
    join(tmpdir(), "repo-edu-desktop-fixture-"),
  );

  try {
    const isLinuxCi = process.platform === "linux" && process.env.CI === "true";
    const electronArguments = ["exec", "electron"];
    if (isLinuxCi) {
      electronArguments.push("--no-sandbox");
    }
    electronArguments.push("./out/main/main.js");

    const child = spawn("pnpm", electronArguments, {
      cwd: desktopDir,
      env: {
        ...process.env,
        REPO_EDU_DESKTOP_VALIDATE_TRPC: "1",
        REPO_EDU_FIXTURE: fixtureSelector,
        REPO_EDU_STORAGE_ROOT: temporaryStorageRoot,
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

    if (typeof marker.validationCourseId !== "string") {
      throw new Error("validationCourseId was not emitted as a string.");
    }

    if (marker.validationCourseId !== expectedFixtureCourseId) {
      throw new Error(
        `unexpected validationCourseId: ${String(marker.validationCourseId)}`,
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

    if (!Array.isArray(marker.listedCourseIds)) {
      throw new Error("listedCourseIds was not an array.");
    }

    if (typeof marker.courseCount !== "number" || marker.courseCount < 0) {
      throw new Error("courseCount was not a non-negative number.");
    }

    if (marker.courseCount !== marker.listedCourseIds.length) {
      throw new Error("courseCount did not match listedCourseIds length.");
    }

    if (marker.loadedCourseId !== marker.validationCourseId) {
      throw new Error(
        `unexpected loadedCourseId: ${String(marker.loadedCourseId)}`,
      );
    }

    if (marker.savedCourseId !== marker.validationCourseId) {
      throw new Error(
        `unexpected savedCourseId: ${String(marker.savedCourseId)}`,
      );
    }

    if (!marker.listedCourseIds.includes(marker.validationCourseId)) {
      throw new Error(
        "fixture validation course should be listed by course.list.",
      );
    }

    if (typeof marker.savedCourseUpdatedAt !== "string") {
      throw new Error("savedCourseUpdatedAt was not emitted as a string.");
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

    const fixtureArtifactsDirectory = join(
      temporaryStorageRoot,
      "fixtures",
      "small-shared-teams",
      "canvas",
      "imports",
    );
    const artifactFileNames = await readdir(fixtureArtifactsDirectory);
    const expectedArtifacts = ["students.csv", "groups.csv", "groups.json"];

    for (const expected of expectedArtifacts) {
      if (!artifactFileNames.includes(expected)) {
        throw new Error(`Missing seeded fixture artifact: ${expected}`);
      }
    }

    emitSuccess(marker);
  } finally {
    await rm(temporaryStorageRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  emitFailure(error);
  process.exitCode = 1;
});
