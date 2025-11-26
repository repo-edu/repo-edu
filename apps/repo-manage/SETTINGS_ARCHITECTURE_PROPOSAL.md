# Settings Architecture Proposal for repobee-tauri

**Based on analysis of gitinspectorgui-old settings architecture**

## Executive Summary

This document proposes adopting gitinspectorgui's proven settings architecture for repobee-tauri. The architecture provides:
- **Persistent, validated settings** with JSON Schema
- **Multi-profile support** via location pointer pattern
- **Explicit save model** (no auto-save surprises)
- **Type-safe access** with structured classes/structs
- **Graceful error handling** with sensible defaults

## Current State (repobee-tauri)

Currently, repobee-tauri has:
- ❌ No persistent settings (state lost on close)
- ❌ No validation of configuration values
- ❌ No multi-course/multi-config support
- ❌ Form state only exists in React component memory
- ✅ Good: Clean separation between Canvas and Git configs

## Proposed Architecture (from gitinspectorgui)

### 1. Storage Structure

**Location:** Platform-specific config directories
- macOS: `~/Library/Application Support/repobee-tauri/`
- Linux: `~/.config/repobee-tauri/`
- Windows: `%APPDATA%\repobee-tauri\`

**Files (inside the platform-specific config directory):**

**Basic setup:**
```
~/Library/Application Support/repobee-tauri/  (macOS example)
├── repobee.json              # Main settings file
└── repobee-location.json     # Points to active profile (optional)
```

**With multi-profile support:**
```
~/Library/Application Support/repobee-tauri/  (macOS example)
├── repobee.json              # Default/current settings
├── repobee-location.json     # Points to active profile
└── profiles/
    ├── default.json
    ├── course-2024-fall.json
    └── course-2024-spring.json
```

**On Linux:**
```
~/.config/repobee-tauri/
├── repobee.json
├── repobee-location.json
└── profiles/
    └── ...
```

**On Windows:**
```
%APPDATA%\repobee-tauri\
├── repobee.json
├── repobee-location.json
└── profiles\
    └── ...
```

### 2. Settings Structure

**Three-tier hierarchy:**

```rust
// Base settings (shared by all)
struct CommonSettings {
    // Canvas settings
    canvas_base_url: String,
    canvas_access_token: String,
    canvas_course_id: Option<u64>,
    canvas_course_name: String,
    canvas_yaml_file: String,
    canvas_info_folder: String,
    canvas_member_option: MemberOption,
    canvas_include_group: bool,
    canvas_include_member: bool,
    canvas_include_initials: bool,
    canvas_full_groups: bool,

    // Git platform settings
    git_platform: String,  // "github", "gitlab", "gitea", "local"
    git_base_url: String,
    git_access_token: String,
    git_user: String,
    git_org: String,
    git_template_group: String,

    // Local settings
    yaml_file: String,
    target_folder: String,
    assignments: String,

    // Options
    directory_layout: String,
    log_info: bool,
    log_debug: bool,
    log_warning: bool,
    log_error: bool,
}

// GUI-specific settings (extends common)
struct GuiSettings {
    common: CommonSettings,

    // GUI-only fields
    window_geometry: WindowGeometry,
    active_tab: String,  // "canvas" or "repo"
    config_locked: bool,
    options_locked: bool,
}

// CLI-specific settings (extends common)
struct CliSettings {
    common: CommonSettings,

    // CLI-only flags
    verbose: bool,
    quiet: bool,
    dry_run: bool,
    force: bool,
}
```

### 3. Settings Management

**Rust backend module:** `repobee-core/src/settings.rs`

```rust
pub struct SettingsManager {
    config_dir: PathBuf,
    current_profile: String,
}

impl SettingsManager {
    pub fn new() -> Result<Self>;
    pub fn load() -> Result<GuiSettings>;
    pub fn save(&self, settings: &GuiSettings) -> Result<()>;
    pub fn reset_to_defaults() -> GuiSettings;
    pub fn validate(&self, settings: &GuiSettings) -> Result<()>;
    pub fn list_profiles() -> Vec<String>;
    pub fn switch_profile(&mut self, name: &str) -> Result<()>;
}
```

**Tauri commands:**
```rust
#[tauri::command]
async fn load_settings() -> Result<GuiSettings, String>;

