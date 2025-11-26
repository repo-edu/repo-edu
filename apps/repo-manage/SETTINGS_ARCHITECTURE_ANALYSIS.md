# Settings Architecture Analysis: gitinspectorgui-old

## Executive Summary

The gitinspectorgui-old application uses a **Python-based settings architecture** that demonstrates several robust patterns for configuration management in a dual-mode application (GUI + CLI). While it's written in Python (not Rust/Tauri), the architectural patterns and design decisions are highly valuable for implementing a similar system in repobee-tauri.

### Key Findings
- **Storage Format**: JSON with JSON Schema validation
- **Storage Location**: Platform-specific config directories (via platformdirs)
- **Persistence Model**: Explicit save on user action (not automatic)
- **Architecture Style**: Layered with clear separation between settings, arguments, and state
- **Validation**: JSON Schema for all settings persistence

---

## 1. Settings Storage

### 1.1 Physical Storage Location

```
Platform: macOS
Location: ~/.config/gitinspectorgui/  (via platformdirs.user_config_dir)

Files:
- gitinspectorgui.json          (Main settings file)
- gitinspectorgui-location.json (Settings file location pointer)
```

**Key Code** (`/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/args_settings.py`, lines 308-326):

```python
class SettingsFile:
    SETTINGS_FILE_NAME = "gitinspectorgui.json"
    SETTINGS_LOCATION_FILE_NAME: str = "gitinspectorgui-location.json"

    SETTINGS_DIR = platformdirs.user_config_dir("gitinspectorgui", ensure_exists=True)
    SETTINGS_LOCATION_PATH = Path(SETTINGS_DIR) / SETTINGS_LOCATION_FILE_NAME
    INITIAL_SETTINGS_PATH = Path(SETTINGS_DIR) / SETTINGS_FILE_NAME
```

### 1.2 Storage Format

**JSON with strict schema validation**. Example location file:

```json
{
    "settings_location": "/Users/username/.config/gitinspectorgui/gitinspectorgui.json"
}
```

Main settings file structure (33+ properties):

```json
{
    "col_percent": 75,
    "profile": 0,
    "input_fstrs": ["/path/to/repo"],
    "outfile_base": "gitinspect",
    "fix": "prefix",
    "depth": 5,
    "view": "auto",
    "file_formats": ["html"],
    "scaled_percentages": false,
    "blame_exclusions": "hide",
    "blame_skip": false,
    "subfolder": "",
    "n_files": 5,
    "include_files": [],
    "show_renames": false,
    "extensions": ["c", "cpp", "h", "java", "js", "py"],
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

---

## 2. Settings Structure

### 2.1 Core Data Structures

**Three-tier class hierarchy:**

```
Args (base arguments - CLI & GUI compatible)
  ↓
Settings (extends Args, adds GUI-specific fields)
  ↓
CLIArgs (extends Args, adds CLI-only fields like --save, --load, --gui)
```

**Key Code** (`args_settings.py`, lines 37-250):

#### 2.1.1 Args Class (Base)

```python
@dataclass
class Args:
    col_percent: int = INIT_COL_PERCENT
    profile: int = 0
    input_fstrs: list[FileStr] = field(default_factory=list)
    outfile_base: str = DEFAULT_FILE_BASE
    fix: str = PREFIX
    depth: int = SUBDIR_NESTING_DEPTH
    view: str = AUTO
    file_formats: list[str] = field(default_factory=lambda: ["html"])
    scaled_percentages: bool = False
    blame_exclusions: str = BLAME_EXCLUSIONS_DEFAULT
    blame_skip: bool = False
    subfolder: str = ""
    n_files: int = DEFAULT_N_FILES
    include_files: list[str] = field(default_factory=list)
    show_renames: bool = False
    extensions: list[str] = field(default_factory=list)
    deletions: bool = False
    whitespace: bool = False
    empty_lines: bool = False
    comments: bool = False
    copy_move: int = DEFAULT_COPY_MOVE
    verbosity: int = 0
    dryrun: int = 0
    multithread: bool = True
    multicore: bool = False
    since: str = ""
    until: str = ""
    ex_files: list[str] = field(default_factory=list)
    ex_authors: list[str] = field(default_factory=list)
    ex_emails: list[str] = field(default_factory=list)
    ex_revisions: list[str] = field(default_factory=list)
    ex_messages: list[str] = field(default_factory=list)
