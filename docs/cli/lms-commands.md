# LMS Commands

The `redu lms` command group provides operations for working with Learning Management Systems
(Canvas and Moodle).

## redu lms verify

Test connectivity to your LMS and verify course access.

```bash
redu lms verify [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `--lms-type <TYPE>` | Override LMS type (`Canvas` or `Moodle`) |
| `--course-id <ID>` | Override course ID |

### Examples

```bash
# Verify using settings from active profile
redu lms verify

# Verify a specific course
redu lms verify --course-id 12345

# Verify against Moodle instead of configured LMS
redu lms verify --lms-type Moodle --course-id 67890
```

### Output

```text
Starting: Verifying Canvas course
✓ Verifying Canvas course
  Course: Introduction to Programming (CS101)

✓ Canvas course verified: Introduction to Programming
  Course ID: 12345
  Course Code: CS101
```

## redu lms generate

Fetch student data from the LMS and generate output files.

```bash
redu lms generate [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `--output <PATH>` | Override output folder |
| `--yaml` | Generate YAML file (RepoBee format) |
| `--csv` | Generate CSV file |

### Examples

```bash
# Generate files using profile settings
redu lms generate

# Generate only YAML to a specific folder
redu lms generate --output ./course-data --yaml

# Generate both YAML and CSV
redu lms generate --yaml --csv
```

### Output

```text
Starting: Fetching course data
[1/3] Fetching students...
[2/3] Fetching groups...
[3/3] Processing memberships...
✓ Fetching course data

Starting: Writing output files
✓ Writing output files

✓ Generated 2 file(s) from 45 students
  /Users/you/course-data/students.yaml
  /Users/you/course-data/student-info.csv
```

## Configuration

LMS commands use settings from the active profile. Key settings:

| Setting | Description |
|---------|-------------|
| `lms.type` | LMS platform (`Canvas` or `Moodle`) |
| `lms.canvas.base_url` | Canvas API URL |
| `lms.canvas.access_token` | Canvas API token |
| `lms.canvas.courses` | List of course IDs |
| `lms.moodle.base_url` | Moodle API URL |
| `lms.moodle.access_token` | Moodle web service token |
| `lms.output_folder` | Default output directory |
| `lms.output_yaml` | Enable YAML output by default |
| `lms.output_csv` | Enable CSV output by default |

See [Settings Reference](/reference/settings-reference) for the complete list.

## Output Formats

See [Output Formats](/reference/output-formats) for details on the generated file formats.
