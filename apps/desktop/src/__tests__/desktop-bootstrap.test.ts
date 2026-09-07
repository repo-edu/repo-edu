import assert from "node:assert/strict"
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { it } from "node:test"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createCourseStore, defaultNodeWindowState } from "@repo-edu/host-node"
import { openExaminationArchiveDatabase } from "@repo-edu/host-node/examination-archive"
import { getFixture } from "@repo-edu/test-fixtures"
import { loadDesktopBootstrap } from "../desktop-bootstrap"
import { HostAdmission } from "../host-admission"
import type { HostAdmissionEffect } from "../host-admission-model"
import { createDesktopAppSettingsStore } from "../settings-store"

async function fixture(
  run: (
    root: string,
    admission: HostAdmission,
    effects: HostAdmissionEffect[],
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "desktop-bootstrap-"))
  const effects: HostAdmissionEffect[] = []
  const admission = new HostAdmission((effect) => effects.push(effect))
  try {
    await run(root, admission, effects)
  } finally {
    await chmod(join(root, "settings"), 0o700).catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
}

it("loads first-use defaults and empty durable stores before renderer readiness", async () => {
  await fixture(async (root, admission) => {
    const loaded = await loadDesktopBootstrap(root, admission)
    try {
      assert.deepEqual(loaded.settings, {
        credentials: defaultAppCredentials,
        preferences: defaultAppPreferences,
        recovery: [],
      })
      assert.deepEqual(loaded.windowState, defaultNodeWindowState)
      assert.deepEqual(await loaded.courseStore.listCourses(), [])
      assert.deepEqual(loaded.examinationArchive.exportAll(), [])
      assert.equal(admission.getSnapshot().phase, "starting")
      assert.equal(
        admission.dispatch({ type: "bootstrap-acknowledged" }),
        "accepted",
      )
    } finally {
      loaded.archiveHandle.close()
    }
  })
})

it("a later launch reads saved settings, courses and geometry with fresh owners", async () => {
  await fixture(async (root, admission) => {
    const settingsStore = createDesktopAppSettingsStore(root)
    const preferences = {
      ...defaultAppPreferences,
      appearance: {
        ...defaultAppPreferences.appearance,
        theme: "dark" as const,
      },
    }
    await settingsStore.preferences.save(preferences)
    const course = getFixture({ tier: "small", preset: "shared-teams" }).course
    const stamp = await createCourseStore(root).saveCourse(course)
    const first = await loadDesktopBootstrap(root, admission)
    await first.windowStateStore.save({ width: 900, height: 700 })
    first.archiveHandle.close()
    const second = await loadDesktopBootstrap(root, new HostAdmission(() => {}))
    try {
      assert.notEqual(first.archiveHandle, second.archiveHandle)
      assert.notEqual(first.appSettingsStore, second.appSettingsStore)
      assert.deepEqual(second.settings.preferences, preferences)
      assert.deepEqual(second.windowState, { width: 900, height: 700 })
      assert.deepEqual(await second.courseStore.loadCourse(course.id), {
        ...course,
        ...stamp,
      })
    } finally {
      second.archiveHandle.close()
    }
  })
})