```

#### 2.1.2 Settings Class (GUI + Persistence)

```python
@dataclass
class Settings(Args):
    gui_settings_full_path: bool = False  # Show full path in GUI or just filename
    
    def __post_init__(self):
        # Validation and defaults
        if not self.extensions:
            self.extensions = DEFAULT_EXTENSIONS
        self.normalize()
```

#### 2.1.3 CLIArgs Class (CLI-specific)

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
```

### 2.2 Keys Structure

**Parallel Keys class that mirrors Args structure** (`keys.py`, lines 1-101):

```python
@dataclass
class KeysArgs:
    col_percent: str = "col_percent"
    profile: str = "profile"
    input_fstrs: str = "input_fstrs"
    outfile_base: str = "outfile_base"
    # ... all Args fields as string keys
    
@dataclass
class Keys(KeysArgs):
    # GUI-specific keys
    config_column: str = "config_column"
    run: str = "run"
    stop: str = "stop"
    save: str = "save"
    load: str = "load"
    reset: str = "reset"
    # ... etc
```

**Purpose**: Provides type-safe access to window elements and avoids magic strings in GUI code.

### 2.3 JSON Schema

**Comprehensive schema for validation** (`args_settings.py`, lines 328-370):

```python
SETTINGS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "col_percent": {"type": "integer"},
        "profile": {"type": "integer"},
        "input_fstrs": {"type": "array", "items": {"type": "string"}},
        "view": {"type": "string", "enum": VIEW_OPTIONS},
        "file_formats": {
            "type": "array",
            "items": {"type": "string", "enum": FILE_FORMATS},
        },
        "extensions": {"type": "array", "items": {"type": "string"}},
        "fix": {"type": "string", "enum": FIX_TYPE},
        "outfile_base": {"type": "string"},
        "depth": {"type": "integer"},
        # ... more properties
    },
    "additionalProperties": False,
    "minProperties": 33,
}
```

---

## 3. Settings Management

### 3.1 Loading Settings Flow

**Main entry point** (`cli.py`, lines 182-191):

```python
def load_settings(save: bool, save_as: str) -> Settings:
    settings: Settings
    error: str
    settings, error = SettingsFile.load()
    set_logging_level_from_verbosity(settings.verbosity)
    if error:
        logger.warning("Cannot load settings file, loading default settings.")
        if not save and not save_as:
            log("Save settings (--save) to avoid this message.")
    return settings
```

**SettingsFile.load() chain** (`args_settings.py`, lines 414-424):

```python
@classmethod
def load(cls) -> tuple[Settings, str]:
    return cls.load_from(cls.get_location_path())

@classmethod
def load_from(cls, file: PathLike) -> tuple[Settings, str]:
    try:
        path = Path(file)
        if path.suffix != ".json":
            raise ValueError(f"File {str(path)} does not have a .json extension")
        with open(file, "r", encoding="utf-8") as f:
            s = f.read()
            settings_dict = json.loads(s)
            jsonschema.validate(settings_dict, cls.SETTINGS_SCHEMA)
            settings = Settings(**settings_dict)
            settings.normalize()
            return settings, ""
    except (ValueError, FileNotFoundError, json.decoder.JSONDecodeError, 
            jsonschema.ValidationError) as e:
        return Settings(), str(e)
```

### 3.2 Saving Settings Flow

**GUI Save Button Handler** (`psg.py`, lines 196-200):

```python
case keys.save:
    self.settings.from_values_dict(values)
    self.settings.gui_settings_full_path = self.gui_settings_full_path
    self.settings.save()
    log(f"Settings saved to {SettingsFile.get_location_path()}")
```

**Settings.save() method** (`args_settings.py`, lines 146-160):

