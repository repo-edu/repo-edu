# LMS Import

The LMS Import tab allows you to fetch student rosters and group assignments from your Learning
Management System.

## Supported LMS Platforms

- **Canvas** - Full support
- **Moodle** - Full support

## Configuration

### LMS Settings

| Setting | Description |
|---------|-------------|
| LMS Type | Canvas or Moodle |
| Base URL | Your institution's LMS URL |
| Access Token | API token for authentication |
| Course ID | The numeric course identifier |

### Output Options

| Option | Description |
|--------|-------------|
| YAML | RepoBee-compatible format |
| CSV | Spreadsheet format |
| XLSX | Excel format |

::: info TODO
Document member options, group settings
:::

## Workflow

1. **Configure** - Set up your LMS connection
2. **Verify** - Test the connection and course access
3. **Generate** - Export student data to files

## Output Format

### YAML (RepoBee format)

```yaml
students:
  - name: John Doe
    email: j.doe@university.edu
    group: team-1
```

::: info TODO
Document full output format
:::
