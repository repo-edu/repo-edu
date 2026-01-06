# LMS Import

The LMS Import tab allows you to fetch student rosters and group assignments from your Learning
Management System.

## Supported LMS Platforms

- **Canvas** — Full support for courses, students, and groups
- **Moodle** — Full support for courses, students, and groups

## Configuration

### LMS Settings

| Setting | Description |
|---------|-------------|
| LMS Type | Canvas or Moodle |
| Base URL | Your institution's LMS URL |
| Access Token | API token for authentication |
| Course | The course to fetch data from |

### Adding a Course

1. Enter the numeric course ID
2. Click **Add** to add it to the course list
3. Optionally enter a display name for easy identification

::: tip Finding Course ID
The course ID is typically in the URL when viewing your course:

- Canvas: `https://canvas.example.com/courses/12345` → ID is `12345`
- Moodle: `https://moodle.example.com/course/view.php?id=67890` → ID is `67890`
:::

### Output Options

| Option | Format | Use Case |
|--------|--------|----------|
| YAML | RepoBee-compatible | Repository setup operations |
| CSV | Spreadsheet | Data analysis, external tools |
| XLSX | Excel | Sharing with colleagues |

## Member Options

Control how student identifiers are formatted in output files.

| Option | Output Format | Example |
|--------|---------------|---------|
| Email Only | Full email | `alice@university.edu` |
| Email and Git ID | Email or username | `alice` |
| Git ID Only | Username only | `alice` |

Additional options:

| Setting | Effect |
|---------|--------|
| Include Group | Add group name column to CSV/XLSX |
| Include Member | Add member identifier column |
| Include Initials | Append initials to member ID (e.g., `alice-AD`) |
| Full Groups | Include all group members, not just first |

## Workflow

### Step 1: Configure Connection

1. Select your LMS type (Canvas or Moodle)
2. Enter your institution's base URL
3. Paste your API access token
4. Add at least one course ID

### Step 2: Verify Connection

Click **Verify** to test your configuration. A successful verification shows:

- Course name and code
- Confirmation of API access
- Number of students enrolled

::: warning Common Issues

- **Unauthorized**: Token expired or lacks permissions
- **Course not found**: Wrong course ID or no access
- **Connection failed**: Check base URL format
:::

### Step 3: Configure Output

1. Set the output folder (click folder icon to browse)
2. Enable desired formats (YAML, CSV, XLSX)
3. Adjust member options as needed

### Step 4: Generate Files

Click **Generate** to fetch data and create files. Progress is shown for:

1. Fetching students
2. Fetching groups
3. Processing memberships
4. Writing output files

## Output File Formats

### YAML (RepoBee Format)

```yaml
- name: team-alpha
  members:
    - alice@university.edu
    - bob@university.edu
- name: team-beta
  members:
    - charlie@university.edu
    - diana@university.edu
```

This format is directly usable with the Repository Setup tab or the `redu repo setup` command.

### CSV Format

```csv
group,member,email,name
team-alpha,alice@university.edu,alice@university.edu,Alice Doe
team-alpha,bob@university.edu,bob@university.edu,Bob Smith
```

### Solo Students

Students not assigned to any group are output as single-member teams, with names derived from the
student's full name:

```yaml
- name: alice-doe
  members:
    - alice@university.edu
```

## Getting an Access Token

### Canvas

1. Log in to Canvas
2. Go to **Account** → **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Enter a purpose (e.g., "repo-edu")
6. Click **Generate Token**
7. Copy the token immediately (it won't be shown again)

### Moodle

1. Contact your Moodle administrator
2. Request a web service token with these capabilities:
   - `core_course_get_courses`
   - `core_enrol_get_enrolled_users`
   - `core_group_get_course_groups`
   - `core_group_get_group_members`

::: warning Token Security

- Store tokens securely
- Never commit tokens to version control
- Regenerate if compromised
- Use tokens with minimal required permissions
:::

## See Also

- [Settings Reference](../reference/settings-reference.md) — Complete settings documentation
- [Output Formats](../reference/output-formats.md) — Detailed format specifications
- [CLI LMS Commands](../cli/lms-commands.md) — Command-line usage