```python
def save(self):
    self.normalize()
    settings_dict = asdict(self)
    jsonschema.validate(settings_dict, SettingsFile.SETTINGS_SCHEMA)
    try:
        settings_path = SettingsFile.get_location_path()
    except (FileNotFoundError, json.decoder.JSONDecodeError, 
            jsonschema.ValidationError):
        settings_path = SettingsFile.create_location_file_for(
            SettingsFile.DEFAULT_LOCATION_SETTINGS
        )
    self.create_settings_file(settings_path)

def create_settings_file(self, settings_path: Path):
    settings_dict = asdict(self)
    with open(settings_path, "w", encoding="utf-8") as f:
        d = json.dumps(settings_dict, indent=4, sort_keys=True)
        f.write(d)
```

### 3.3 Advanced Operations

**Save As** (custom location):

```python
def save_as(self, pathlike: PathLike):
    settings_dict = asdict(self)
    jsonschema.validate(settings_dict, SettingsFile.SETTINGS_SCHEMA)
    settings_path = Path(pathlike)
    self.create_settings_file(settings_path)
    SettingsFile.set_location(settings_path)  # Updates location pointer
```

**Reset**:

```python
def reset(self) -> None:
    default_settings = Settings()
    for key, value in asdict(default_settings).items():
        setattr(self, key, value)
```

**Normalize** (clean input):

```python
def normalize(self) -> None:
    settings_schema: dict[str, Any] = SettingsFile.SETTINGS_SCHEMA["properties"]
    for key, value in settings_schema.items():
        if value["type"] == "array":
            input_list: list[str] = getattr(self, key)
            clean_list: list[str] = [
                item.strip()
                for item in input_list
                if item.strip()
            ]
            # Path conversion for file paths
            if key in {Keys.input_fstrs, Keys.ex_files, ...}:
                clean_list = [to_posix_fstr(fstr) for fstr in clean_list]
            setattr(self, key, clean_list)
        elif value["type"] == "string":
            setattr(self, key, getattr(self, key).strip())
```

---

## 4. UI Integration

### 4.1 Window-to-Settings Binding

**Initial Load** (`psg_base.py`, lines 66-125):

```python
def window_state_from_settings(self) -> None:
    settings = copy(self.settings).as_system()
    settings_dict = asdict(settings)
    # Exclude certain fields from GUI
    settings_min = {
        key: value
        for key, value in settings_dict.items()
        if key not in {keys.fix, keys.view, keys.file_formats, ...}
    }
    # Update window elements with settings values
    for key, val in settings_min.items():
        if isinstance(val, list):
            value_strings = ", ".join(val)
            self.window.Element(key).Update(value=value_strings)
        else:
            self.window.Element(key).Update(value=val)
```

### 4.2 Settings-to-GUI Conversion

**Values Dictionary to Settings** (`args_settings.py`, lines 201-239):

```python
def from_values_dict(self, values: dict[str, str | int | bool]) -> None:
    settings_schema: dict[str, Any] = SettingsFile.SETTINGS_SCHEMA["properties"]
    settings = Settings()

    # Convert values from GUI format to settings format
    values[Keys.n_files] = (
        0 if not values[Keys.n_files] else int(values[Keys.n_files])
    )
    for key, value in settings_schema.items():
        if key in values:
            if value["type"] == "array":
                input_list = values[key].split(",")
                setattr(settings, key, input_list)
            else:
                setattr(settings, key, values[key])

    # Handle radio buttons
    if values[Keys.prefix]:
        settings.fix = Keys.prefix
    elif values[Keys.postfix]:
        settings.fix = Keys.postfix
    # ...

    # Handle checkboxes
    file_formats = []
    for fmt in FILE_FORMATS:
        if values[fmt]:
            file_formats.append(fmt)
    settings.file_formats = file_formats
```

### 4.3 Settings Frame in GUI

**Settings Control Panel** (`psg_window.py`, lines 443-499):

```python
def settings_frame() -> sg.Frame:
    return frame(
        "",
        layout=[
            [
                name_header("Settings", ""),
                input_box(
                    keys.settings_file,
                    size=15,
                    disabled=True,  # Read-only display
                    pad=((3, 2), 5),
                ),
            ],
            [
                name_header("", ""),
                button("Save", keys.save, pad=((5, 3), 0)),
                sg.FileSaveAs("Save As", key=keys.save_as, ...),
                sg.FileBrowse("Load", key=keys.load, ...),
                button("Reset", key=keys.reset, pad=(3, 0)),
                button("Reset File", key=keys.reset_file, pad=(3, 0)),
                button("Toggle", key=keys.toggle_settings_file, pad=(3, 0)),
            ],
        ],
    )
```