#[tauri::command]
async fn save_settings(settings: GuiSettings) -> Result<(), String>;

#[tauri::command]
async fn reset_settings() -> Result<GuiSettings, String>;
```

### 4. Persistence Model

**Explicit Save (NOT auto-save):**
- User clicks "Save Settings" button
- Changes are validated before saving
- Success/error feedback shown
- Prevents accidental overwrites

**Load sequence:**
1. Check for settings file
2. If missing → create from defaults + show warning
3. If exists → load, validate with JSON Schema
4. If invalid → try to repair, fallback to defaults
5. Return settings to frontend

### 5. UI Integration

**Settings Button/Menu:**
```
[Canvas Import] [Repository Setup] [⚙️ Settings]
```

**Settings Dialog:**
- Shows all settings in organized groups
- Allows editing
- "Save" button to persist
- "Reset to Defaults" button
- "Cancel" button to discard changes

**OR integrate into existing UI:**
- Settings automatically save when clicking "Save" in Settings dialog
- Load settings on app start
- Show "Unsaved changes" indicator

### 6. JSON Schema Validation

Example schema for validation:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "canvas_base_url": {
      "type": "string",
      "format": "uri",
      "description": "Canvas LMS base URL"
    },
    "canvas_course_id": {
      "type": ["integer", "null"],
      "minimum": 1
    },
    "git_platform": {
      "type": "string",
      "enum": ["github", "gitlab", "gitea", "local"]
    }
  },
  "required": ["canvas_base_url", "git_platform"]
}
```

### 7. Default Values

```rust
impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            canvas_base_url: "https://canvas.tue.nl".to_string(),
            canvas_access_token: String::new(),
            canvas_course_id: None,
            canvas_yaml_file: "students.yaml".to_string(),
            canvas_member_option: MemberOption::Both,
            canvas_include_group: true,
            canvas_include_member: true,
            canvas_include_initials: false,
            canvas_full_groups: true,

            git_platform: "gitlab".to_string(),
            git_base_url: "https://gitlab.tue.nl".to_string(),
            git_access_token: String::new(),
            git_user: String::new(),
            git_org: String::new(),
            git_template_group: String::new(),

            yaml_file: "students.yaml".to_string(),
            target_folder: String::new(),
            assignments: String::new(),
            directory_layout: "flat".to_string(),

            log_info: true,
            log_debug: false,
            log_warning: true,
            log_error: true,
        }
    }
}
```

## Key Design Patterns

### Pattern 1: Location Pointer
**Problem:** User wants multiple profiles (different courses, different semesters)
**Solution:** `repobee-location.json` points to active profile

### Pattern 2: Two-File Approach
**Problem:** Complex apps need modular config
**Solution:** Main settings + location pointer

### Pattern 3: Normalize on Save
**Problem:** Cross-platform path differences
**Solution:** Convert all paths to POSIX format on save, native on load

### Pattern 4: Explicit Save
**Problem:** User accidentally overwrites settings
**Solution:** Require explicit "Save" button click

### Pattern 5: Graceful Degradation
**Problem:** Corrupted or missing settings file
**Solution:** Load defaults + show warning, never crash

### Pattern 6: JSON Schema Validation
**Problem:** Invalid data causes runtime errors
**Solution:** Validate on load and save, reject invalid data

### Pattern 7: Three-Tier Hierarchy
**Problem:** GUI and CLI have different needs
**Solution:** Common base + GUI/CLI specific extensions

### Pattern 8: Type-Safe Access
**Problem:** Typos in settings keys cause bugs
**Solution:** Use enums/constants for all settings keys

## Implementation Roadmap

### Phase 1: Basic Settings (Week 1)
- [ ] Create `repobee-core/src/settings.rs` module
- [ ] Define `CommonSettings` struct with serde
- [ ] Implement `SettingsManager` with load/save
- [ ] Add Tauri commands for settings
- [ ] Create config directory on first run
- [ ] Load settings on app start
- [ ] Display settings in UI (read-only)

### Phase 2: Persistence (Week 2)
- [ ] Add "Save Settings" button to UI
- [ ] Implement explicit save workflow
- [ ] Add validation before save
- [ ] Show success/error feedback
- [ ] Handle missing/corrupted files gracefully
- [ ] Add "Reset to Defaults" button

