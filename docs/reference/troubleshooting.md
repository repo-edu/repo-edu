# Troubleshooting

Common issues and their solutions.

## LMS Connection Issues

### "Failed to verify course"

- Check that your access token is valid and not expired
- Verify the course ID is correct
- Ensure the base URL is correct for your institution

### "Unauthorized" error

Your access token may have expired or lack required permissions.

1. Generate a new access token in your LMS
2. Update the token in RepoManage
3. Try verifying again

## Output Issues

### "Output folder does not exist"

The specified output folder must exist before generating files.

1. Create the folder manually, or
2. Choose an existing folder

### "Read-only file system"

This occurs when running from a disk image (macOS) or restricted location.

1. Move the app to your Applications folder
2. Choose an output folder in your home directory

## Git Platform Issues

### "Authentication failed"

- Verify your access token has the required scopes
- Check that the token hasn't expired
- Ensure the base URL is correct

::: info TODO
Add more troubleshooting scenarios
:::

## Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/repo-edu/repo-edu/issues)
2. Open a new issue with details about your problem
