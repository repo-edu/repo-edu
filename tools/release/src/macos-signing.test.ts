import assert from "node:assert/strict"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  cleanupMacosSigning,
  decodeCertificateInput,
  decodeRawBase64Secret,
  type MacosSigningSessionManifest,
  type ProcessRunner,
  parseSecurityListKeychains,
  prepareMacosSigning,
  readMacosSigningSessionManifest,
} from "./macos-signing.js"

const developerIdHash = "0123456789ABCDEF0123456789ABCDEF01234567"

type RecordedCommand = {
  readonly command: string
  readonly args: readonly string[]
}

function base64(contents: string): string {
  return Buffer.from(contents, "utf8").toString("base64")
}

function createSigningRunner(): {
  readonly commands: RecordedCommand[]
  readonly runner: ProcessRunner
} {
  const commands: RecordedCommand[] = []
  return {
    commands,
    runner: async (command, args) => {
      commands.push({ command, args })
      if (
        command === "security" &&
        args[0] === "list-keychains" &&
        !args.includes("-s")
      ) {
        return {
          stdout: '"/Users/aivm/Library/Keychains/login.keychain-db"\n',
          stderr: "",
        }
      }
      if (command === "security" && args[0] === "find-identity") {
        return {
          stdout: `  1) ${developerIdHash} "Developer ID Application: Repo Edu (TEAMID)"\n     1 valid identities found\n`,
          stderr: "",
        }
      }
      return { stdout: "", stderr: "" }
    },
  }
}

function findCommand(
  commands: readonly RecordedCommand[],
  command: string,
  firstArg: string,
): readonly string[] {
  const found = commands.find(
    (entry) => entry.command === command && entry.args[0] === firstArg,
  )
  assert.ok(found, `Missing command ${command} ${firstArg}`)
  return found.args
}

