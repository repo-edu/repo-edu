import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

type JsonSchema = Record<string, unknown>

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const bindingsPath = resolve(repoRoot, "apps/repo-manage/src/bindings/types.ts")
const schemasDir = resolve(repoRoot, "apps/repo-manage/schemas/types")
const indexPath = resolve(schemasDir, "index.json")

const schemaVersion = "https://json-schema.org/draft/2020-12/schema"

function getDocComment(node: ts.Node): string | null {
  const jsDocs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc
  if (!jsDocs || jsDocs.length === 0) return null
  const doc = jsDocs[jsDocs.length - 1]
  if (typeof doc.comment === "string") {
    return doc.comment.trim()
  }
  if (Array.isArray(doc.comment)) {
    const text = doc.comment
      .map((part) => ("text" in part ? String(part.text) : ""))
      .join("")
      .trim()
    return text.length > 0 ? text : null
  }
  return null
}

function isExported(node: ts.Node): boolean {
  return (
    !!node.modifiers &&
    node.modifiers.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  )
}

function isLiteralUnion(node: ts.UnionTypeNode): {
  kind: "string" | "number" | "boolean"
  values: (string | number | boolean)[]
} | null {
  const values: (string | number | boolean)[] = []
  let kind: "string" | "number" | "boolean" | null = null
  for (const type of node.types) {
    if (!ts.isLiteralTypeNode(type)) return null
    const literal = type.literal
    if (ts.isStringLiteral(literal)) {
      if (kind && kind !== "string") return null
      kind = "string"
      values.push(literal.text)
    } else if (ts.isNumericLiteral(literal)) {
      if (kind && kind !== "number") return null
      kind = "number"
      values.push(Number(literal.text))
    } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
      if (kind && kind !== "boolean") return null
      kind = "boolean"
      values.push(true)
    } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
      if (kind && kind !== "boolean") return null
      kind = "boolean"
      values.push(false)
    } else {
      return null
    }
  }
  if (!kind) return null
  return { kind, values }
}

function schemaForTypeNode(
  node: ts.TypeNode,
  typeNames: Set<string>,
): JsonSchema {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: "string" }
    case ts.SyntaxKind.NumberKeyword:
      return { type: "number" }
    case ts.SyntaxKind.BooleanKeyword:
      return { type: "boolean" }
    case ts.SyntaxKind.NullKeyword:
      return { type: "null" }
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
      return {}
    case ts.SyntaxKind.LiteralType: {
      const literal = (node as ts.LiteralTypeNode).literal
      if (ts.isStringLiteral(literal)) {
        return { type: "string", const: literal.text }
      }
      if (ts.isNumericLiteral(literal)) {
        return { type: "number", const: Number(literal.text) }
      }
      if (literal.kind === ts.SyntaxKind.NullKeyword) {
        return { type: "null" }
      }
      if (literal.kind === ts.SyntaxKind.TrueKeyword) {
        return { type: "boolean", const: true }
      }
      if (literal.kind === ts.SyntaxKind.FalseKeyword) {
        return { type: "boolean", const: false }
      }
      return {}
    }
    case ts.SyntaxKind.ArrayType: {
      const arrayNode = node as ts.ArrayTypeNode
      return {
        type: "array",
        items: schemaForTypeNode(arrayNode.elementType, typeNames),
      }
    }
    case ts.SyntaxKind.TypeLiteral: {
      const literalNode = node as ts.TypeLiteralNode
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      let additionalProperties: JsonSchema | boolean = false

      for (const member of literalNode.members) {
        if (ts.isPropertySignature(member)) {
          if (!member.type || !member.name) continue
          const name = member.name.getText()
          const propSchema = schemaForTypeNode(member.type, typeNames)
          const description = getDocComment(member)
          if (description) {
            propSchema.description = description
          }
          properties[name] = propSchema
          if (!member.questionToken) {
            required.push(name)
          }
        } else if (ts.isIndexSignatureDeclaration(member)) {
          const valueType = member.type
          if (valueType) {
            additionalProperties = schemaForTypeNode(valueType, typeNames)
          } else {
            additionalProperties = true
          }
        }
      }

      const schema: JsonSchema = {
        type: "object",
        properties,
        additionalProperties,
      }
      if (required.length > 0) {
        schema.required = required
      }
      return schema
    }
    case ts.SyntaxKind.TypeReference: {
      const refNode = node as ts.TypeReferenceNode
      if (ts.isIdentifier(refNode.typeName)) {
        const name = refNode.typeName.text
        if (name === "Array" || name === "ReadonlyArray") {
          const [item] = refNode.typeArguments ?? []
          if (!item) return { type: "array" }
          return { type: "array", items: schemaForTypeNode(item, typeNames) }
        }
        if (name === "Record") {
          const [, valueType] = refNode.typeArguments ?? []
          if (!valueType) {
            return { type: "object", additionalProperties: true }
          }
          return {
            type: "object",
            additionalProperties: schemaForTypeNode(valueType, typeNames),
          }
        }
        if (name === "String") return { type: "string" }
        if (name === "Number") return { type: "number" }
        if (name === "Boolean") return { type: "boolean" }
        if (typeNames.has(name)) {
          return { $ref: `./${name}.schema.json` }
        }
      }
      return {}
    }
    case ts.SyntaxKind.UnionType: {
      const unionNode = node as ts.UnionTypeNode
      const literalUnion = isLiteralUnion(unionNode)
      if (literalUnion) {
        return { type: literalUnion.kind, enum: literalUnion.values }
      }
      const schemas = unionNode.types.map((type) =>
        schemaForTypeNode(type, typeNames),
      )
      return { anyOf: schemas }
    }
    case ts.SyntaxKind.IntersectionType: {
      const intersectionNode = node as ts.IntersectionTypeNode
      const schemas = intersectionNode.types.map((type) =>
        schemaForTypeNode(type, typeNames),
      )
      const mergeable = schemas.every(
        (schema) => schema.type === "object" && !schema.$ref,
      )
      if (mergeable) {
        const properties: Record<string, JsonSchema> = {}
        const required: string[] = []
        for (const schema of schemas) {
          const props = schema.properties as
            | Record<string, JsonSchema>
            | undefined
          if (props) {
            Object.assign(properties, props)
          }
          const req = schema.required as string[] | undefined
          if (req) {
            for (const item of req) {
              if (!required.includes(item)) required.push(item)
            }
          }
        }
        const merged: JsonSchema = {
          type: "object",
          properties,
          additionalProperties: false,
        }
        if (required.length > 0) merged.required = required
        return merged
      }
      return { allOf: schemas }
    }
    case ts.SyntaxKind.ParenthesizedType: {
      const inner = node as ts.ParenthesizedTypeNode
      return schemaForTypeNode(inner.type, typeNames)
    }
    default:
      return {}
  }
}