---

## 5. Default Values

### 5.1 Hierarchy of Defaults

1. **Class-level defaults** in dataclass fields:
   ```python
   col_percent: int = INIT_COL_PERCENT
   depth: int = SUBDIR_NESTING_DEPTH
   view: str = AUTO
   ```

2. **Constants module** (`constants.py`):
   ```python
   DEFAULT_FILE_BASE = "gitinspect"
   SUBDIR_NESTING_DEPTH = 5
   DEFAULT_N_FILES = 5
   DEFAULT_COPY_MOVE = 1
   DEFAULT_EXTENSIONS = ["c", "cpp", "h", "java", "js", "py", ...]
   BLAME_EXCLUSIONS_DEFAULT = "hide"
   ```

3. **Special handling for extensions**:
   ```python
   def __post_init__(self):
       if not self.extensions:
           self.extensions = DEFAULT_EXTENSIONS
   ```

4. **Fallback to defaults on error**:
   ```python
   @classmethod
   def load_safe(cls) -> Settings:
       settings, error = cls.load()
       if error:
           cls.show_error()
           return cls.reset()  # Returns fresh Settings() with all defaults
       return settings
   ```

---

## 6. Persistence Model

### 6.1 When Settings Are Saved

**Explicit Save Model** - Settings are NOT saved automatically:

1. **User clicks "Save" button** → calls `settings.save()`
2. **User clicks "Save As"** → calls `settings.save_as(path)`
3. **CLI --save flag** → saves after processing arguments
4. **CLI --save-as PATH** → saves to specified location

### 6.2 When Settings Are Loaded

1. **Application startup** → `load_settings()` called in main()
2. **User clicks "Load" button** → `settings.load_safe_from(file)`
3. **CLI --load PATH** → `SettingsFile.load_from(path)`
4. **Reset operation** → `settings.reset()` + window recreated

### 6.3 Location Pointer Mechanism

**Two-file approach for flexibility**:

1. **gitinspectorgui-location.json** - Points to current settings file
2. **gitinspectorgui.json** - Default settings file

```python
@classmethod
def get_location_path(cls) -> Path:
    try:
        with open(cls.SETTINGS_LOCATION_PATH, "r") as f:
            s = f.read()
        settings_location_dict = json.loads(s)
        jsonschema.validate(settings_location_dict, cls.SETTINGS_LOCATION_SCHEMA)
        return Path(settings_location_dict["settings_location"])
    except (FileNotFoundError, json.decoder.JSONDecodeError, ...):
        # Create default if missing
        cls.create_location_file_for(cls.DEFAULT_LOCATION_SETTINGS)
        return cls.get_location_path()
```

---

## 7. Configuration File Format

### 7.1 JSON Schema Approach

**Advantages**:
- Strict validation before instantiation
- Clear contract of what settings exist
- Human-readable in editor
- Easy to document field constraints (enums, types)

**Schema Structure**:
```python
SETTINGS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "col_percent": {"type": "integer"},
        "view": {"type": "string", "enum": ["auto", "dynamic-blame-history", "none"]},
        "extensions": {"type": "array", "items": {"type": "string"}},
        "copy_move": {"type": "integer"},
    },
    "additionalProperties": False,  # Reject unknown fields
    "minProperties": 33,             # Must have all 33 settings
}
```

### 7.2 Path Format Convention

**File paths stored in POSIX format** (forward slashes):

```python
def normalize(self) -> None:
    if key in {Keys.input_fstrs, Keys.ex_files, Keys.include_files, ...}:
        clean_list = [to_posix_fstr(fstr) for fstr in clean_list]
        setattr(self, key, clean_list)

def as_system(self) -> "Settings":
    """Convert POSIX paths to system format when needed for display"""
    self.input_fstrs = to_system_fstrs(self.input_fstrs)
    self.ex_files = to_system_fstrs(self.ex_files)
    return self
```

**Benefit**: Settings files are portable across platforms.

---

