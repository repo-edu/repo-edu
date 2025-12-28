# Repo Manage Schemas

This directory is the source of truth for shared schemas between the Tauri
backend and the frontend bindings.

## Structure

- `types/` contains JSON Schemas for shared types.
- `commands/manifest.json` defines the Tauri command inputs/outputs.
- `meta/` contains meta-schemas used to validate the schema files.

## Editing Rules

- Schemas are generated/updated by AI-driven scripts only.
- Generated outputs must never be edited manually.
- After changing schemas, run the schema generator and validation steps.

## Conventions

- `$schema` must be `https://json-schema.org/draft/2020-12/schema`.
- Object schemas must set `additionalProperties` explicitly.
- Enums must declare a `type` alongside `enum` values.
- `Option<T>` fields are represented as nullable unions (`anyOf` with `null`).
- `Vec<T>` is `type: "array"` with `items` referencing the element schema.

## Schema Extension Spec (x-rust)

Schema files may include vendor extensions to carry Rust-specific intent. These
extensions are the **source of truth** for Rust DTO generation.

### `x-rust`

`x-rust` may appear at the schema root or on individual properties.

```json
"x-rust": {
  "type": "u32",
  "field": "server_type",
  "serde": {
    "rename": "type",
    "rename_all": "camelCase",
    "default": true,
    "skip_serializing_if": "Option::is_none"
  }
}
```

- `type`: override the Rust type (e.g., `"u32"`, `"String"`, `"chrono::DateTime<chrono::Utc>"`).
- `field`: override the Rust field name when it differs from the JSON property.
- `default`: for enums, sets the default variant by JSON value (emits `#[derive(Default)]` +
  `#[default]`).
- `serde.rename`: explicit serde rename for this field.
- `serde.rename_all`: apply to structs/enums for casing rules.
- `serde.default`: `true` for `#[serde(default)]` or a string for custom default function.
- `serde.skip_serializing_if`: serde skip predicate (string).

### `x-enum-variants`

Map JSON enum values to Rust variant identifiers:

```json
"x-enum-variants": {
  "TUE": "Tue",
  "CUSTOM": "Custom"
}
```

If provided, the generator uses this map and emits `#[serde(rename = "...")]`.
