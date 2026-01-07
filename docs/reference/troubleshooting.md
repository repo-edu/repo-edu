# Troubleshooting

Common issues and their solutions.

## LMS Issues

### "Failed to verify course"

**Causes:**

- Invalid or expired access token
- Incorrect course ID
- Wrong base URL

**Solutions:**

1. Generate a new access token in your LMS
2. Verify the course ID is the numeric ID (not course code)
3. Check the base URL matches your institution's LMS

### "Unauthorized" Error

Your access token may have expired or lack required permissions.

1. Go to your LMS settings
2. Generate a new access token
3. Update the token in repo-edu
4. Try verifying again

### "Course not found"

- The course ID may be incorrect
- Your account may not have access to the course
- The course may be unpublished or archived

### Empty Student List

- Students may not be enrolled in the course
- Your token may lack permission to view enrollments
- Filter settings may be excluding students

### Empty Groups

- No groups exist in the course
- Students aren't assigned to groups
- Your token lacks group viewing permissions

## Output Issues

### "Output folder does not exist"

Create the folder manually or choose an existing directory.

```bash
mkdir -p ~/courses/cs101/output
```

### "Permission denied"

- The output folder may be read-only
- On macOS, the app may lack folder access permissions
- Try choosing a folder in your home directory

### "Read-only file system" (macOS)

This occurs when running from a disk image.

1. Move the app to your Applications folder
2. Restart the application
3. Choose an output folder in your home directory

## Git Platform Issues

### "Authentication failed"

**Causes:**

- Invalid or expired token
- Token lacks required scopes
- Incorrect base URL

**Solutions:**

1. Verify your token in platform settings
2. Regenerate with correct scopes:
   - GitHub: `repo`, `admin:org`
   - GitLab: `api`, `read_repository`, `write_repository`
   - Gitea: full access token
3. Check base URL (no trailing slash)

### "Organization/Group not found"

- Name is case-sensitive
- Your account may not have access
- For GitLab, ensure the group exists and is accessible

### "Repository already exists"

The setup process skips existing repositories. To recreate:

1. Delete the repository on the platform
2. Run setup again

### "Template not found"

- Verify template name is exact (case-sensitive)
- Check template exists in the template organization
- Ensure your token can access the template org

### "Rate limited"

GitHub and GitLab have API rate limits.

- Wait for the rate limit to reset
- Use a token with higher limits (GitHub)
- Reduce batch size for large operations

## CLI Issues

::: warning Commands Disabled
LMS and Repo CLI commands are temporarily disabled during the roster refactor. Only Profile
commands (`redu profile list|active|show|load`) are currently functional.
:::

### "Command not found: redu"

The CLI is not in your PATH.

```bash
# Check if installed
which redu

# If using cargo install
export PATH="$HOME/.cargo/bin:$PATH"

# Add to shell profile for persistence
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
```

### "No active profile"

Set an active profile before running commands:

```bash
redu profile list          # See available profiles
redu profile load default  # Activate a profile
```

### "Token not set"

Configure your token via profile or environment variable:

```bash
# Via environment
export REPOBEE_TOKEN="your-token-here"

# Via profile (GUI or edit JSON)
```

### Config Directory Issues

If the CLI can't find configuration:

```bash
# View config location
redu profile show | grep "Settings Directory"

# Create directory if missing
mkdir -p ~/.config/repo-edu/profiles
```

## Application Issues

### App Won't Start

**macOS:**

- Right-click the app and select "Open" to bypass Gatekeeper
- Check System Preferences → Security & Privacy

**Windows:**

- Install WebView2 runtime if prompted
- Run as administrator once

**Linux:**

- Install GTK3 dependencies: `libwebkit2gtk-4.1`
- Make the AppImage executable: `chmod +x repo-edu.AppImage`

### Settings Not Saving

- Check disk space
- Verify config directory is writable
- Try running as administrator (Windows) or with appropriate permissions

### UI Not Rendering

- Update your graphics drivers
- Try disabling hardware acceleration
- Check for WebView2 (Windows) or WebKit (Linux) updates

## Getting Help

If your issue isn't covered here:

1. Check [GitHub Issues](https://github.com/repo-edu/repo-edu/issues) for known issues
2. Search closed issues for solutions
3. Open a new issue with:
   - Operating system and version
   - repo-edu version (`redu --version`)
   - Steps to reproduce
   - Error messages (full text)
   - Relevant settings (redact tokens!)
