import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const blockedDependencies = new Set(["electron", "trpc-electron"]);
const blockedImportPatterns = [
  /from\s+["']electron["']/,
  /from\s+["']trpc-electron\//,
  /require\(["']electron["']\)/,
  /require\(["']trpc-electron\//,
];

async function listWorkspacePackageJsonFiles() {
  const files = [];

  const packageDirEntries = await readdir(join(repoRoot, "packages"), {
    withFileTypes: true,
  });
  for (const entry of packageDirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    files.push(join(repoRoot, "packages", entry.name, "package.json"));
  }

  const appDirEntries = await readdir(join(repoRoot, "apps"), {
    withFileTypes: true,
  });
  for (const entry of appDirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === "desktop") {
      continue;
    }

    files.push(join(repoRoot, "apps", entry.name, "package.json"));
  }

  return files;
}

async function listSourceRoots() {
  const roots = [];

  const packageDirEntries = await readdir(join(repoRoot, "packages"), {
    withFileTypes: true,
  });
  for (const entry of packageDirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    roots.push(join(repoRoot, "packages", entry.name, "src"));
  }

  for (const appName of ["docs", "cli"]) {
    roots.push(join(repoRoot, "apps", appName, "src"));
  }

  return roots;
}

function collectBlockedDependencies(pkg, packageJsonPath) {
  const violations = [];

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") {
      continue;
    }

    for (const depName of Object.keys(deps)) {
      if (blockedDependencies.has(depName)) {
        violations.push({
          kind: "dependency",
          file: packageJsonPath,
          detail: `${field}.${depName}`,
        });
      }
    }
  }

  return violations;
}

async function scanSourceImports(root) {
  const violations = [];

  try {
    await readdir(root);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return violations;
    }
    throw error;
  }

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "dist" || entry.name === "node_modules") {
          continue;
        }
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
        continue;
      }

      const content = await readFile(absolute, "utf8");
      for (const pattern of blockedImportPatterns) {
        if (pattern.test(content)) {
          violations.push({
            kind: "import",
            file: absolute,
            detail: pattern.toString(),
          });
          break;
        }
      }
    }
  }

  await walk(root);
  return violations;
}

function errorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function emitSuccess() {
  process.stdout.write("PASS desktop shell boundary\n");
}

function emitFailure(error) {
  const message = errorText(error);
  process.stderr.write("FAIL desktop shell boundary\n");
  process.stderr.write(`  ${message}\n`);
}

async function main() {
  const allViolations = [];

  for (const packageJsonPath of await listWorkspacePackageJsonFiles()) {
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    allViolations.push(...collectBlockedDependencies(pkg, packageJsonPath));
  }

  for (const srcRoot of await listSourceRoots()) {
    allViolations.push(...(await scanSourceImports(srcRoot)));
  }

  if (allViolations.length > 0) {
    const formatted = allViolations
      .map(
        (violation) =>
          `${violation.kind}: ${violation.file} (${violation.detail})`,
      )
      .join("\n");

    throw new Error(`Desktop shell boundary violations found:\n${formatted}`);
  }

  emitSuccess();
}

main().catch((error) => {
  emitFailure(error);
  process.exitCode = 1;
});