### Phase 3: JSON Schema (Week 3)
- [ ] Add jsonschema crate
- [ ] Define schema for all settings
- [ ] Validate on load and save
- [ ] Generate TypeScript types from schema
- [ ] Add schema documentation

### Phase 4: Multi-Profile (Week 4)
- [ ] Implement location pointer pattern
- [ ] Add profile management UI
- [ ] Create/delete/switch profiles
- [ ] Import/export profiles
- [ ] Set default profile

## Benefits Over Current Approach

| Feature | Current | Proposed |
|---------|---------|----------|
| Settings persist | ❌ Lost on close | ✅ Saved to disk |
| Validation | ❌ None | ✅ JSON Schema |
| Multi-config | ❌ No | ✅ Yes (profiles) |
| Error handling | ⚠️ Basic | ✅ Graceful degradation |
| Type safety | ⚠️ React state only | ✅ Rust + TypeScript |
| Cross-platform | ⚠️ Hardcoded paths | ✅ Platform-specific |
| Import/Export | ❌ No | ✅ Yes (JSON files) |
| Defaults | ⚠️ Hardcoded in UI | ✅ Centralized |
| CLI support | ❌ No | ✅ Shared settings |

## Recommended Rust Crates

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
jsonschema = "0.25"  # JSON Schema validation
dirs = "5"           # Platform-specific directories
```

## Additional Improvements

Beyond gitinspectorgui's architecture, I recommend:

### 1. Settings Presets
```rust
pub enum SettingsPreset {
    TUE_Canvas_GitLab,    // TU/e specific defaults
    GitHub_Generic,        // GitHub defaults
    Local_Testing,         // Local filesystem for testing
}
```

### 2. Settings Migration
```rust
// Handle version upgrades gracefully
pub fn migrate_settings(old_version: u32, settings: &mut Settings) -> Result<()>;
```

### 3. Settings Export/Import
```rust
#[tauri::command]
async fn export_settings(path: String) -> Result<(), String>;

#[tauri::command]
async fn import_settings(path: String) -> Result<GuiSettings, String>;
```

### 4. Settings Diff/Compare
```rust
// Show what changed before saving
pub fn diff_settings(old: &Settings, new: &Settings) -> Vec<SettingChange>;
```

### 5. Encrypted Secrets
```rust
// Encrypt access tokens in settings file
pub struct SecretString(String);

impl SecretString {
    pub fn encrypt(&self, key: &[u8]) -> Vec<u8>;
    pub fn decrypt(data: &[u8], key: &[u8]) -> Result<Self>;
}
```

## Files to Review

I've created detailed analysis documents in the repobee-tauri folder:

1. **SETTINGS_ARCHITECTURE_ANALYSIS.md** (32 KB)
   - Complete technical analysis of gitinspectorgui architecture
   - Code examples and flow diagrams
   - All 10 focus areas covered

2. **SETTINGS_ANALYSIS_SUMMARY.txt** (12 KB)
   - High-level overview
   - Key findings and recommendations

3. **SETTINGS_QUICK_REFERENCE.md** (12 KB)
   - Quick lookup reference
   - Code patterns and examples
   - Rust implementation guidance

4. **SETTINGS_ARCHITECTURE_PROPOSAL.md** (this file)
   - Executive summary for decision-making
   - Implementation roadmap
   - Benefits comparison

## Decision Points

Please review and decide:

1. **Adopt this architecture?** Yes/No
2. **Implementation timeline?** Phase 1 only / All phases / Custom
3. **Multi-profile support?** Yes/No/Later
4. **JSON Schema validation?** Yes/No (recommended: Yes)
5. **Encrypted secrets?** Yes/No (recommended: Yes for production)
6. **Settings presets?** Yes/No (recommended: Yes for TU/e)
7. **Import/Export?** Yes/No (recommended: Yes)

## Next Steps

If approved:
1. I'll implement Phase 1 (basic settings persistence)
2. Create settings module in repobee-core
3. Add Tauri commands
4. Update UI to load/save settings
5. Test with existing Canvas and Repo workflows

Please review the documents and let me know if you'd like me to proceed with implementation!
