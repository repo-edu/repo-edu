# Settings Architecture - Quick Reference Guide

## Architecture Overview

```
gitinspectorgui-old (Python GUI + CLI)
│
├── Settings Storage (Persistent)
│   ├── gitinspectorgui-location.json (pointer file)
│   └── gitinspectorgui.json (or custom location)
│
├── Settings Classes (Runtime)
│   ├── Args (base - 31 fields, shared by CLI/GUI)
│   ├── Settings extends Args (adds 1 GUI field)
│   └── CLIArgs extends Args (adds 8 CLI-specific fields)
│
├── Keys Mirror Classes (Type-safe GUI access)
│   ├── KeysArgs (mirrors Args fields)
│   └── Keys extends KeysArgs (adds GUI-specific keys)
│
├── JSON Schema (Validation)
│   └── SETTINGS_SCHEMA (33+ properties with enum/type constraints)
│
└── Main Entry Points
    ├── CLI: cli.py main() → load_settings()
    └── GUI: gui/psg.py PSGUI(settings) event loop
```

## Data Flow Diagram

### Load Flow
```
Application Start
    │
    ├─ SettingsFile.get_location_path()
    │  └─ Read gitinspectorgui-location.json
    │
    ├─ SettingsFile.load_from(path)
    │  ├─ Read JSON file
    │  ├─ Parse JSON
    │  ├─ Validate with SETTINGS_SCHEMA
    │  └─ Create Settings() object
    │
    └─ If error: Return Settings() with all defaults
```

### Save Flow
```
User clicks "Save" button
    │
    ├─ GUI event handler: keys.save
    │
    ├─ from_values_dict(values)
    │  └─ Convert PySimpleGUI values dict to Settings
    │
    ├─ normalize()
    │  ├─ Strip whitespace
    │  ├─ Split CSV to lists
    │  └─ Convert paths to POSIX
    │
    ├─ validate with SETTINGS_SCHEMA
    │
    └─ create_settings_file(path)
       ├─ Convert Settings to dict with asdict()
       └─ Write JSON to file
```

## File Storage Details

### Location: Platform-Specific Config Directories

```
macOS:
  ~/.config/gitinspectorgui/

Windows:
  C:\Users\Username\AppData\Local\gitinspectorgui\

Linux:
  ~/.config/gitinspectorgui/
```

### Location Pointer File: gitinspectorgui-location.json
```json
{
    "settings_location": "/full/path/to/gitinspectorgui.json"
}
```

**Purpose**: Allows users to maintain multiple settings files and switch between them.

### Main Settings File: gitinspectorgui.json
```json
{
    "col_percent": 75,
    "profile": 0,
    "input_fstrs": ["/path/to/repo1", "/path/to/repo2"],
    "outfile_base": "gitinspect",
    "fix": "prefix",
    "depth": 5,
    "view": "auto",
    "file_formats": ["html"],
    "extensions": ["c", "cpp", "h", "java", "js", "py"],
    "scaled_percentages": false,
    "blame_exclusions": "hide",
    "blame_skip": false,
    "subfolder": "",
    "n_files": 5,
    "include_files": [],
    "show_renames": false,
    "deletions": false,
    "whitespace": false,
    "empty_lines": false,
    "comments": false,
    "copy_move": 1,
    "verbosity": 0,
    "dryrun": 0,
    "multithread": true,
    "multicore": false,
    "since": "",
    "until": "",
    "ex_authors": [],
    "ex_emails": [],
    "ex_files": [],
    "ex_messages": [],
    "ex_revisions": [],
    "gui_settings_full_path": false
}
```

## Core Class Hierarchy

### Args (Base Class - 31 Fields)
```python
@dataclass
class Args:
    col_percent: int
    profile: int
    input_fstrs: list[str]          # Comma-separated in GUI
    outfile_base: str
    fix: str                        # "prefix", "postfix", "nofix"
    depth: int
    view: str                       # "auto", "dynamic-blame-history", "none"
    file_formats: list[str]         # ["html", "excel"]
    scaled_percentages: bool
    blame_exclusions: str           # "hide", "show", "remove"
    blame_skip: bool
    subfolder: str
    n_files: int
    include_files: list[str]
    show_renames: bool
    extensions: list[str]
    deletions: bool
    whitespace: bool
    empty_lines: bool
    comments: bool
    copy_move: int
    verbosity: int
    dryrun: int
    multithread: bool
    multicore: bool
    since: str
    until: str
    ex_files: list[str]
    ex_authors: list[str]
    ex_emails: list[str]
    ex_revisions: list[str]
    ex_messages: list[str]
```

