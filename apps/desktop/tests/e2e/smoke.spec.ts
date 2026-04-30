import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron, expect, test } from "@playwright/test"

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, "../..")

test("app boots and captures a screenshot", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "repo-edu-e2e-"))
  const app = await electron.launch({
    args: [appRoot, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      REPO_EDU_STORAGE_ROOT: userData,
    } as Record<string, string>,
  })
  const window = await app.firstWindow()
  await window.waitForLoadState("domcontentloaded")
  await expect(window).toHaveTitle(/.+/)
  await window.screenshot({ path: "test-results/smoke.png" })
  await app.close()
})