for (const section of ["credentials", "preferences"] as const) {
  for (const [reason, content] of [
    ["invalid", "{}"],
    ["unparseable", "{"],
  ] as const) {
    it(`finishes ${section} ${reason} recovery and preserves its warning path`, async () => {
      await fixture(async (root, admission) => {
        const directory = join(root, "settings")
        await mkdir(directory)
        await writeFile(join(directory, `${section}.json`), content)
        const loaded = await loadDesktopBootstrap(root, admission)
        try {
          const [recovery] = loaded.settings.recovery
          assert.ok(recovery)
          assert.equal(recovery.unit, section)
          assert.equal(recovery.reason, reason)
          assert.equal(await readFile(recovery.backupPath, "utf8"), content)
          assert.equal(
            (await readdir(directory)).includes(`${section}.json`),
            false,
          )
          assert.deepEqual(
            loaded.settings[section],
            section === "credentials"
              ? defaultAppCredentials
              : defaultAppPreferences,
          )
        } finally {
          loaded.archiveHandle.close()
        }
      })
    })
  }

  it(`aborts unreadable ${section} without a bootstrap result or repair`, async () => {
    await fixture(async (root, admission, effects) => {
      const path = join(root, "settings", `${section}.json`)
      await mkdir(path, { recursive: true })
      await assert.rejects(loadDesktopBootstrap(root, admission))
      assert.equal(admission.getSnapshot().phase, "terminal")
      assert.equal(
        effects.filter((effect) => effect.type === "end-host").length,
        1,
      )
      assert.deepEqual(await readdir(join(root, "settings")), [
        `${section}.json`,
      ])
    })
  })

  it(`aborts a failed ${section} rename without replacing the source`, {
    skip: process.platform === "win32" || process.getuid?.() === 0,
  }, async () => {
    await fixture(async (root, admission) => {
      const directory = join(root, "settings")
      await mkdir(directory)
      const path = join(directory, `${section}.json`)
      await writeFile(path, "{}")
      await chmod(directory, 0o500)
      await assert.rejects(loadDesktopBootstrap(root, admission))
      assert.equal(admission.getSnapshot().phase, "terminal")
      assert.equal(await readFile(path, "utf8"), "{}")
      assert.deepEqual(await readdir(directory), [`${section}.json`])
    })
  })
}

for (const name of ["courses.sqlite", "examinations/archive.db"]) {
  for (const unreadable of [false, true]) {
    it(`aborts ${unreadable ? "unreadable" : "corrupt"} ${name} unchanged`, async () => {
      await fixture(async (root, admission) => {
        await mkdir(join(root, "examinations"))
        const path = join(root, name)
        if (unreadable) await mkdir(path)
        else await writeFile(path, "invalid database")
        await assert.rejects(loadDesktopBootstrap(root, admission))
        assert.equal(admission.getSnapshot().phase, "terminal")
        if (unreadable) assert.deepEqual(await readdir(path), [])
        else assert.equal(await readFile(path, "utf8"), "invalid database")
      })
    })
  }
}

it("rejects an invalid unselected course without changing its row", async () => {
  await fixture(async (root, admission) => {
    const store = createCourseStore(root)
    await store.saveCourse(
      getFixture({ tier: "small", preset: "shared-teams" }).course,
    )
    const db = new DatabaseSync(join(root, "courses.sqlite"))
    db.exec("UPDATE courses SET payload = '{}'")
    db.close()
    await assert.rejects(loadDesktopBootstrap(root, admission))
    const check = new DatabaseSync(join(root, "courses.sqlite"), {
      readOnly: true,
    })
    try {
      assert.equal(
        check.prepare("SELECT payload FROM courses").get()?.payload,
        "{}",
      )
    } finally {
      check.close()
    }
  })
})

for (const version of [0, 4, 999]) {
  it(`preserves an unsupported examination schema ${version} and its data`, async () => {
    await fixture(async (root, admission) => {
      await mkdir(join(root, "examinations"))
      const path = join(root, "examinations", "archive.db")
      const db = new DatabaseSync(path)
      db.exec(
        `PRAGMA user_version = ${version}; CREATE TABLE saved (value TEXT); INSERT INTO saved VALUES ('keep')`,
      )
      db.close()
      const before = await readFile(path)
      await assert.rejects(
        loadDesktopBootstrap(root, admission),
        /unsupported user_version/,
      )
      assert.deepEqual(await readFile(path), before)
    })
  })
}

it("rejects invalid examination records without deleting them", async () => {
  await fixture(async (root, admission) => {
    await mkdir(join(root, "examinations"))
    const dbPath = join(root, "examinations", "archive.db")
    const handle = openExaminationArchiveDatabase({ dbPath })
    handle.db.exec("INSERT INTO examinations VALUES ('invalid', 1, 1, '{}')")
    handle.close()
    await assert.rejects(
      loadDesktopBootstrap(root, admission),
      /Invalid examination data/,
    )
    const check = openExaminationArchiveDatabase({ dbPath })
    try {
      assert.equal(
        check.db.prepare("SELECT payload FROM examinations").get()?.payload,
        "{}",
      )
    } finally {
      check.close()
    }
  })
})
