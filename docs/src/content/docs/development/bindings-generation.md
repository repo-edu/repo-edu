---
title: Bindings Generation
description: How repo-edu generates TypeScript and Rust bindings from JSON Schemas.
---

# Bindings Generation

repo-edu uses JSON Schemas as the source of truth for shared DTOs and command signatures. The
bindings generator turns those schemas into both TypeScript and Rust artifacts so the frontend,
Tauri backend, and CLI stay aligned.

## Source Of Truth

Two schema inputs drive generation:

- `apps/repo-manage/schemas/types/*.schema.json` defines shared data types.
- `apps/repo-manage/schemas/commands/manifest.json` defines command inputs and outputs.

Do not edit generated outputs directly. Edit schemas or the command manifest, then regenerate.

## Generated Outputs

Running `pnpm gen:bindings` updates these files:

- `packages/backend-interface/src/types.ts` for shared domain types.
- `packages/backend-interface/src/index.ts` for the `BackendAPI` interface.
- `packages/app-core/src/bindings/commands.ts` for frontend command delegation.
- `apps/repo-manage/src/bindings/tauri.ts` for the Tauri backend adapter.
- `apps/repo-manage/core/src/generated/types.rs` for Rust DTOs.

## Generation Pipeline

The generator entrypoint is `scripts/gen-from-schema.ts`.

It performs two distinct jobs:

1. Compile TypeScript types from JSON Schemas using `json-schema-to-typescript`.
2. Emit Rust DTOs with the repository's custom Rust code generator.

The command manifest is processed in the same script to generate the `BackendAPI` contract and the
frontend and Tauri command wrappers.

```text
JSON Schemas + command manifest
            ↓
    scripts/gen-from-schema.ts
            ↓
  TypeScript bindings + Rust DTOs
```

## Developer Workflow

After changing any type schema or the command manifest:

```bash
pnpm gen:bindings
pnpm check
```

`pnpm gen:bindings` regenerates the derived files. `pnpm check` catches schema drift, type errors,
and command parity issues before runtime.

## Schema Rules That Matter

The generator expects a few schema conventions:

- Use JSON Schema draft 2020-12.
- Object schemas must set `additionalProperties` explicitly.
- Enums must declare a `type` alongside `enum`.
- `Option<T>` maps to `anyOf` with the inner schema and `{ "type": "null" }`.
- Arrays map to `type: "array"` plus `items`.

These rules are enforced because the same schema must drive both TypeScript and Rust generation.

## Generator-Specific Extensions

repo-edu intentionally uses a few non-standard schema extensions to carry generator intent.

### `x-rust`

`x-rust` may appear at the schema root (for top-level type definitions) or on individual properties.

Supported keys:

- `type` — override the Rust type (e.g. `"u32"`, `"MemberStatus"`,
  `"chrono::DateTime<chrono::Utc>"`).
- `field` — override the Rust field name when it differs from the JSON property name.
- `default` — for enums, sets the default variant by JSON value (emits `#[derive(Default)]` +
  `#[default]`).
- `serde.rename` — explicit serde rename for the field.
- `serde.rename_all` — casing rule for structs/enums (e.g. `"camelCase"`, `"lowercase"`).
- `serde.default` — `true` for `#[serde(default)]`, or a string for a custom default function.
- `serde.skip_serializing_if` — serde skip predicate (e.g. `"Option::is_none"`).

Example (property-level):

```json
"last_updated": {
  "type": "string",
  "x-rust": { "type": "chrono::DateTime<chrono::Utc>" }
}
```

### `x-rust-type`

A top-level shorthand for defining a Rust type alias. When a schema's only purpose is to name an
existing Rust type, use `x-rust-type` at the schema root instead of the nested `x-rust.type` form:

```json
{
  "title": "Timestamp",
  "x-rust-type": "chrono::DateTime<chrono::Utc>"
}
```

This emits a `type Timestamp = chrono::DateTime<chrono::Utc>;` alias in Rust.

### `x-enum-variants`

Maps JSON enum values to Rust variant identifiers. Use this when the JSON value does not map
cleanly to a valid or idiomatic Rust identifier:

```json
"x-enum-variants": {
  "TUE": "Tue",
  "CUSTOM": "Custom"
}
```

If provided, the generator uses this map and emits `#[serde(rename = "...")]` on each variant.

### `tsType`

`tsType` is a `json-schema-to-typescript` extension that overrides only the generated TypeScript
type.

Use it when a schema composition is semantically correct but produces unstable or incorrect
TypeScript output from the upstream generator.

This is a TypeScript-only override. It does not affect Rust generation.

## Recommended Patterns

### Shared Enum

Prefer a plain `$ref` when the field is required or when `undefined` is sufficient:

```json
"status": {
  "$ref": "./MemberStatus.schema.json"
}
```

### Nullable Shared Enum

When the field must remain `Enum | null` without duplicating enum literals, combine schema
composition with generator-specific overrides:

```json
"lms_status": {
  "anyOf": [
    { "$ref": "./MemberStatus.schema.json" },
    { "type": "null" }
  ],
  "tsType": "MemberStatus | null",
  "x-rust": { "type": "MemberStatus" }
}
```

This preserves:

- a single enum source of truth in `MemberStatus.schema.json`
- `MemberStatus | null` in TypeScript
- `Option<MemberStatus>` in Rust

### Nullable Shared Struct

For nullable references to object schemas, a plain `anyOf` with `$ref` and `null` works without
`tsType` because `json-schema-to-typescript` does not produce suffixed aliases for object types:

```json
"config": {
  "anyOf": [{ "$ref": "./SomeConfig.schema.json" }, { "type": "null" }]
}
```

The suffix issue only arises with enum `$ref` targets that appear more than once in the same
parent schema. Add `tsType` only when needed.

## Known Edge Cases

`json-schema-to-typescript` can synthesize suffixed aliases such as `Foo1` when the same `$ref`
appears in composed schemas like `anyOf`. In some cases that alias is referenced but not emitted in
the generated output.

Do not patch the generated files to work around this. Prefer one of these fixes:

1. Reshape the schema so the generated type is stable.
2. Use `tsType` to pin the intended TypeScript type while keeping the schema as the source of
   truth.
3. Use `x-rust.type` when the Rust generator must preserve a named type through a composed schema.

## Troubleshooting

### Generated TypeScript Mentions A Missing Alias

If generated TypeScript references a type such as `MemberStatus1` that does not exist:

1. Check for repeated `$ref` usage inside `anyOf`, `oneOf`, or `allOf`.
2. Prefer a schema-level fix instead of post-processing generated output.
3. Add `tsType` only where the upstream generator needs help.

### Rust Type Regresses To `String`

If a Rust field should stay a named enum or custom type but becomes `String`:

1. Inspect the schema shape after composition.
2. Add or restore `x-rust.type` on the property.
3. Regenerate and verify `apps/repo-manage/core/src/generated/types.rs`.

### Bindings Freshness Or Parity Checks Fail

If `pnpm check` reports stale bindings or command drift:

1. Regenerate with `pnpm gen:bindings`.
2. Re-run `pnpm check`.
3. Compare the command manifest and generated bindings before touching generated files by hand.
