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

process.stdout.write(`${JSON.stringify(marker)}\n`);