## 8. Settings Modules Organization

### 8.1 File Structure

```
src/gigui/
├── args_settings.py        # Core: Args, Settings, CLIArgs, SettingsFile
├── constants.py            # All constants and defaults
├── keys.py                 # Key definitions for GUI elements
├── cli.py                  # CLI entry point + load_settings()
├── cli_arguments.py        # Argument parser setup
├── gui/
│   ├── psg.py             # Main GUI event loop
│   ├── psg_base.py        # GUI base class + window/settings binding
│   └── psg_window.py      # Window layout and frames
```

### 8.2 Responsibilities

| Module | Responsibility |
|--------|-----------------|
| **args_settings.py** | Complete settings lifecycle: load, save, validate, convert |
| **constants.py** | All configuration constants and default values |
| **keys.py** | Type-safe GUI element identifiers |
| **cli.py** | Settings loading in CLI context + main() flow |
| **psg_base.py** | Synchronization between Settings object and GUI elements |
| **psg_window.py** | GUI layout and element definition |

---

## 9. State Management

### 9.1 Settings Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Application Start                                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ SettingsFile.load()    │
        │ (from location pointer)│
        └────────┬───────────────┘
                 │
    ┌────────────┴────────────┐
    │ Success        Error    │
    ▼                ▼
Settings()    Settings()    (defaults)
    │
    ▼
  PSGUI(settings)
    │
    ├─ Load window_state_from_settings()
    │  (update all GUI elements from Settings)
    │
    └─ Main event loop
       ├─ User modifies field
       │  └─ Element event triggered
       │
       ├─ User clicks "Save"
       │  ├─ from_values_dict(values)
       │  ├─ normalize()
       │  ├─ validate with SETTINGS_SCHEMA
       │  └─ create_settings_file()
       │
       └─ User clicks "Load"
          ├─ load_safe_from(path)
          ├─ window_state_from_settings()
          └─ Update all GUI elements
```

### 9.2 Settings Object in GUI Class

```python
class PSGUI(PSGBase):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        
    # settings is instance variable available throughout event loop
    self.settings: Settings
    
    # Event handler example:
    case keys.save:
        self.settings.from_values_dict(values)
        self.settings.gui_settings_full_path = self.gui_settings_full_path
        self.settings.save()
```

### 9.3 Multi-context Conversions

**Settings ↔ Args ↔ CLIArgs ↔ Namespace**:

```python
# Args → Settings
settings = Settings.from_args(args, gui_settings_full_path=True)

# Settings → CLIArgs
cli_args: CLIArgs = settings.to_cli_args()

# CLIArgs → Namespace (from argparse)
cli_args.update_with_namespace(namespace)

# CLIArgs → Settings
settings = cli_args.create_settings()

# CLIArgs → Args
args: Args = cli_args.create_args()
```

---

## 10. Multi-Configuration Support

### 10.1 Multiple Profiles Via File Selection

**No built-in profile system**, but flexible file-based approach:

1. **Save As** allows user to save to any location:
   ```python
   case keys.save_as:
       self.settings.from_values_dict(values)
       destination = values[keys.save_as]
       self.settings.save_as(destination)
       SettingsFile.set_location(destination)  # Make it active
   ```

2. **Load** allows loading from any location:
   ```python
   case keys.load:
       settings_file = values[keys.load]
       self.settings.load_safe_from(settings_file)
       SettingsFile.set_location(settings_file)  # Make it active
   ```

3. **Settings File Display Toggle**:
   ```python
   case keys.toggle_settings_file:
       self.gui_settings_full_path = not self.gui_settings_full_path
       if self.gui_settings_full_path:
           self.update_settings_file_str(True)  # Show full path
       else:
           self.update_settings_file_str(False) # Show just filename
   ```

### 10.2 Location Pointer System

The location pointer (`gitinspectorgui-location.json`) allows:
- Users to switch between multiple settings files
- Each file is a complete, self-contained configuration
- No complex merging or inheritance logic

---

## Architecture Patterns & Best Practices

### P1: Dataclass + JSON Schema Combination

**Pattern**: Use Python dataclasses with parallel JSON Schema for validation

**Benefits**:
- Automatic `__init__`, `__repr__`, `__eq__` generation
- Serialization via `asdict()`
- Type hints for IDE support
- JSON Schema validates persistence layer
- Clear documentation via class definition

**Code**:
```python
@dataclass
class Settings(Args):
    gui_settings_full_path: bool = False

