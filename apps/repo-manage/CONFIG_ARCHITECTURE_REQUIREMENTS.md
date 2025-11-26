# Configuration Architecture Requirements Document

**Version:** 1.0
**Date:** 2025-11-21
**Purpose:** Requirements for implementing a robust CLI/GUI shared configuration system
**Target Language:** Rust (adaptable to other languages)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Core Requirements](#core-requirements)
4. [Data Model](#data-model)
5. [File System Architecture](#file-system-architecture)
6. [Validation Requirements](#validation-requirements)
7. [Error Handling Requirements](#error-handling-requirements)
8. [Serialization Requirements](#serialization-requirements)
9. [CLI Integration](#cli-integration)
10. [GUI Integration](#gui-integration)
11. [Type Safety Requirements](#type-safety-requirements)
12. [Testing Requirements](#testing-requirements)
13. [Rust-Specific Implementation Guidance](#rust-specific-implementation-guidance)
14. [Reference Implementation Analysis](#reference-implementation-analysis)

---

## 1. Executive Summary

This document specifies requirements for a configuration management system that:

- **Shares configuration options** between CLI and GUI interfaces
- **Persists settings** to disk with validation
- **Maintains type safety** throughout the system
- **Handles errors explicitly** with proper error types
- **Supports incremental migration** from defaults to custom configurations
- **Provides atomic operations** for save/load/reset operations

The architecture is based on a successful Python implementation (gitinspectorgui), refined with improvements to eliminate identified weaknesses.

---

## 2. Architecture Overview

### 2.1 Core Architectural Principles

1. **Single Source of Truth**: One configuration struct defines all options
2. **Layered Design**: Base configuration → Extended configurations → Interface-specific wrappers
3. **Immutability by Default**: Configuration transformations return new instances
4. **Explicit Error Handling**: All fallible operations return Result types
5. **Schema Validation**: JSON schema validation for persisted data
6. **Path Normalization**: Consistent path representation across platforms

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌──────────────┐                        ┌──────────────┐   │
│  │  CLI Parser  │                        │  GUI Events  │   │
│  └──────┬───────┘                        └──────┬───────┘   │
│         │                                       │           │
│         └───────────────┬───────────────────────┘           │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│              Configuration Management Layer                  │
│                         │                                   │
│         ┌───────────────▼───────────────┐                   │
│         │   Configuration Struct        │                   │
│         │  - All shared options         │                   │
│         │  - Validation methods         │                   │
│         │  - Normalization logic        │                   │
│         └───────────────┬───────────────┘                   │
│                         │                                   │
│         ┌───────────────┴───────────────┐                   │
│         │                               │                   │
│  ┌──────▼────────┐             ┌────────▼────────┐         │
│  │  CLI Config   │             │   GUI Config    │         │
│  │  + CLI-only   │             │   + GUI-only    │         │
│  │    options    │             │     options     │         │
│  └───────────────┘             └─────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                  Persistence Layer                           │
│         ┌───────────────▼───────────────┐                   │
│         │  ConfigurationFile Manager    │                   │
│         │  - Load/Save operations       │                   │
│         │  - Schema validation          │                   │
│         │  - Location management        │                   │
│         └───────────────┬───────────────┘                   │
│                         │                                   │
│         ┌───────────────▼───────────────┐                   │
│         │        File System            │                   │
│         │  - settings.json              │                   │
│         │  - settings-location.json     │                   │
│         └───────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Requirements

### 3.1 Functional Requirements

**REQ-F-001**: The system SHALL provide a single configuration structure containing all shared options between CLI and GUI.

**REQ-F-002**: The system SHALL support CLI-only options (e.g., --save, --load, --reset) without polluting the shared configuration.

**REQ-F-003**: The system SHALL support GUI-only options (e.g., window layout percentages) without polluting the shared configuration.

**REQ-F-004**: The system SHALL persist configuration to disk in JSON format.

**REQ-F-005**: The system SHALL validate all configuration data before saving or loading.

**REQ-F-006**: The system SHALL normalize user input (trim whitespace, convert paths, clean arrays).

**REQ-F-007**: The system SHALL provide defaults for all configuration options.

**REQ-F-008**: The system SHALL support loading configuration from arbitrary file paths.

**REQ-F-009**: The system SHALL support saving configuration to arbitrary file paths.

**REQ-F-010**: The system SHALL maintain a "location file" that tracks the active configuration file path.

**REQ-F-011**: The system SHALL support resetting configuration to defaults.

**REQ-F-012**: The system SHALL support resetting the configuration file location to defaults.

### 3.2 Non-Functional Requirements

**REQ-NF-001**: Configuration operations SHALL be atomic (save completes fully or not at all).

**REQ-NF-002**: The system SHALL use platform-appropriate configuration directories.

**REQ-NF-003**: All file I/O SHALL use UTF-8 encoding.

**REQ-NF-004**: Configuration file format SHALL be human-readable and editable.

**REQ-NF-005**: The system SHALL maintain backwards compatibility with older configuration files (or provide migration).

**REQ-NF-006**: Type safety SHALL be enforced at compile time where possible.

**REQ-NF-007**: All errors SHALL include sufficient context for debugging.

---

## 4. Data Model

### 4.1 Core Configuration Structure

**REQ-DM-001**: Define a base configuration structure with these categories:

#### Input Options
- `input_paths`: List of repository/folder paths to analyze
- `depth`: Subdirectory nesting depth for multi-repo analysis (integer ≥ 0)
- `subfolder`: Subfolder within repository to analyze (path string)
- `include_files`: File patterns to include (list of glob patterns)
- `exclude_files`: File patterns to exclude (list of glob patterns)
- `extensions`: File extensions to analyze (list of strings)
- `n_files`: Number of top files to show (integer ≥ 0, 0 = all)

#### Output Options
- `output_base`: Base filename for output files (string)
- `file_formats`: Output formats (list from enum: HTML, Excel)
- `fix`: Filename fix type (enum: Prefix, Postfix, NoFix)
- `view`: View mode (enum: Auto, DynamicBlameHistory, None)

#### Analysis Options
- `since`: Start date for analysis (optional date string, format: YYYY-MM-DD)
- `until`: End date for analysis (optional date string, format: YYYY-MM-DD)
- `scaled_percentages`: Use scaled percentage calculations (boolean)
- `show_renames`: Show file rename history (boolean)
- `deletions`: Include deletion statistics (boolean)

#### Blame Options
- `blame_skip`: Skip blame analysis entirely (boolean)
- `blame_exclusions`: How to handle excluded authors (enum: Hide, Show, Remove)
- `copy_move`: Copy/move detection threshold 0-9 (integer 0-9)
- `whitespace`: Include whitespace changes (boolean)
- `empty_lines`: Include empty lines in blame (boolean)
- `comments`: Include comments in blame (boolean)

#### Exclusion Filters
- `exclude_authors`: Author name patterns to exclude (list of regex patterns)
- `exclude_emails`: Email patterns to exclude (list of regex patterns)
- `exclude_revisions`: Git revision patterns to exclude (list of SHA patterns)
- `exclude_messages`: Commit message patterns to exclude (list of regex patterns)

#### Performance Options
- `multithread`: Enable multithreading (boolean)
- `multicore`: Enable multicore processing (boolean)
- `verbosity`: Logging verbosity level (integer 0-2)
- `dryrun`: Dry run mode level (integer 0-2)

### 4.2 Extended Configurations

**REQ-DM-002**: Define CLI-specific configuration extending base configuration:

```rust
struct CLIConfig {
    base: Configuration,
    // CLI-only options
    reset_file: bool,
    load_path: Option<PathBuf>,
    reset_defaults: bool,
    save: bool,
    save_as: Option<PathBuf>,
    show_settings: bool,
    run: bool,
    profile: Option<u32>,
}
```

**REQ-DM-003**: Define GUI-specific configuration extending base configuration:

```rust
struct GUIConfig {
    base: Configuration,
    // GUI-only options
    col_percent: u8,  // Layout column percentage (0-100)
    settings_full_path: bool,  // Show full path vs filename
}
```

### 4.3 Default Values

**REQ-DM-004**: The system SHALL define defaults as constants, not hard-coded in multiple locations.

Example default constants:
```rust
const DEFAULT_FILE_BASE: &str = "gitinspect";
const DEFAULT_DEPTH: u32 = 5;
const DEFAULT_N_FILES: u32 = 5;
const DEFAULT_COPY_MOVE: u8 = 1;
const DEFAULT_VERBOSITY: u8 = 0;
const DEFAULT_EXTENSIONS: &[&str] = &[
    "c", "cc", "cpp", "h", "hpp", "java", "js",
    "py", "rb", "sql", "ts", "glsl", "cif"
];
const DEFAULT_BLAME_EXCLUSIONS: BlameExclusions = BlameExclusions::Hide;
```

### 4.4 Enumerations

**REQ-DM-005**: Define strongly-typed enums for all categorical options:

```rust
enum FixType { Prefix, Postfix, NoFix }
enum ViewMode { Auto, DynamicBlameHistory, None }
enum FileFormat { HTML, Excel }
enum BlameExclusions { Hide, Show, Remove }
```

**REQ-DM-006**: All enums SHALL implement:
- Serialization/deserialization (serde)
- String conversion (Display, FromStr)
- Default values

---

## 5. File System Architecture

### 5.1 Directory Structure

**REQ-FS-001**: The system SHALL use platform-appropriate configuration directories:
- Linux: `$XDG_CONFIG_HOME/appname/` or `~/.config/appname/`
- macOS: `~/Library/Application Support/appname/`
- Windows: `%APPDATA%\appname\`

**REQ-FS-002**: Use a Rust crate like `directories` or `dirs` for cross-platform paths.

### 5.2 Configuration Files

**REQ-FS-003**: Settings Location File

- **Filename**: `appname-location.json`
- **Purpose**: Tracks which settings file is currently active
- **Schema**:
  ```json
  {
    "settings_location": "/absolute/path/to/settings.json"
  }
  ```
- **Location**: Always in the default config directory

**REQ-FS-004**: Settings File

- **Default Filename**: `appname.json`
- **Purpose**: Stores actual configuration values
- **Schema**: Matches the Configuration struct serialized to JSON
- **Location**: Specified by settings location file (can be anywhere)

### 5.3 File Operations

**REQ-FS-005**: File Creation

- Create missing directories with appropriate permissions
- Create default configuration file on first run
- Create location file pointing to default configuration
- Use atomic writes (write to temp file, then rename)

**REQ-FS-006**: File Reading

- Read location file to find settings file path
- If location file missing/invalid, create default
- If settings file missing/invalid, return error (don't auto-create)
- Validate JSON schema before deserializing

**REQ-FS-007**: File Writing

- Validate configuration before writing
- Format JSON with 4-space indentation
- Sort keys alphabetically for consistent diffs
- Use atomic writes to prevent corruption
- Sync to disk before returning success

**REQ-FS-008**: Path Normalization

- Store all paths in the configuration as absolute paths
- Convert relative paths to absolute when loading from CLI/GUI
- Use forward slashes (POSIX format) in configuration files
- Convert to platform-native format only when using paths

---

## 6. Validation Requirements

### 6.1 Schema Validation

**REQ-VAL-001**: The system SHALL validate JSON structure against a schema before deserializing.

**REQ-VAL-002**: Schema validation SHALL check:
- Required fields are present
- Field types are correct
- Enum values are valid
- No unexpected fields present

**REQ-VAL-003**: Schema generation SHALL be automatic from the Configuration struct definition.

Rust implementation approach:
```rust
use schemars::JsonSchema;

#[derive(JsonSchema, Serialize, Deserialize)]
struct Configuration {
    // fields automatically generate schema
}

fn validate_json(json_str: &str) -> Result<(), ValidationError> {
    let schema = schema_for!(Configuration);
    let instance = serde_json::from_str(json_str)?;
    let compiled = JSONSchema::compile(&schema)?;
    compiled.validate(&instance)?;
    Ok(())
}
```

### 6.2 Value Validation

**REQ-VAL-004**: The system SHALL validate logical constraints:
- `n_files >= 0`
- `depth >= 0`
- `verbosity` in range 0-2
- `dryrun` in range 0-2
- `copy_move` in range 0-9
- `col_percent` in range 0-100
- Date strings match format YYYY-MM-DD
- `since` date is before `until` date (if both specified)

**REQ-VAL-005**: Validation SHALL occur:
- After loading from file
- Before saving to file
- After CLI parsing
- After GUI input

**REQ-VAL-006**: Validation errors SHALL return a list of all errors found, not just the first error.

Example:
```rust
impl Configuration {
    fn validate(&self) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();

        if self.depth < 0 {
            errors.push(ValidationError::new("depth must be >= 0"));
        }

        if self.n_files < 0 {
            errors.push(ValidationError::new("n_files must be >= 0"));
        }

        if !errors.is_empty() {
            return Err(errors);
        }

        Ok(())
    }
}
```

### 6.3 Path Validation

**REQ-VAL-007**: Path validation SHALL check:
- Input paths exist (optional: warn vs error)
- Input paths are readable
- Subfolder exists within repository (for single-repo mode)
- Output directory is writable
- File patterns are valid glob syntax

**REQ-VAL-008**: Path validation SHALL be explicit, not automatic:
- Provide separate `validate_paths()` method
- Don't validate during deserialization
- Allow loading configuration with invalid paths (they may become valid later)

---

## 7. Error Handling Requirements

### 7.1 Error Types

**REQ-ERR-001**: Define explicit error types for all failure modes:

```rust
#[derive(Debug, thiserror::Error)]
enum ConfigError {
    #[error("Failed to read file {path}: {source}")]
    ReadError {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Failed to write file {path}: {source}")]
    WriteError {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Invalid JSON in {path}: {source}")]
    JsonParseError {
        path: PathBuf,
        source: serde_json::Error,
    },

    #[error("Schema validation failed: {errors:?}")]
    ValidationError {
        errors: Vec<String>,
    },

    #[error("Configuration file not found: {path}")]
    FileNotFound {
        path: PathBuf,
    },

    #[error("Invalid configuration: {errors:?}")]
    InvalidConfig {
        errors: Vec<String>,
    },

    #[error("Invalid path: {path}")]
    InvalidPath {
        path: PathBuf,
    },
}
```

**REQ-ERR-002**: All file I/O operations SHALL return `Result<T, ConfigError>`.

**REQ-ERR-003**: Errors SHALL include full context:
- Which file operation failed
- The file path involved
- The underlying error cause
- Suggestions for resolution (where applicable)

### 7.2 Error Recovery

**REQ-ERR-004**: The system SHALL provide fallback strategies:

```rust
enum LoadStrategy {
    Strict,        // Return error on any failure
    DefaultOnError, // Return default config on error
}

fn load_with_strategy(strategy: LoadStrategy) -> Result<Configuration, ConfigError> {
    match load() {
        Ok(config) => Ok(config),
        Err(e) => match strategy {
            LoadStrategy::Strict => Err(e),
            LoadStrategy::DefaultOnError => {
                log::warn!("Failed to load config, using defaults: {}", e);
                Ok(Configuration::default())
            }
        }
    }
}
```

**REQ-ERR-005**: Error recovery SHALL be explicit in the API:
- `load()` returns `Result` (explicit handling required)
- `load_or_default()` returns `Configuration` (errors logged, defaults used)
- No silent failures

### 7.3 User-Facing Error Messages

**REQ-ERR-006**: Error messages SHALL be:
- Clear and actionable
- Include the problematic value
- Suggest fixes where possible
- Different for CLI (detailed) vs GUI (concise)

Example:
```rust
impl ConfigError {
    fn user_message(&self, interface: Interface) -> String {
        match (self, interface) {
            (ConfigError::FileNotFound { path }, Interface::CLI) => {
                format!(
                    "Configuration file not found: {}\n\
                     Use --save to create a new configuration file.",
                    path.display()
                )
            }
            (ConfigError::FileNotFound { .. }, Interface::GUI) => {
                "Configuration file not found. Click 'Save' to create one.".to_string()
            }
            // ... other cases
        }
    }
}
```

---

## 8. Serialization Requirements

### 8.1 JSON Format

**REQ-SER-001**: Use JSON for serialization because:
- Human-readable and editable
- Well-supported across languages
- Easy to diff in version control

**REQ-SER-002**: JSON output SHALL be:
- Formatted with 4-space indentation
- Keys sorted alphabetically
- Pretty-printed for readability

```rust
fn serialize_config(config: &Configuration) -> Result<String, ConfigError> {
    let json = serde_json::to_string_pretty(config)?;
    // Consider using a custom serializer that sorts keys
    Ok(json)
}
```

### 8.2 Serialization Behavior

**REQ-SER-003**: Empty lists SHALL serialize as `[]`, not be omitted.

**REQ-SER-004**: Optional values:
- `None` SHALL serialize as empty string `""` or be omitted
- Consider using `#[serde(skip_serializing_if = "Option::is_none")]`

**REQ-SER-005**: Enums SHALL serialize as lowercase strings:
```json
{
  "fix": "prefix",
  "view": "auto",
  "blame_exclusions": "hide"
}
```

**REQ-SER-006**: Dates SHALL serialize as ISO 8601 format: `"2025-11-21"`

**REQ-SER-007**: Paths SHALL serialize as POSIX format (forward slashes):
```json
{
  "input_paths": ["/home/user/repos/project"],
  "subfolder": "src/components"
}
```

### 8.3 Deserialization Behavior

**REQ-SER-008**: Deserialization SHALL be lenient where safe:
- Accept both POSIX and Windows path separators (normalize internally)
- Accept uppercase or lowercase enum values
- Trim whitespace from strings

**REQ-SER-009**: Deserialization SHALL be strict where necessary:
- Reject unknown fields
- Reject incorrect types
- Reject out-of-range numeric values

**REQ-SER-010**: Missing fields SHALL use defaults defined in code, not hardcoded JSON.

---

## 9. CLI Integration

### 9.1 Argument Parsing

**REQ-CLI-001**: Use a CLI parsing library (e.g., `clap` in Rust) with:
- Automatic help generation
- Type validation
- Subcommands or mutually exclusive groups
- Default value display

**REQ-CLI-002**: CLI arguments SHALL map directly to Configuration fields:
```rust
#[derive(Parser)]
struct Cli {
    /// Input repository paths
    #[arg(short = 'i', long = "input", value_name = "PATH")]
    input_paths: Vec<PathBuf>,

    /// Subdirectory nesting depth
    #[arg(short = 'd', long = "depth", default_value = "5")]
    depth: u32,

    // ... other fields
}
```

**REQ-CLI-003**: CLI-only flags SHALL be separate from shared configuration:
```rust
#[derive(Parser)]
struct Cli {
    #[command(flatten)]
    config: ConfigArgs,  // Shared configuration options

    /// Save current settings
    #[arg(long)]
    save: bool,

    /// Load settings from file
    #[arg(long, value_name = "PATH")]
    load: Option<PathBuf>,

    /// Reset to default settings
    #[arg(long)]
    reset: bool,

    /// Show current settings
    #[arg(long)]
    show: bool,
}
```

### 9.2 CLI Workflow

**REQ-CLI-004**: CLI execution flow SHALL be:

1. Parse command-line arguments
2. Load configuration from file (unless `--reset`)
3. Override loaded configuration with CLI arguments
4. Validate combined configuration
5. Execute command (save/load/show/run)
6. Optionally save configuration if `--save` specified

**REQ-CLI-005**: Mutually exclusive operations:
- `--run` and `--gui` are mutually exclusive
- `--reset` overrides loaded configuration
- `--load` specifies alternative configuration file

**REQ-CLI-006**: Argument precedence (highest to lowest):
1. CLI arguments
2. Loaded configuration file
3. Default values

Example:
```rust
fn build_config(cli: Cli) -> Result<Configuration, ConfigError> {
    let mut config = if cli.reset {
        Configuration::default()
    } else if let Some(path) = cli.load {
        Configuration::load_from(&path)?
    } else {
        Configuration::load_or_default()
    };

    // Override with CLI arguments
    config = config.merge_with_cli(cli.config);
    config.validate()?;

    Ok(config)
}
```

### 9.3 CLI Output

**REQ-CLI-007**: CLI SHALL provide clear feedback:
```
Settings loaded from /path/to/settings.json
Settings saved to /path/to/settings.json
Settings reset to defaults
```

**REQ-CLI-008**: `--show` output SHALL display all current settings in readable format:
```
Current Configuration:
  input-paths        : /home/user/repos/project
  depth              : 5
  subfolder          : src
  output-base        : gitinspect
  file-formats       : html, excel
  ...
```

---

## 10. GUI Integration

### 10.1 GUI Data Binding

**REQ-GUI-001**: GUI form fields SHALL map to Configuration struct fields.

**REQ-GUI-002**: Provide bidirectional conversion:
```rust
impl Configuration {
    fn to_gui_values(&self) -> HashMap<String, GuiValue> {
        // Convert Configuration to GUI widget values
    }

    fn from_gui_values(values: &HashMap<String, GuiValue>) -> Result<Self, ConfigError> {
        // Convert GUI widget values to Configuration
    }
}
```

**REQ-GUI-003**: Array fields in GUI SHALL use comma-separated strings:
- Display: `vec!["*.rs", "*.toml"]` → `"*.rs, *.toml"`
- Parse: `"*.rs, *.toml"` → `vec!["*.rs", "*.toml"]`
- Trim whitespace from each element

**REQ-GUI-004**: Boolean fields SHALL use checkboxes.

**REQ-GUI-005**: Enum fields SHALL use:
- Radio buttons for mutually exclusive options (FixType, ViewMode)
- Checkboxes for multi-select (FileFormat list)

### 10.2 GUI Validation

**REQ-GUI-006**: GUI SHALL validate input in real-time:
- Invalid input fields SHALL be highlighted (e.g., red background)
- Valid input fields SHALL return to normal appearance
- Validation messages SHALL appear near the invalid field

**REQ-GUI-007**: Path validation SHALL occur on blur/change:
- Non-existent paths: orange/yellow background (warning)
- Unreadable paths: red background (error)
- Valid paths: normal appearance

**REQ-GUI-008**: Save button SHALL be disabled if configuration is invalid.

### 10.3 GUI State Management

**REQ-GUI-009**: Configuration loading SHALL update all GUI widgets:
```rust
fn update_gui_from_config(&mut self, config: &Configuration) {
    for (key, value) in config.to_gui_values() {
        self.window.update_element(&key, value);
    }
}
```

**REQ-GUI-010**: GUI state SHALL be immutable:
- Don't mutate configuration directly from events
- Build new configuration on save/apply
- Revert to previous configuration on cancel

### 10.4 GUI File Dialogs

**REQ-GUI-011**: Save/Load dialogs SHALL:
- Default to the configuration directory
- Filter to JSON files (`*.json`)
- Remember last used directory
- Show full path in dialog title

**REQ-GUI-012**: Settings file display SHALL support:
- Short mode: Show filename only (`settings.json`)
- Full mode: Show absolute path (`/home/user/.config/app/settings.json`)
- Toggle between modes with a button

---

## 11. Type Safety Requirements

### 11.1 Compile-Time Guarantees

**REQ-TYPE-001**: Use the type system to prevent invalid states:

```rust
// Instead of:
struct BadConfig {
    copy_move: i32,  // Could be -100 or 1000
}

// Use:
struct GoodConfig {
    copy_move: CopyMoveLevel,  // Bounded type
}

#[derive(Debug, Clone, Copy)]
struct CopyMoveLevel(u8);

impl CopyMoveLevel {
    fn new(value: u8) -> Result<Self, ConfigError> {
        if value <= 9 {
            Ok(Self(value))
        } else {
            Err(ConfigError::InvalidValue {
                field: "copy_move",
                value: value.to_string(),
                constraint: "must be 0-9",
            })
        }
    }
}
```

**REQ-TYPE-002**: Use newtype patterns for semantically distinct values:
```rust
struct InputPath(PathBuf);
struct OutputPath(PathBuf);
struct Subfolder(String);
struct FilePattern(String);
```

This prevents accidentally using an output path where an input path is expected.

**REQ-TYPE-003**: Use builder pattern for complex configuration construction:
```rust
impl Configuration {
    fn builder() -> ConfigurationBuilder {
        ConfigurationBuilder::default()
    }
}

struct ConfigurationBuilder {
    // Fields with Option<T> or defaults
}

impl ConfigurationBuilder {
    fn input_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.input_paths = Some(paths);
        self
    }

    fn depth(mut self, depth: u32) -> Self {
        self.depth = Some(depth);
        self
    }

    fn build(self) -> Result<Configuration, ConfigError> {
        let config = Configuration {
            input_paths: self.input_paths.unwrap_or_default(),
            depth: self.depth.unwrap_or(DEFAULT_DEPTH),
            // ...
        };
        config.validate()?;
        Ok(config)
    }
}
```

### 11.2 Runtime Safety

**REQ-TYPE-004**: Avoid unwrap/expect in library code:
- Use `?` operator to propagate errors
- Return `Result` or `Option`
- Only panic on programming errors (not user errors)

**REQ-TYPE-005**: Use NonZero types where appropriate:
```rust
use std::num::NonZeroU32;

struct Configuration {
    max_files: Option<NonZeroU32>,  // None = unlimited
}
```

---

## 12. Testing Requirements

### 12.1 Unit Tests

**REQ-TEST-001**: Test configuration serialization/deserialization:
```rust
#[test]
fn test_config_roundtrip() {
    let config = Configuration::default();
    let json = serde_json::to_string(&config).unwrap();
    let parsed: Configuration = serde_json::from_str(&json).unwrap();
    assert_eq!(config, parsed);
}
```

**REQ-TEST-002**: Test validation logic:
```rust
#[test]
fn test_invalid_depth_rejected() {
    let mut config = Configuration::default();
    config.depth = -1;  // Should not compile if using u32
    assert!(config.validate().is_err());
}
```

**REQ-TEST-003**: Test normalization:
```rust
#[test]
fn test_paths_normalized() {
    let config = Configuration {
        input_paths: vec!["./foo/bar".into(), "../baz".into()],
        ..Default::default()
    };
    let normalized = config.normalize();
    assert!(normalized.input_paths.iter().all(|p| p.is_absolute()));
}
```

**REQ-TEST-004**: Test default values:
```rust
#[test]
fn test_defaults() {
    let config = Configuration::default();
    assert_eq!(config.depth, DEFAULT_DEPTH);
    assert_eq!(config.extensions, DEFAULT_EXTENSIONS);
}
```

### 12.2 Integration Tests

**REQ-TEST-005**: Test file I/O operations:
```rust
#[test]
fn test_save_and_load() {
    let temp_dir = tempfile::tempdir().unwrap();
    let config_path = temp_dir.path().join("test.json");

    let config = Configuration::default();
    config.save_to(&config_path).unwrap();

    let loaded = Configuration::load_from(&config_path).unwrap();
    assert_eq!(config, loaded);
}
```

**REQ-TEST-006**: Test error handling:
```rust
#[test]
fn test_load_missing_file_returns_error() {
    let result = Configuration::load_from("/nonexistent/path.json");
    assert!(matches!(result, Err(ConfigError::FileNotFound { .. })));
}
```

**REQ-TEST-007**: Test CLI integration:
```rust
#[test]
fn test_cli_overrides_config() {
    let config = Configuration { depth: 5, ..Default::default() };
    let cli = Cli { depth: Some(10), ..Default::default() };
    let merged = config.merge_with_cli(cli);
    assert_eq!(merged.depth, 10);
}
```

### 12.3 Property-Based Tests

**REQ-TEST-008**: Use property-based testing for validation:
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_valid_config_serializes(
        depth in 0u32..100,
        verbosity in 0u8..=2,
    ) {
        let config = Configuration {
            depth,
            verbosity,
            ..Default::default()
        };
        let json = serde_json::to_string(&config)?;
        let parsed: Configuration = serde_json::from_str(&json)?;
        prop_assert_eq!(config, parsed);
    }
}
```

### 12.4 Test Coverage

**REQ-TEST-009**: Aim for minimum 80% code coverage on:
- Configuration struct methods
- Serialization/deserialization
- Validation logic
- File I/O operations

**REQ-TEST-010**: Test error paths, not just happy paths.

---

## 13. Rust-Specific Implementation Guidance

### 13.1 Recommended Crates

**REQ-RUST-001**: Use these crates for implementation:

| Purpose | Crate | Rationale |
|---------|-------|-----------|
| CLI parsing | `clap` (derive API) | Type-safe, automatic help, widely used |
| Serialization | `serde`, `serde_json` | De facto standard for Rust serialization |
| Schema validation | `schemars`, `jsonschema` | Automatic schema generation, validation |
| Config directories | `directories` or `dirs` | Cross-platform config paths |
| Error handling | `thiserror` | Ergonomic error type derivation |
| Logging | `log`, `env_logger` | Standard logging facade |
| Date/time | `chrono` | Parse and format dates |
| Path globbing | `glob` or `globset` | Pattern matching for file paths |

### 13.2 Derive Macros

**REQ-RUST-002**: Use derive macros for common traits:
```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
struct Configuration {
    // fields
}
```

**REQ-RUST-003**: Use serde attributes for customization:
```rust
#[derive(Serialize, Deserialize)]
struct Configuration {
    #[serde(default = "default_depth")]
    depth: u32,

    #[serde(skip_serializing_if = "Option::is_none")]
    since: Option<String>,

    #[serde(rename = "output_base")]
    output_file_base: String,
}
```

### 13.3 Module Structure

**REQ-RUST-004**: Organize code into logical modules:
```
src/
  config/
    mod.rs           # Public API
    types.rs         # Configuration struct
    defaults.rs      # Default constants
    validation.rs    # Validation logic
    normalization.rs # Input normalization
    cli.rs           # CLI-specific extensions
    gui.rs           # GUI-specific extensions
  persistence/
    mod.rs           # Public API
    file_manager.rs  # File I/O operations
    schema.rs        # Schema validation
    location.rs      # Location file management
  error.rs           # Error types
  lib.rs             # Library root
```

### 13.4 API Design

**REQ-RUST-005**: Provide both builder and direct construction:
```rust
// Builder pattern
let config = Configuration::builder()
    .input_paths(vec!["/path/to/repo".into()])
    .depth(10)
    .verbosity(2)
    .build()?;

// Direct construction
let config = Configuration {
    input_paths: vec!["/path/to/repo".into()],
    depth: 10,
    verbosity: 2,
    ..Default::default()
};
```

**REQ-RUST-006**: Implement conversions using From/TryFrom traits:
```rust
impl TryFrom<Cli> for Configuration {
    type Error = ConfigError;

    fn try_from(cli: Cli) -> Result<Self, Self::Error> {
        // Convert CLI args to Configuration
    }
}
```

**REQ-RUST-007**: Use method chaining for transformations:
```rust
let config = Configuration::load()?
    .normalize()
    .validate()?
    .with_verbosity(2);
```

### 13.5 Ownership and Lifetimes

**REQ-RUST-008**: Prefer owned data in Configuration:
- Use `String` not `&str`
- Use `PathBuf` not `&Path`
- Use `Vec<T>` not `&[T]`

This simplifies serialization and allows the configuration to be moved freely.

**REQ-RUST-009**: Return borrowed data from getters:
```rust
impl Configuration {
    pub fn input_paths(&self) -> &[PathBuf] {
        &self.input_paths
    }
}
```

### 13.6 Immutability Patterns

**REQ-RUST-010**: Prefer immutable transformations:
```rust
impl Configuration {
    // Instead of:
    fn set_depth(&mut self, depth: u32) {
        self.depth = depth;
    }

    // Prefer:
    fn with_depth(mut self, depth: u32) -> Self {
        self.depth = depth;
        self
    }
}
```

**REQ-RUST-011**: For expensive operations, provide both mutable and consuming methods:
```rust
impl Configuration {
    // Consuming (move)
    fn normalize(mut self) -> Self {
        self.normalize_in_place();
        self
    }

    // Mutable (borrow)
    fn normalize_in_place(&mut self) {
        self.input_paths = normalize_paths(&self.input_paths);
        // ...
    }
}
```

---

## 14. Reference Implementation Analysis

This architecture is based on the Python implementation in `gitinspectorgui` with improvements to address identified weaknesses.

### 14.1 What Works Well (Keep)

1. **Dataclass-based design** → Rust structs with derive macros
2. **JSON schema validation** → `schemars` + `jsonschema`
3. **Location file indirection** → Supports custom config locations
4. **Normalization layer** → Clean user input before use
5. **CLI/GUI separation** → Distinct option sets for each interface

### 14.2 Issues Addressed (Improve)

| Issue | Python Implementation | Rust Improvement |
|-------|----------------------|------------------|
| KeysArgs duplication | Manual string constants for each field | Automatic via proc macros or reflection |
| Mixed error handling | Tuple returns + silent failures | Explicit Result types, no silent failures |
| Mutable operations | `from_values_dict()` mutates self | Immutable transformations |
| Normalize called multiple times | Called in init, load, save | Called once during construction |
| Schema property count | Hardcoded `minProperties: 33` | Auto-generated from struct |
| Silent defaults | Empty extensions → defaults | Use Option<Vec<T>> to distinguish |
| Type safety | Runtime validation only | Compile-time + runtime validation |
| Validation scattered | Split across multiple files | Centralized in `validation.rs` |
| Load recursion | `get_location_path()` calls itself | Explicit create_if_missing parameter |

### 14.3 Key Architectural Decisions

**Decision 1**: Use dataclasses/structs as single source of truth
- **Rationale**: Type safety, automatic serialization, IDE support
- **Trade-off**: Less dynamic than dictionaries, but safer

**Decision 2**: Separate location file from settings file
- **Rationale**: Allows custom config locations without hardcoding paths
- **Trade-off**: Two files to manage, but more flexible

**Decision 3**: JSON for configuration format
- **Rationale**: Human-readable, widely supported, easy to diff
- **Alternative considered**: TOML (better for humans), YAML (more complex)

**Decision 4**: Explicit validation after loading
- **Rationale**: Separates parsing from validation, better error messages
- **Trade-off**: Extra step, but clearer error handling

**Decision 5**: Immutable transformations
- **Rationale**: Easier to reason about, prevents accidental mutations
- **Trade-off**: More memory copies, but negligible for config size

### 14.4 Migration Path

For teams migrating from the Python implementation:

1. **Phase 1**: Port data structures
   - Define Configuration struct
   - Implement serialization
   - Write unit tests

2. **Phase 2**: Port file I/O
   - Implement load/save operations
   - Add schema validation
   - Test with existing JSON files

3. **Phase 3**: Port CLI integration
   - Define CLI argument struct
   - Implement CLI→Config conversion
   - Test argument precedence

4. **Phase 4**: Port GUI integration
   - Define GUI value conversions
   - Implement bidirectional binding
   - Test with real GUI framework

5. **Phase 5**: Polish and optimize
   - Add better error messages
   - Optimize hot paths
   - Add integration tests

---

## Appendix A: Example Configuration File

```json
{
  "blame_exclusions": "hide",
  "blame_skip": false,
  "col_percent": 75,
  "comments": false,
  "copy_move": 1,
  "deletions": false,
  "depth": 5,
  "dryrun": 0,
  "empty_lines": false,
  "ex_authors": [],
  "ex_emails": [],
  "ex_files": [],
  "ex_messages": [],
  "ex_revisions": [],
  "extensions": ["c", "cc", "cpp", "h", "hpp", "java", "js", "py", "rb", "sql", "ts"],
  "file_formats": ["html"],
  "fix": "prefix",
  "gui_settings_full_path": false,
  "include_files": [],
  "input_fstrs": ["/home/user/repos/myproject"],
  "multicore": false,
  "multithread": true,
  "n_files": 5,
  "outfile_base": "gitinspect",
  "profile": 0,
  "scaled_percentages": false,
  "show_renames": false,
  "since": "",
  "subfolder": "",
  "until": "",
  "verbosity": 0,
  "view": "auto",
  "whitespace": false
}
```

---

## Appendix B: Example Location File

```json
{
  "settings_location": "/home/user/.config/appname/appname.json"
}
```

---

## Appendix C: Validation Error Examples

### Good Error Messages

```
Configuration validation failed:
  - depth: must be >= 0 (got: -5)
  - copy_move: must be between 0-9 (got: 15)
  - since: invalid date format "2025-13-01" (expected: YYYY-MM-DD)
  - input_paths: path does not exist: /nonexistent/path
```

### Bad Error Messages (Avoid)

```
Invalid configuration
Validation failed
Error: -5
```

---

## Appendix D: CLI Help Output Example

```
Git Repository Analyzer

Usage: gitanalyzer [OPTIONS] --input <PATH>...

Options:
  -i, --input <PATH>...          Input repository paths
  -d, --depth <N>                Subdirectory nesting depth [default: 5]
  -o, --output <FILE_BASE>       Output file base name [default: gitinspect]
      --subfolder <PATH>         Analyze only this subfolder
  -n, --n-files <N>              Number of top files to show [default: 5]
  -f, --include-files <PATTERN>  File patterns to include
  -F, --file-formats <FORMAT>    Output formats [possible values: html, excel]
      --view <MODE>              View mode [default: auto] [possible values: auto, dynamic-blame-history, none]
      --since <DATE>             Start date (YYYY-MM-DD)
      --until <DATE>             End date (YYYY-MM-DD)
  -v, --verbosity <LEVEL>        Logging level [default: 0] [possible values: 0, 1, 2]
  -e, --extensions <EXT>...      File extensions to analyze
      --show-renames             Show file rename history
      --deletions                Include deletion statistics
      --multithread              Enable multithreading
      --multicore                Enable multicore processing

Settings:
      --save                     Save current settings
      --save-as <PATH>           Save settings to file
      --load <PATH>              Load settings from file
      --reset                    Reset to default settings
      --reset-file               Reset settings file location
      --show                     Show current settings

  -h, --help                     Print help
  -V, --version                  Print version
```

---

## Appendix E: Glossary

- **Configuration**: The complete set of options used to run the application
- **Settings**: Synonym for configuration, often referring to the persisted state
- **Location File**: A JSON file that stores the path to the active settings file
- **Settings File**: A JSON file that stores the actual configuration values
- **Normalization**: Cleaning and standardizing user input (trim, absolute paths, etc.)
- **Validation**: Checking that configuration values meet logical constraints
- **Schema Validation**: Checking that JSON structure matches expected format
- **CLI**: Command-Line Interface
- **GUI**: Graphical User Interface
- **Atomic Write**: Writing to a temp file then renaming to prevent corruption

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-21 | Analysis Team | Initial version based on gitinspectorgui analysis |

---

## End of Document

For questions or clarifications about this requirements document, please refer to the original Python implementation analysis or contact the architecture team.
