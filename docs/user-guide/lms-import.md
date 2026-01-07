# LMS Import

Import student rosters and group assignments from your Learning Management System into the Roster
tab.

## Supported LMS Platforms

- **Canvas** — Full support for courses, students, and groups
- **Moodle** — Full support for courses, students, and groups

## Configuration

Before importing, configure your LMS connection in **Settings** (click the gear icon):

### LMS Settings

| Setting | Description |
|---------|-------------|
| LMS Type | Canvas or Moodle |
| Base URL | Your institution's LMS URL |
| Access Token | API token for authentication |
| Course ID | The course to fetch data from |

::: tip Finding Course ID
The course ID is typically in the URL when viewing your course:

- Canvas: `https://canvas.example.com/courses/12345` → ID is `12345`
- Moodle: `https://moodle.example.com/course/view.php?id=67890` → ID is `67890`
:::

## Import Workflow

### Step 1: Configure Connection

1. Open Settings (gear icon or `Cmd+,`)
2. Go to the **Connections** section
3. Select your LMS type (Canvas or Moodle)
4. Enter your institution's base URL
5. Paste your API access token
6. Enter the course ID

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

### Step 3: Import Students

From the **Roster** tab:

1. Click the import dropdown in the utility bar
2. Select **Import from LMS**
3. Choose what to import:
   - Students only
   - Students with groups
4. Review the imported roster in the student table

### Step 4: Review and Edit

After import, the Roster tab displays:

- **Student table** — All imported students with name, email, and git username
- **Group assignments** — Which group each student belongs to
- **Validation warnings** — Students missing git usernames, duplicate emails, etc.

You can:

- Edit student details inline
- Add or remove students
- Import git usernames from a file
- Verify git usernames against the platform

## Conflict Resolution

When importing into an existing roster:

- **Merge** — Add new students, update existing by email match
- **Replace** — Clear existing roster and import fresh

A dialog appears to help resolve conflicts when student data differs.

## Export Options

Export your roster for use with the CLI or external tools:

| Format | Use Case |
|--------|----------|
| YAML | Repository setup operations, CLI |
| CSV | Spreadsheet analysis, external tools |
| XLSX | Sharing with colleagues |

Export from the Roster tab toolbar or via **File → Export**.

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