### Settings (Args + GUI State - Extends Args)
```python
@dataclass
class Settings(Args):
    gui_settings_full_path: bool = False
    
    # Methods:
    def save()
    def save_as(path)
    def load_safe_from(file)
    def reset()
    def normalize()
    def from_values_dict(values_dict)
    def as_system() -> Settings
```

### CLIArgs (Args + CLI Flags - Extends Args)
```python
@dataclass
class CLIArgs(Args):
    reset_file: bool = False
    load: str = ""
    reset: bool = False
    save: bool = False
    save_as: str = ""
    show: bool = False
    gui: bool = False
    run: bool = False
    
    # Methods:
    def create_settings() -> Settings
    def create_args() -> Args
    def update_with_namespace(namespace)
```

## Key Classes & Methods

### SettingsFile (Static Methods for File Operations)
```python
class SettingsFile:
    # Constants
    SETTINGS_FILE_NAME = "gitinspectorgui.json"
    SETTINGS_LOCATION_FILE_NAME = "gitinspectorgui-location.json"
    SETTINGS_DIR = platformdirs.user_config_dir(...)
    
    # Validation
    SETTINGS_SCHEMA = { type, properties, additionalProperties, minProperties }
    SETTINGS_LOCATION_SCHEMA = { ... }
    
    # File Operations
    @classmethod
    def load() -> tuple[Settings, str]                    # From active location
    
    @classmethod
    def load_from(file) -> tuple[Settings, str]          # From specific file
    
    @classmethod
    def load_safe() -> Settings                          # With fallback to defaults
    
    @classmethod
    def load_safe_from(file) -> Settings                 # With fallback to defaults
    
    @classmethod
    def get_location_path() -> Path                      # Read location pointer
    
    @classmethod
    def set_location(path)                               # Update location pointer
    
    @classmethod
    def reset() -> Settings                              # Reset to default location
    
    @classmethod
    def create_location_file_for(location_dict)          # Create location pointer
```

## GUI Integration Points

### Window Elements → Settings Conversion
```
PySimpleGUI values dict (from window.read())
    │
    ├─ Input fields → strings
    ├─ CSV values → split to lists
    ├─ Checkboxes → booleans
    └─ Radio buttons → selected choice
    
        ▼
    
from_values_dict(values)
    ├─ Parse special cases (radio buttons, checkboxes, CSV)
    ├─ Convert types
    └─ Build Settings object
    
        ▼
    
Settings object (ready to save/use)
```

### Settings → Window Elements Binding
```
Settings object
    │
    ├─ as_system()                    # Convert POSIX paths to OS format
    │
    ├─ asdict(settings)               # Convert to dictionary
    │
    ├─ Exclude certain fields (fix, view, file_formats, etc.)
    │
        ▼
    
window_state_from_settings()
    ├─ Lists → comma-separated strings
    ├─ Update each element with value
    └─ Set radio buttons and checkboxes
```

## GUI Event Handlers for Settings

```python
# Save current GUI state to persistent settings
case keys.save:
    self.settings.from_values_dict(values)
    self.settings.save()

# Save to custom location and update pointer
case keys.save_as:
    destination = values[keys.save_as]
    self.settings.save_as(destination)

# Load from file and update all GUI elements
case keys.load:
    path = values[keys.load]
    self.settings.load_safe_from(path)
    SettingsFile.set_location(path)
    self.window_state_from_settings()

# Reset to defaults and recreate window
case keys.reset:
    self.settings.reset()
    self.window.close()
    recreate_window = True

# Reset to default location and recreate window
case keys.reset_file:
    SettingsFile.reset()
    self.window.close()
    recreate_window = True

# Toggle full path vs filename display
case keys.toggle_settings_file:
    self.gui_settings_full_path = not self.gui_settings_full_path
    self.update_settings_file_str(self.gui_settings_full_path)
```

