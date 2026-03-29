import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { packageManagerCommand } from "./package-manager-command.mjs";

const desktopDir = resolve(import.meta.dirname, "..");
const startedAt = performance.now();
const electronArgs = ["exec", "electron", "./out/main/main.js"];

const { command, args } = packageManagerCommand(electronArgs);

const child = spawn(command, args, {
  cwd: desktopDir,
  env: {
    ...process.env,
    REPO_EDU_DESKTOP_MEASURE: "1",
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

      if (parsed.marker === "repo-edu-desktop-cold-start") {
        marker = parsed;
      }
    } catch {
      // Ignore non-JSON stdout from Electron startup.
    }
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const [exitCode] = await once(child, "exit");
const processWallMs = Number((performance.now() - startedAt).toFixed(2));

clearTimeout(timeout);

if (exitCode !== 0) {
  throw new Error(`Electron exited with code ${exitCode}\n${stderr}`.trim());
}

if (!marker) {
  throw new Error(`Cold-start marker was not emitted.\n${stderr}`.trim());
}

process.stdout.write(
  `${JSON.stringify({
    ...marker,
    processWallMs,
  })}\n`,
);