function resourcePath(
  manifest: MacosSigningSessionManifest,
  type: "temporary-directory" | "certificate" | "apple-api-key" | "keychain",
): string {
  const resource = manifest.resources.find((entry) => entry.type === type)
  assert.ok(resource)
  assert.ok("path" in resource)
  return resource.path
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe("macOS signing input materialisation", () => {
  it("accepts raw base64 and data-url certificate inputs", () => {
    const payload = base64("p12-bytes")

    assert.deepEqual(decodeCertificateInput(payload), Buffer.from("p12-bytes"))
    assert.deepEqual(
      decodeCertificateInput(`data:application/x-pkcs12;base64,${payload}`),
      Buffer.from("p12-bytes"),
    )
  })

  it("rejects unsupported certificate and API key shapes", () => {
    assert.throws(
      () => decodeCertificateInput("https://example.test/cert.p12"),
      /paths and URLs are not supported/,
    )
    assert.throws(
      () => decodeCertificateInput("~/cert.p12"),
      /paths and URLs are not supported/,
    )
    assert.throws(
      () => decodeCertificateInput("data:text/plain,not-base64"),
      /data:\*;base64/,
    )
    assert.throws(
      () => decodeRawBase64Secret("APPLE_API_KEY_BASE64", "data:,abc"),
      /raw base64 file contents/,
    )
    assert.throws(
      () => decodeRawBase64Secret("APPLE_API_KEY_BASE64", "not base64"),
      /not valid base64/,
    )
  })

  it("parses the user keychain search list", () => {
    assert.deepEqual(
      parseSecurityListKeychains(
        '    "/Users/aivm/Library/Keychains/login.keychain-db"\n    "/tmp/with space.keychain-db"\n',
      ),
      [
        "/Users/aivm/Library/Keychains/login.keychain-db",
        "/tmp/with space.keychain-db",
      ],
    )
  })
})

describe("macOS signing preparation", () => {
  it("creates a manifest, validates credentials and writes GitHub Actions values", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-signing-test-"))
    const { commands, runner } = createSigningRunner()
    const ids = ["keychain-password", "notary-profile"]
    try {
      const manifestPath = join(root, "signing-session.json")
      const githubEnv = join(root, "github-env")
      const githubOutput = join(root, "github-output")
      const outputs = await prepareMacosSigning({
        manifestPath,
        tmpRoot: root,
        runner,
        idFactory: () => {
          const id = ids.shift()
          assert.ok(id)
          return id
        },
        env: {
          CSC_LINK: base64("p12-bytes"),
          CSC_KEY_PASSWORD: "p12-password",
          APPLE_API_KEY_BASE64: base64("p8-bytes"),
          APPLE_API_KEY_ID: "KEYID12345",
          APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
          GITHUB_ENV: githubEnv,
          GITHUB_OUTPUT: githubOutput,
        },
      })

      assert.equal(outputs.CSC_NAME, developerIdHash)
      assert.equal(outputs.MACOS_SIGNING_IDENTITY, developerIdHash)
      assert.equal(outputs.MACOS_NOTARYTOOL_PROFILE, "repo-edu-notary-profile")

      const manifest = await readMacosSigningSessionManifest(manifestPath)
      assert.ok(manifest)
      assert.deepEqual(
        manifest.resources.map((resource) => resource.type),
        [
          "temporary-directory",
          "certificate",
          "apple-api-key",
          "keychain",
          "notarytool-profile",
        ],
      )
      assert.deepEqual(manifest.initialUserKeychains, [
        "/Users/aivm/Library/Keychains/login.keychain-db",
      ])
      assert.deepEqual(manifest.outputs, outputs)
      assert.equal(
        await readFile(resourcePath(manifest, "certificate"), "utf8"),
        "p12-bytes",
      )
      assert.equal(
        await readFile(resourcePath(manifest, "apple-api-key"), "utf8"),
        "p8-bytes",
      )

      const createKeychain = findCommand(
        commands,
        "security",
        "create-keychain",
      )
      assert.deepEqual(createKeychain.slice(0, 3), [
        "create-keychain",
        "-p",
        "keychain-password",
      ])
      assert.equal(createKeychain[3], outputs.CSC_KEYCHAIN)

      const exposeKeychain = commands.find(
        (entry) =>
          entry.command === "security" &&
          entry.args[0] === "list-keychains" &&
          entry.args.includes("-s"),
      )
      assert.ok(exposeKeychain)
      assert.deepEqual(exposeKeychain.args.slice(0, 5), [
        "list-keychains",
        "-d",
        "user",
        "-s",
        outputs.CSC_KEYCHAIN,
      ])
      assert.deepEqual(exposeKeychain.args.slice(5), [
        "/Users/aivm/Library/Keychains/login.keychain-db",
      ])

      const importCertificate = findCommand(commands, "security", "import")
      assert.ok(importCertificate.includes("/usr/bin/codesign"))
      assert.ok(importCertificate.includes("/usr/bin/productbuild"))

      const notarytool = findCommand(commands, "xcrun", "notarytool")
      assert.deepEqual(notarytool.slice(0, 4), [
        "notarytool",
        "store-credentials",
        "repo-edu-notary-profile",
        "--key",
      ])
      assert.ok(notarytool.includes("--keychain"))
      assert.ok(notarytool.includes(outputs.CSC_KEYCHAIN))
      assert.ok(notarytool.includes("--validate"))

      const githubEnvContents = await readFile(githubEnv, "utf8")
      assert.match(githubEnvContents, new RegExp(`CSC_NAME=${developerIdHash}`))
      assert.match(
        githubEnvContents,
        new RegExp(`MACOS_SIGNING_IDENTITY=${developerIdHash}`),
      )
      assert.match(githubEnvContents, /APPLE_API_KEY=/)
      assert.equal(await readFile(githubOutput, "utf8"), githubEnvContents)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails before artifact signing when no Developer ID Application identity exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-signing-test-"))
    const runner: ProcessRunner = async (command, args) => {
      if (
        command === "security" &&
        args[0] === "list-keychains" &&
        !args.includes("-s")
      ) {
        return { stdout: "", stderr: "" }
      }
      if (command === "security" && args[0] === "find-identity") {
        return {
          stdout:
            '  1) ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD "Apple Development: Repo Edu"\n',
          stderr: "",
        }
      }
      return { stdout: "", stderr: "" }
    }
    try {
      await assert.rejects(
        () =>
          prepareMacosSigning({
            manifestPath: join(root, "signing-session.json"),
            tmpRoot: root,
            runner,
            idFactory: () => "id",
            env: {
              CSC_LINK: base64("p12-bytes"),
              CSC_KEY_PASSWORD: "p12-password",
              APPLE_API_KEY_BASE64: base64("p8-bytes"),
              APPLE_API_KEY_ID: "KEYID12345",
              APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
            },
          }),
        /Developer ID Application identity/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

describe("macOS signing cleanup", () => {
  it("treats absent, empty and partial manifests as idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-signing-test-"))
    const commands: RecordedCommand[] = []
    const runner: ProcessRunner = async (command, args) => {
      commands.push({ command, args })
      return { stdout: "", stderr: "" }
    }
    try {
      await cleanupMacosSigning({
        manifestPath: join(root, "missing.json"),
        runner,
      })

      const emptyManifest = join(root, "empty.json")
      await writeFile(emptyManifest, "", "utf8")
      await cleanupMacosSigning({ manifestPath: emptyManifest, runner })

      const partialManifest = join(root, "partial.json")
      await writeFile(partialManifest, "{", "utf8")
      await cleanupMacosSigning({ manifestPath: partialManifest, runner })

      assert.deepEqual(commands, [])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("restores keychain search list, deletes the keychain and removes files", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-signing-test-"))
    const commands: RecordedCommand[] = []
    const runner: ProcessRunner = async (command, args) => {
      commands.push({ command, args })
      return { stdout: "", stderr: "" }
    }
    try {
      const sessionDir = join(root, "session")
      await mkdir(sessionDir)
      const certificatePath = join(sessionDir, "certificate.p12")
      const appleApiKeyPath = join(sessionDir, "AuthKey.p8")
      const keychainPath = join(sessionDir, "repo-edu-signing.keychain-db")
      await writeFile(certificatePath, "cert", "utf8")
      await writeFile(appleApiKeyPath, "key", "utf8")
      await writeFile(keychainPath, "keychain", "utf8")

      const manifest: MacosSigningSessionManifest = {
        version: 1,
        initialUserKeychains: ["/Users/aivm/login.keychain-db"],
        resources: [
          { type: "temporary-directory", path: sessionDir },
          { type: "certificate", path: certificatePath },
          { type: "apple-api-key", path: appleApiKeyPath },
          { type: "keychain", path: keychainPath },
          {
            type: "notarytool-profile",
            keychainPath,
            name: "repo-edu-notary-profile",
          },
        ],
      }
      await writeFile(
        join(root, "signing-session.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      )

      await cleanupMacosSigning({
        manifestPath: join(root, "signing-session.json"),
        runner,
      })

      assert.deepEqual(commands, [
        {
          command: "security",
          args: [
            "list-keychains",
            "-d",
            "user",
            "-s",
            "/Users/aivm/login.keychain-db",
          ],
        },
        {
          command: "security",
          args: ["delete-keychain", keychainPath],
        },
      ])
      assert.equal(await pathExists(sessionDir), false)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