## Validation Strategy

### JSON Schema Validation
```python
# Before save
jsonschema.validate(asdict(settings), SettingsFile.SETTINGS_SCHEMA)

# Location pointer schema
{
    "type": "object",
    "properties": {
        "settings_location": {"type": "string"}
    },
    "additionalProperties": False,
    "minProperties": 1
}

# Settings schema (simplified)
{
    "type": "object",
    "properties": {
        "col_percent": {"type": "integer"},
        "view": {"type": "string", "enum": ["auto", "dynamic-blame-history", "none"]},
        "file_formats": {"type": "array", "items": {"type": "string", "enum": ["html", "excel"]}},
        # ... 30 more properties
    },
    "additionalProperties": False,
    "minProperties": 33
}
```

## Best Practices Implemented

| Pattern | Implementation | Benefit |
|---------|-----------------|---------|
| **Dataclass + Schema** | @dataclass + jsonschema | Type-safe + validated |
| **Three-tier hierarchy** | Args → Settings, Args → CLIArgs | Code reuse, separation of concerns |
| **Location pointer** | .json file pointing to settings | Multiple profiles, flexible path |
| **Normalize on boundaries** | normalize() method | Handles user quirks, portable |
| **Explicit error handling** | Return (obj, error_str) tuples | Graceful degradation |
| **Post-init validation** | __post_init__ override | Contract enforcement |
| **Keys mirror pattern** | KeysArgs + Keys dataclasses | Type-safe GUI element access |
| **Values dict bridge** | from_values_dict() method | Isolates GUI from settings format |

## When Settings Are Persisted

| Event | Action | Trigger |
|-------|--------|---------|
| Application Start | Load from location pointer | main() entry point |
| User clicks "Save" | Save to active location | Explicit user action |
| User clicks "Save As" | Save to new location + update pointer | Explicit user action |
| User clicks "Load" | Load from selected file + update pointer | Explicit user action |
| User clicks "Reset" | Reset to defaults (no save) | Explicit user action |
| User clicks "Reset File" | Reset location pointer to default (no save) | Explicit user action |
| CLI --save flag | Save current args as settings | Explicit CLI flag |
| CLI --save-as PATH | Save to PATH + update pointer | Explicit CLI flag |

## Critical Code Locations

```
/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/

args_settings.py (474 lines)
├── Args class (31 fields)
├── Settings class + methods
├── CLIArgs class
├── SettingsFile class (static methods)
├── JSON schema definitions

constants.py (95 lines)
├── DEFAULT_FILE_BASE, INIT_COL_PERCENT, etc.
├── DEFAULT_EXTENSIONS list
├── FIX_TYPE, VIEW_OPTIONS, FILE_FORMATS enums

keys.py (101 lines)
├── KeysArgs (mirrors Args)
├── Keys extends KeysArgs

cli.py (198 lines)
├── main() entry point
├── load_settings() function

gui/psg_base.py (300+ lines)
├── window_state_from_settings()
├── Settings ↔ GUI synchronization

gui/psg.py (300+ lines)
├── Event handlers for settings (save, load, reset)
├── from_values_dict() calls

gui/psg_window.py (556 lines)
├── settings_frame() definition
├── Save, Load, Reset buttons layout
```

## Lessons for Tauri Implementation

1. **Explicit Save Model** - User must click Save, not auto-save
2. **Platform-Aware Paths** - Use platform-specific config dirs
3. **JSON Schema Validation** - Validate before using settings
4. **Flexible File Selection** - Allow Save As to any location
5. **Location Pointer** - Track "active" settings file separately
6. **Graceful Degradation** - Missing settings → defaults + warning
7. **Type-Safe Keys** - Mirror classes for GUI element access
8. **Normalize Boundaries** - Clean input on load/save
9. **Three-Tier Hierarchy** - Common settings, GUI settings, CLI args
10. **Separate Concerns** - Settings ≠ State ≠ Arguments

