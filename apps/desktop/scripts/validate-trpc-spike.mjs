import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { packageManagerCommand } from "./package-manager-command.mjs";

const requireFromScript = createRequire(import.meta.url);
const desktopDir = resolve(import.meta.dirname, "..");
const trpcMarker = "repo-edu-desktop-trpc";
const fixtureSelector = "small/shared-teams/canvas";
const expectedFixtureCourseId = "fixture-small-shared-teams";
const appReadyTimeoutMs = readPositiveIntegerEnv(
  "REPO_EDU_DESKTOP_VALIDATE_APP_TIMEOUT_MS",
  60_000,
);
const rendererValidationTimeoutMs = readPositiveIntegerEnv(
  "REPO_EDU_DESKTOP_VALIDATE_TRPC_TIMEOUT_MS",
  30_000,
);

function readPositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function errorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatChildExit(exitCode, signal) {
  if (typeof exitCode === "number") {
    return `code ${exitCode}`;
  }
  if (typeof signal === "string") {
    return `signal ${signal}`;
  }
  return "unknown status";
}

function parseRuntimeMarker(line) {
  try {
    const parsed = JSON.parse(line);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.marker === trpcMarker
    ) {
      return parsed;
    }
  } catch {
    // Ignore unrelated stdout from Electron startup.
  }

  return undefined;
}

function formatCapturedOutput(stdout, stderr) {
  const sections = [];
  if (stdout.trim()) {
    sections.push(`stdout:\n${stdout.trim()}`);
  }
  if (stderr.trim()) {
    sections.push(`stderr:\n${stderr.trim()}`);
  }
  return sections.length > 0 ? `\n${sections.join("\n")}` : "";
}

function formatRendererTimeout(marker) {
  const textContent =
    typeof marker.textContent === "string" && marker.textContent.trim()
      ? `\nrenderer text:\n${marker.textContent.trim()}`
      : "";
  return `Renderer validation timed out before emitting the workflow marker.${textContent}`;
}

async function firstAccessiblePath(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Keep searching candidate packaged app paths.
    }
  }

  return undefined;
}

function orderedByHostArch(primary, secondary) {
  return process.arch === "arm64" ? [primary, secondary] : [secondary, primary];
}

function packagedElectronExecutableCandidates() {
  const releaseDir = resolve(desktopDir, "release");

  switch (process.platform) {
    case "darwin":
      return orderedByHostArch(
        join(
          releaseDir,
          "mac-arm64",
          "RepoEdu.app",
          "Contents",
          "MacOS",
          "RepoEdu",
        ),
        join(
          releaseDir,
          "mac",
          "RepoEdu.app",
          "Contents",
          "MacOS",
          "RepoEdu",
        ),
      );
    case "linux":
      return orderedByHostArch(
        join(releaseDir, "linux-arm64-unpacked", "repo-edu"),
        join(releaseDir, "linux-unpacked", "repo-edu"),
      );
    case "win32":
      return orderedByHostArch(
        join(releaseDir, "win-arm64-unpacked", "RepoEdu.exe"),
        join(releaseDir, "win-unpacked", "RepoEdu.exe"),
      );
    default:
      return [];
  }
}

function requiresPackagedElectronExecutable() {
  return (
    process.env.CI === "true" ||
    process.env.REPO_EDU_DESKTOP_VALIDATE_PACKAGED === "1"
  );
}

async function resolveElectronLaunch(isLinuxCi) {
  const runtimeArguments = isLinuxCi ? ["--no-sandbox"] : [];
  const candidates = packagedElectronExecutableCandidates();

  if (requiresPackagedElectronExecutable()) {
    const packagedCommand = await firstAccessiblePath(candidates);
    if (packagedCommand) {
      return {
        command: packagedCommand,
        args: runtimeArguments,
      };
    }

    throw new Error(
      `Packaged Electron app is required but no executable was found. Checked: ${candidates.join(", ")}`,
    );
  }

  try {
    const command = requireFromScript("electron");
    await access(command);
    return {
      command,
      args: [...runtimeArguments, "./out/main/main.js"],
    };
  } catch (error) {
    const packagedCommand = await firstAccessiblePath(candidates);
    if (packagedCommand) {
      return {
        command: packagedCommand,
        args: runtimeArguments,
      };
    }

    throw new Error(
      [
        `Electron npm package was not usable: ${errorText(error)}`,
        `No packaged app executable was found. Checked: ${candidates.join(", ")}`,
      ].join("\n"),
    );
  }
}

