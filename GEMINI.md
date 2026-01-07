# repo-edu

## Project Overview

**repo-edu** is a tool for educational repository management, designed to streamline student
workflows through LMS integration (Canvas, Moodle). It allows for batch creation of student
repositories, fetching rosters, and managing assignments across GitHub, GitLab, and Gitea.

The project is a monorepo offering both a **GUI** (Tauri + React) and a **CLI** (`redu`) for
automation.

### Architecture

The repository utilizes a dual-workspace structure:

* **pnpm workspace:** Manages TypeScript packages (frontend, docs, UI library).
* **Cargo workspace:** Manages Rust crates (backend logic, CLI, LMS clients).

**Key Directories:**

* `apps/repo-manage/`: Main application directory.
  * `src/`: React frontend (Vite).
  * `src-tauri/`: Tauri Rust backend.
  * `repo-manage-core/`: Shared Rust business logic.
  * `repo-manage-cli/`: The `redu` CLI tool.
  * `schemas/`: JSON Schemas for type generation.
* `crates/`: Shared Rust libraries (LMS clients for Canvas/Moodle).
* `packages/ui/`: Shared UI components (based on shadcn/ui).
* `docs/`: VitePress documentation site.

## Building and Running

**Important:** Always use `pnpm` scripts. Do not use raw `cargo`, `npm`, or `npx` commands.

### Development

* **Install dependencies:** `pnpm install`
* **Run Desktop App (Dev):** `pnpm dev`
* **Run CLI (Dev):** `pnpm cli:build` (Binary output: `./target/debug/redu`)
* **Preview Docs:** `pnpm docs:dev`

### Building

* **Build CLI (Release):** `pnpm cli:build:release`
* **Build Tauri App (Debug):** `pnpm tauri:build`
* **Build Tauri App (Release):** `pnpm tauri:build:release`

### Testing

* **Run All Tests:** `pnpm test`
* **Frontend Tests (Vitest):** `pnpm test:ts`
* **Rust Tests:** `pnpm test:rs`

### Code Generation

This project relies heavily on code generation from JSON Schemas.

* **Regenerate Bindings:** `pnpm gen:bindings`
  * *Note:* Run this after modifying any schema in `apps/repo-manage/schemas/`.

## Development Conventions

* **Style:**
  * **JS/TS:** Uses **Biome** (`pnpm fmt`, `pnpm check`, `pnpm fix`). Double quotes, no semicolons
    (mostly).
  * **Rust:** Uses `rustfmt` and `clippy`.
* **Generated Code:**
  * Never edit files in `bindings/` or `generated/` directories directly.
  * Modify the source JSON Schemas and run `pnpm gen:bindings`.
* **State Management:** Frontend uses **Zustand**.
* **UI Components:** Located in `packages/ui` and aliased as `@repo-edu/ui`.
* **Path Aliases:** `@/` maps to `apps/repo-manage/src/`.

## Documentation

Full documentation is available at [repo-edu.github.io/repo-edu](https://repo-edu.github.io/repo-edu/).
Local documentation can be found in the `docs/` directory.