# Corresponds to schema:
"gui_settings_full_path": {"type": "boolean"}

# Validation:
jsonschema.validate(asdict(settings), SettingsFile.SETTINGS_SCHEMA)
```

### P2: Three-Tier Class Hierarchy

**Pattern**: Separate concerns across inheritance chain

```
Args (Universal: CLI & GUI)
  ↑
  └─ Settings (GUI-specific fields)
  └─ CLIArgs (CLI-specific flags)
```

**Benefits**:
- Single source of truth for common settings
- Type-safe field access
- Easy to pass settings between contexts
- Validation happens at right layer

### P3: Parallel Keys Mirror Structure

**Pattern**: Create Keys class that mirrors settings structure

```python
@dataclass
class KeysArgs:
    input_fstrs: str = "input_fstrs"
    # ... all Args fields as strings

@dataclass
class Keys(KeysArgs):
    # GUI-specific keys
    save: str = "save"
    load: str = "load"
```

**Benefits**:
- Type-safe GUI element access: `self.window[keys.save]`
- Eliminates magic strings
- IDE autocomplete
- Refactoring safety

### P4: Normalize on Load and Save

**Pattern**: Clean and standardize data at boundaries

```python
def normalize(self) -> None:
    # Strip whitespace from strings
    # Split comma-separated values
    # Convert paths to POSIX format
    # Remove empty items from lists
    
def save(self):
    self.normalize()
    # ... validation and serialization
```

**Benefits**:
- Handles user input quirks (trailing spaces, etc.)
- Consistent data format
- Platform-portable paths

### P5: Explicit Error Handling in Load

**Pattern**: Return tuple `(Settings, str)` instead of throwing

```python
@classmethod
def load_from(cls, file: PathLike) -> tuple[Settings, str]:
    try:
        # ... load and validate
        return settings, ""
    except (ValueError, FileNotFoundError, json.decoder.JSONDecodeError, 
            jsonschema.ValidationError) as e:
        return Settings(), str(e)
```

**Benefits**:
- Graceful degradation
- Clear error information
- Fallback to defaults
- Application continues running

### P6: Location Pointer for Flexibility

**Pattern**: Separate layer that tracks "active" settings file

```python
gitinspectorgui-location.json:
{
    "settings_location": "/Users/user/.config/gitinspectorgui/gitinspectorgui.json"
}
```

**Benefits**:
- Users can switch between multiple configs
- No hardcoding of settings path
- Supports "Save As" workflow
- Easy to implement multiple profiles later

### P7: Values Dictionary Bridge

**Pattern**: Use intermediate dict for GUI ↔ Settings conversion

```python
def from_values_dict(self, values: dict[str, str | int | bool]) -> None:
    # Handles all type conversions and special cases
    # Splits CSV, converts booleans, handles radio buttons
```

**Benefits**:
- Isolates GUI format from settings format
- Complex conversion logic in one place
- GUI doesn't need to know about Settings structure

### P8: Post-Initialization Validation

**Pattern**: Override `__post_init__` for custom validation

```python
@dataclass
class Settings(Args):
    def __post_init__(self):
        super().__post_init__()
        if not self.n_files >= 0:
            raise ValueError("n_files must be non-negative")
        if not self.extensions:
            self.extensions = DEFAULT_EXTENSIONS
        self.normalize()
```

**Benefits**:
- Validation logic tied to data structure
- Runs automatically on creation
- IDE understands through dataclass
- Clear contract enforcement

---

## Comparison with Typical Tauri Settings Patterns

### Tauri Typical Approach

```rust
// src-tauri/src/main.rs
use tauri::Config;
use serde::{Deserialize, Serialize};
use tauri_plugin_store::with_options;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct AppSettings {
    api_token: String,
    theme: String,
    window_size: (u32, u32),
}

