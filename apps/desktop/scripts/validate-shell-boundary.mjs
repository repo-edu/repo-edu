import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const blockedDependencies = new Set(["electron", "trpc-electron"]);
const blockedImportPatterns = [
  /from\s+["']electron["']/,
  /from\s+["']trpc-electron\//,
  /require\(["']electron["']\)/,
  /require\(["']trpc-electron\//,
];

async function listSharedWorkspacePackages() {
  const workspaces = [];

  for (const parentName of ["apps", "packages"]) {
    const entries = await readdir(join(repoRoot, parentName), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        (parentName === "apps" && entry.name === "desktop")
      ) {
        continue;
      }

      const root = join(repoRoot, parentName, entry.name);
      const packageJsonPath = join(root, "package.json");
      try {
        await access(packageJsonPath);
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }

      workspaces.push({ packageJsonPath, sourceRoot: join(root, "src") });
    }
  }

  return workspaces;
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
  const workspaces = await listSharedWorkspacePackages();

  for (const workspace of workspaces) {
    const raw = await readFile(workspace.packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    allViolations.push(
      ...collectBlockedDependencies(pkg, workspace.packageJsonPath),
      ...(await scanSourceImports(workspace.sourceRoot)),
    );
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