function buildSchemas(): void {
  const sourceText = readFileSync(bindingsPath, "utf-8")
  const sourceFile = ts.createSourceFile(
    bindingsPath,
    sourceText,
    ts.ScriptTarget.ES2020,
    true,
  )

  const declarations: { name: string; typeNode: ts.TypeNode; doc?: string }[] =
    []
  const typeNames: string[] = []
  const skipped: string[] = []

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue
    if (ts.isTypeAliasDeclaration(statement)) {
      if (statement.typeParameters && statement.typeParameters.length > 0) {
        skipped.push(statement.name.text)
        continue
      }
      declarations.push({
        name: statement.name.text,
        typeNode: statement.type,
        doc: getDocComment(statement) ?? undefined,
      })
      typeNames.push(statement.name.text)
    } else if (ts.isInterfaceDeclaration(statement)) {
      if (statement.typeParameters && statement.typeParameters.length > 0) {
        skipped.push(statement.name.text)
        continue
      }
      const membersNode = ts.factory.createTypeLiteralNode(statement.members)
      const heritageTypes: ts.TypeNode[] = []
      if (statement.heritageClauses) {
        for (const clause of statement.heritageClauses) {
          for (const type of clause.types) {
            heritageTypes.push(
              ts.factory.createTypeReferenceNode(type.expression.getText(), []),
            )
          }
        }
      }
      const typeNode = heritageTypes.length
        ? ts.factory.createIntersectionTypeNode([...heritageTypes, membersNode])
        : membersNode
      declarations.push({
        name: statement.name.text,
        typeNode,
        doc: getDocComment(statement) ?? undefined,
      })
      typeNames.push(statement.name.text)
    }
  }

  const nameSet = new Set(typeNames)
  mkdirSync(schemasDir, { recursive: true })

  for (const declaration of declarations) {
    const name = declaration.name
    const schema = schemaForTypeNode(declaration.typeNode, nameSet)
    if (declaration.doc) schema.description = declaration.doc
    const output: JsonSchema = {
      $schema: schemaVersion,
      title: name,
      ...schema,
    }
    writeFileSync(
      resolve(schemasDir, `${name}.schema.json`),
      `${JSON.stringify(output, null, 2)}\n`,
    )
  }

  const index = {
    $schema: schemaVersion,
    types: typeNames.sort().map((name) => ({
      name,
      path: `./${name}.schema.json`,
    })),
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`)

  if (skipped.length > 0) {
    console.warn(`Skipped generic types: ${skipped.join(", ")}`)
  }
  console.log(`Generated ${declarations.length} schemas in ${schemasDir}`)
}

buildSchemas()