fn main() {
    let mut config = tauri::Config::default();
    let mut store = with_options(...);
    
    tauri::Builder::default()
        .manage(AppState { settings: store })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### gitinspectorgui-old Approach Advantages

1. **Explicit Save Model**
   - gitinspectorgui: User must click "Save" - no surprises
   - Tauri plugin: Often auto-saves on every change

2. **Platform-Aware Paths**
   - gitinspectorgui: Uses `platformdirs` explicitly
   - Tauri: Plugin handles paths automatically (less control)

3. **JSON Schema Validation**
   - gitinspectorgui: Validates against schema before use
   - Tauri: Relies on serde deserialization (less strict)

4. **Flexible File Selection**
   - gitinspectorgui: User can save/load from any location
   - Tauri: Plugin stores in fixed location

5. **Graceful Error Handling**
   - gitinspectorgui: Missing file → defaults + warning
   - Tauri: Missing file → error or default struct

---

## Lessons for repobee-tauri Implementation

### Key Learnings

1. **Separate persistent settings from runtime state**
   - Settings: What gets saved to JSON
   - State: Temporary GUI state (window size, etc.)

2. **Use dataclasses (or Rust structs) with validation**
   - Reduces boilerplate
   - Self-documenting
   - Type-safe

3. **Normalize input at boundaries**
   - On load from file
   - On save to file
   - On reception from GUI

4. **Location pointer pattern is valuable**
   - Allows "multiple profiles" without complex merging
   - Keep settings file path flexible

5. **Explicit save model is better for user control**
   - Auto-save can surprise users
   - Explicit save is more predictable
   - Still possible to add auto-save as option

6. **Create type-safe GUI element access**
   - Avoid magic strings in event handlers
   - Use Keys pattern (or Rust enums)
   - IDE support and refactoring safety

7. **Three-tier architecture supports dual-mode apps**
   - Common settings (Args/UserSettings)
   - UI-specific settings (Settings/GuiState)
   - CLI-specific flags (CLIArgs)

---

## Recommended Rust Implementation Strategy for repobee-tauri

### Structure

```rust
// src-tauri/src/settings.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    // Persistence-relevant fields
    pub api_token: String,
    pub organization: String,
    pub repos_path: PathBuf,
    // ... more settings
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GuiState {
    // GUI-only state (may persist)
    pub window_width: u32,
    pub window_height: u32,
    pub last_tab: String,
}

impl AppSettings {
    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let config_dir = dirs::config_dir()
            .ok_or("Cannot find config dir")?;
        let settings_path = config_dir.join("repobee-tauri.json");
        
        let contents = std::fs::read_to_string(&settings_path)?;
        let settings: AppSettings = serde_json::from_str(&contents)?;
        Ok(settings)
    }
    
    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let config_dir = dirs::config_dir()
            .ok_or("Cannot find config dir")?;
        std::fs::create_dir_all(&config_dir)?;
        
        let settings_path = config_dir.join("repobee-tauri.json");
        let json = serde_json::to_string_pretty(&self)?;
        std::fs::write(&settings_path, json)?;
        Ok(())
    }
}
```

### Key Recommendations

1. **Use serde for serialization** (Rust standard)
2. **Use jsonschema crate for validation** (if needed)
3. **Use dirs/directories crate for platform paths**
4. **Store location pointer separately** (for multiple profiles)
5. **Implement explicit save() method**
6. **Return Result types** for error handling
7. **Validate in load path** before creating AppSettings
8. **Normalize paths to POSIX** for portability

---

## File References

### Core Settings Files
- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/args_settings.py` (474 lines)
  - Full implementation of Args, Settings, CLIArgs, SettingsFile
  
- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/constants.py` (95 lines)
  - All defaults and constants

- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/keys.py` (101 lines)
  - Key definitions for GUI elements

### GUI Integration
- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/gui/psg.py` (300+ lines)
  - Event loop and settings interactions

- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/gui/psg_base.py` (300+ lines)
  - GUI base class with window/settings binding

- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/gui/psg_window.py` (556 lines)
  - Window layout and settings frame

### CLI Integration
- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/cli.py` (198 lines)
  - Main entry point and settings loading

- `/Users/dvbeek/1-repos/github-boost/gitinspectorgui-old/src/gigui/cli_arguments.py`
  - CLI argument definitions

