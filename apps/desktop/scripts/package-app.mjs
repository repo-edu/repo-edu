import { spawnSync } from "node:child_process";

const scriptByPlatform = {
  darwin: "package:macos:app",
  linux: "package:linux:app",
  win32: "package:windows:app"
};

const targetScript = scriptByPlatform[process.platform];

if (!targetScript) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

const result = spawnSync("pnpm", ["run", targetScript], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
