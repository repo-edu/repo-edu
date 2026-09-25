import assert from "node:assert/strict"
import { beforeEach, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { PersistedCourse } from "@repo-edu/domain/types"
import ts from "typescript"
import { SessionController } from "../session/session-controller.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import {
  commandClient,
  commitPreparation,
  makeCourse,
  makeSettings,
  resetStores,
  workflowClient,
} from "./session-controller.test-support.js"

beforeEach(resetStores)

it("requires binding-produced arguments at every user admission boundary", () => {
  const configPath = fileURLToPath(
    new URL("../../tsconfig.typecheck.json", import.meta.url),
  )
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    fileURLToPath(new URL("../../", import.meta.url)),
  )
  const fixturePath = fileURLToPath(
    new URL("session-start-contract.fixture.ts", import.meta.url),
  )
  const fixture = `
    import type { SessionController } from "../session/session-controller.js"
    import type { SessionOperationGateway } from "../session/session-operations.js"
    import type { SessionSurfaceTransactions } from "../session/session-surface-transactions.js"
    import { bindSessionStart, type SessionStart } from "../session/session-start.js"
    import { sessionStartInventory } from "../session/session-start-inventory.js"
    import type { useDirectoryPicker, useUserFilePicker } from "../hooks/use-picker.js"
    declare const controller: SessionController
    declare const gateway: SessionOperationGateway
    declare const owner: SessionSurfaceTransactions
    declare const directory: ReturnType<typeof useDirectoryPicker>
    declare const file: ReturnType<typeof useUserFilePicker>
    // @ts-expect-error Entries describe controls; they are not admission arguments.
    gateway.execute(sessionStartInventory.analysisRun, "analysis.run", async () => {})
    // @ts-expect-error The private brand prevents construction outside the binding.
    const forged: SessionStart = { id: "analysisRun" }
    // @ts-expect-error A gateway start cannot omit its binding argument.
    gateway.execute("analysis.run", async () => {})
    // @ts-expect-error A reservation cannot omit its binding argument.
    gateway.reserve("analysis.run")
    // @ts-expect-error Surface admission is a user route.
    controller.activateSurface({ kind: "home" })
    // @ts-expect-error Course creation is a user route.
    controller.createCourse({ backing: "repobee", displayName: "New" })
    // @ts-expect-error Course rename is a user route.
    controller.renameCourse("id", "Name")
    // @ts-expect-error Course duplication is a user route.
    controller.duplicateCourse("id", "Copy")
    // @ts-expect-error Course deletion is a user route.
    controller.deleteCourse("id")
    // @ts-expect-error A picker must retain the initiating argument.
    directory({}, () => {})
    // @ts-expect-error A file picker must retain the initiating argument.
    file({}, () => {})
    // @ts-expect-error User transactions cannot take the lifecycle route.
    owner.enqueue({ kind: "rename" }, async () => {})
    owner.reserve({ kind: "bootstrap" })
    owner.enqueue({ kind: "close" }, async () => {})
    bindSessionStart("analysisStart", start => gateway.execute(start, "analysis.discoverRepos", async scope => {
      gateway.reserve(scope.start, "analysis.run")
    }))
  `
  const host = ts.createCompilerHost(parsed.options)
  const readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (
    name,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    name === fixturePath
      ? ts.createSourceFile(name, fixture, languageVersion, true)
      : readSource(name, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram(
    [fixturePath],
    { ...parsed.options, composite: false, noEmit: true },
    host,
  )
  const source = program.getSourceFile(fixturePath)
  assert.ok(source)
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ]
  assert.deepEqual(
    diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    ),
    [],
  )
})

it("creates a start only when the bound control runs", () => {
  const starts: SessionStart[] = []
  const handler = bindSessionStart("analysisStart", (start, input: string) => {
    starts.push(start)
    return input
  })
  assert.equal(starts.length, 0)
  assert.equal(handler("chosen folder"), "chosen folder")
  assert.equal(starts[0].id, "analysisStart")
})

it("carries user starts through both admission routes and keeps lifecycle work separate", async (t) => {
  const courses = new Map([["original", makeCourse("original")]])
  const client = workflowClient(async (id, input) => {
    if (id === "settings.loadApp") return makeSettings()
    if (id === "course.list") return [...courses.values()]
    if (id === "course.load")
      return courses.get((input as { courseId: string }).courseId)
    if (id === "course.save") {
      const course = input as PersistedCourse
      courses.set(course.id, course)
      return { revision: course.revision + 1, updatedAt: course.updatedAt }
    }
    if (id === "course.delete") {
      courses.delete((input as { courseId: string }).courseId)
      return
    }
    if (id === "settings.savePreferences") return
    assert.fail(id)
  })
  const controller = new SessionController({
    workflowClient: client,
    commandClient: commandClient(client),
    onBootstrapReady: async () => {},
  })
  t.after(() => controller.dispose())
  const lifecycle = new Set<string>()
  const admitted = new Set<SessionStart>()
  controller.subscribe(() => {
    for (const descriptor of controller
      .getSnapshot()
      .transactions.admitted.values()) {
      if ("start" in descriptor) admitted.add(descriptor.start)
      else lifecycle.add(descriptor.kind)
    }
  })
  controller.start()
  await controller.waitForIdle()
  assert.deepEqual([...lifecycle], ["bootstrap"])
  assert.equal(admitted.size, 0)

  const run = async <T>(
    id: SessionStart["id"],
    action: (start: SessionStart) => Promise<T>,
  ) => {
    let initiating: SessionStart | undefined
    const result = await bindSessionStart(id, (start) => {
      initiating = start
      return action(start)
    })()
    assert.ok(initiating)
    assert.ok(admitted.has(initiating))
    return result
  }
  await run("courseOpen", (start) =>
    controller.activateSurface(start, { kind: "course", courseId: "original" }),
  )
  await run("courseRename", (start) =>
    controller.renameCourse(start, "original", "Renamed"),
  )
  await run("courseDuplicate", (start) =>
    controller.duplicateCourse(start, "original", "Copy"),
  )
  await run("courseDelete", (start) =>
    controller.deleteCourse(start, "original"),
  )
  await run("courseNew", (start) =>
    controller.createCourse(start, { backing: "repobee", displayName: "New" }),
  )
  await run("home", (start) =>
    controller.activateSurface(start, { kind: "home" }),
  )
  await run("recentRepositories", (start) =>
    controller.activateSurface(start, { kind: "folder", path: "/recent" }),
  )

  let followUp: Promise<unknown> | undefined
  await run("analysisStart", (start) =>
    controller.operations.execute(
      start,
      "analysis.discoverRepos",
      async (scope) => {
        assert.equal(scope.start, start)
        await scope.activateSurface({ kind: "folder", path: "/discovered" })
        const descriptor = [
          ...controller.getSnapshot().transactions.admitted.values(),
        ][0]
        assert.ok("start" in descriptor)
        assert.equal(descriptor.start, start)
        const reservation = controller.operations.reserve(
          scope.start,
          "analysis.run",
        )
        assert.ok(reservation)
        followUp = reservation.run(async (next) =>
          assert.equal(next.start, start),
        )
      },
    ),
  )
  await followUp
  await controller.requestClose(commitPreparation)
  assert.deepEqual([...lifecycle], ["bootstrap", "close"])
})
