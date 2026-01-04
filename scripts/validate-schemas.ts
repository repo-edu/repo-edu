import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020"

type LintIssue = {
  file: string
  message: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const schemaVersion = "https://json-schema.org/draft/2020-12/schema"

const schemasDir = resolve(repoRoot, "apps/repo-manage/schemas")
const typesDir = resolve(schemasDir, "types")
const metaDir = resolve(schemasDir, "meta")
const commandsDir = resolve(schemasDir, "commands")

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"))
}

type SchemaForLinting = {
  $schema?: string
  type?: string
  additionalProperties?: unknown
  properties?: Record<string, unknown>
  required?: string[]
  enum?: unknown[]
  "x-rust"?: unknown
  "x-enum-variants"?: unknown
}

function lintSchema(path: string, schema: SchemaForLinting): LintIssue[] {
  const issues: LintIssue[] = []

  if (schema.$schema !== schemaVersion) {
    issues.push({
      file: path,
      message: `Expected $schema ${schemaVersion}`,
    })
  }

  if (schema.type === "object") {
    if (!("additionalProperties" in schema)) {
      issues.push({
        file: path,
        message: "Object schemas must set additionalProperties",
      })
    }
    if (schema.properties && schema.required) {
      for (const requiredKey of schema.required) {
        if (!schema.properties[requiredKey]) {
          issues.push({
            file: path,
            message: `Required property "${requiredKey}" is missing from properties`,
          })
        }
      }
    }
  }

  if (schema.enum && !schema.type) {
    issues.push({
      file: path,
      message: "Enum schemas must declare a type",
    })
  }

  if (schema["x-enum-variants"]) {
    if (!Array.isArray(schema.enum)) {
      issues.push({
        file: path,
        message: "x-enum-variants requires an enum array",
      })
    } else {
      const mapping = schema["x-enum-variants"] as Record<string, string>
      const enumValues = new Set(schema.enum.map(String))
      for (const key of Object.keys(mapping)) {
        if (!enumValues.has(key)) {
          issues.push({
            file: path,
            message: `x-enum-variants key "${key}" not found in enum`,
          })
        }
        const value = mapping[key]
        if (!/^[A-Z][A-Za-z0-9_]*$/.test(value)) {
          issues.push({
            file: path,
            message: `x-enum-variants value "${value}" is not a valid Rust variant`,
          })
        }
      }
    }
  }

  if (schema["x-rust"]) {
    const xr = schema["x-rust"]
    if (typeof xr !== "object" || xr === null || Array.isArray(xr)) {
      issues.push({
        file: path,
        message: "x-rust must be an object",
      })
    }
  }

  if (schema.type === "object" && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as Record<string, unknown>
      if (prop?.["x-rust"]) {
        const xr = prop["x-rust"]
        if (typeof xr !== "object" || xr === null || Array.isArray(xr)) {
          issues.push({
            file: path,
            message: `x-rust for property "${propName}" must be an object`,
          })
        }
      }
    }
  }

  return issues
}

function main(): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false })

  const typeMetaPath = resolve(metaDir, "types.schema.json")
  const indexMetaPath = resolve(metaDir, "index.schema.json")
  const manifestMetaPath = resolve(metaDir, "manifest.schema.json")

  const typeMeta = loadJson(typeMetaPath)
  const indexMeta = loadJson(indexMetaPath)
  const manifestMeta = loadJson(manifestMetaPath)

  const validateType = ajv.compile(typeMeta)
  const validateIndex = ajv.compile(indexMeta)
  const validateManifest = ajv.compile(manifestMeta)

  const issues: LintIssue[] = []
  const schemaFiles = readdirSync(typesDir)
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => resolve(typesDir, name))

  for (const schemaPath of schemaFiles) {
    const schema = loadJson(schemaPath) as SchemaForLinting
    if (!validateType(schema)) {
      issues.push({
        file: schemaPath,
        message: `Meta-schema validation failed: ${ajv.errorsText(validateType.errors)}`,
      })
    }
    issues.push(...lintSchema(schemaPath, schema))
  }

  const indexPath = resolve(typesDir, "index.json")
  if (existsSync(indexPath)) {
    const indexSchema = loadJson(indexPath)
    if (!validateIndex(indexSchema)) {
      issues.push({
        file: indexPath,
        message: `Meta-schema validation failed: ${ajv.errorsText(validateIndex.errors)}`,
      })
    }
  } else {
    issues.push({
      file: indexPath,
      message: "Missing types index.json",
    })
  }

  const manifestPath = resolve(commandsDir, "manifest.json")
  if (existsSync(manifestPath)) {
    const manifest = loadJson(manifestPath)
    if (!validateManifest(manifest)) {
      issues.push({
        file: manifestPath,
        message: `Meta-schema validation failed: ${ajv.errorsText(validateManifest.errors)}`,
      })
    }
  } else {
    console.log("schema validation: manifest.json not found (skipping)")
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`)
    }
    process.exit(1)
  }

  console.log("schema validation: OK")
}

main()