async function waitForChildClose(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      reject(new Error(`${label} failed to start: ${errorText(error)}`));
    });
    child.once("close", (exitCode, signal) => {
      resolve([exitCode, signal]);
    });
  });
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

function isRetriableCleanupError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = error.code;
  return (
    code === "ENOTEMPTY" ||
    code === "EBUSY" ||
    code === "EPERM" ||
    code === "EMFILE" ||
    code === "ENFILE"
  );
}

async function cleanupTemporaryStorageRoot(path) {
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await rm(path, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 50,
      });
      return;
    } catch (error) {
      if (!isRetriableCleanupError(error) || attempt === attempts) {
        process.stderr.write(
          `WARN desktop runtime (trpc fixture)\n  cleanup failed for ${path}: ${errorText(error)}\n`,
        );
        return;
      }
      await delay(attempt * 50);
    }
  }
}

async function seedValidationFixture(storageRoot) {
  const { command, args } = packageManagerCommand([
    "exec",
    "tsx",
    "scripts/seed-validation-fixture.ts",
    storageRoot,
    fixtureSelector,
  ]);
  const child = spawn(command, args, {
    cwd: desktopDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [exitCode] = await waitForChildClose(child, "Fixture seeding");

  if (exitCode !== 0) {
    throw new Error(
      `Fixture seeding exited with code ${exitCode}\n${stderr}`.trim(),
    );
  }

  const parsed = JSON.parse(stdout);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.courseEntityId !== "string" ||
    !Array.isArray(parsed.artifactPaths) ||
    !parsed.artifactPaths.every((path) => typeof path === "string")
  ) {
    throw new Error("Fixture seeding did not emit the expected payload.");
  }

  return parsed;
}

async function main() {
  const temporaryStorageRoot = await mkdtemp(
    join(tmpdir(), "repo-edu-desktop-fixture-"),
  );

  try {
    const seededFixture = await seedValidationFixture(temporaryStorageRoot);
    const isLinuxCi = process.platform === "linux" && process.env.CI === "true";
    const electronLaunch = await resolveElectronLaunch(isLinuxCi);

    const child = spawn(electronLaunch.command, electronLaunch.args, {
      cwd: desktopDir,
      env: {
        ...process.env,
        REPO_EDU_DESKTOP_VALIDATE_TRPC: "1",
        REPO_EDU_TEST_USER_FILE_QUEUE:
          seededFixture.artifactPaths.join(delimiter),
        REPO_EDU_STORAGE_ROOT: temporaryStorageRoot,
        REPO_EDU_VALIDATION_COURSE_ID: seededFixture.courseEntityId,
        REPO_EDU_DESKTOP_VALIDATE_TRPC_TIMEOUT_MS: String(
          rendererValidationTimeoutMs,
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let marker;
    let stderr = "";
    let stdout = "";
    let stdoutBuffer = "";
    let killedByTimeout = false;
    const timeout = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGTERM");
    }, appReadyTimeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line.trim()) {
          newlineIndex = stdoutBuffer.indexOf("\n");
          continue;
        }

        const parsed = parseRuntimeMarker(line);
        if (parsed) {
          marker = parsed;
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    // `close` guarantees stdio is drained, preventing marker races.
    const [exitCode, signal] = await waitForChildClose(
      child,
      "Electron",
    ).finally(() => {
      clearTimeout(timeout);
    });

    const trailingLine = stdoutBuffer.trim();
    if (trailingLine.length > 0) {
      const parsed = parseRuntimeMarker(trailingLine);
      if (parsed) {
        marker = parsed;
      }
    }

    if (killedByTimeout) {
      throw new Error(
        `Electron runtime validation timed out after ${appReadyTimeoutMs}ms.${formatCapturedOutput(stdout, stderr)}`,
      );
    }

    if (exitCode !== 0) {
      throw new Error(
        `Electron exited with ${formatChildExit(exitCode, signal)}${formatCapturedOutput(stdout, stderr)}`.trim(),
      );
    }

    if (!marker) {
      throw new Error(
        `electron-trpc marker was not emitted.${formatCapturedOutput(stdout, stderr)}`.trim(),
      );
    }

    if (marker.timeout === true) {
      throw new Error(formatRendererTimeout(marker));
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

    if (marker.settingsKind !== "repo-edu.app-settings.v2") {
      throw new Error(`unexpected settingsKind: ${String(marker.settingsKind)}`);
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
    await cleanupTemporaryStorageRoot(temporaryStorageRoot);
  }
}

main().catch((error) => {
  emitFailure(error);
  process.exitCode = 1;
});
