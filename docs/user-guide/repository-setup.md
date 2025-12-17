# Repository Setup

The Repository Setup tab allows you to create and manage student repositories on Git hosting
platforms.

## Supported Platforms

- **GitHub**
- **GitLab**
- **Gitea**
- **Local filesystem**

## Configuration

### Git Platform Settings

| Setting | Description |
|---------|-------------|
| Platform | GitHub, GitLab, Gitea, or Local |
| Base URL | Platform API URL |
| Access Token | Personal access token |
| User | Your username on the platform |
| Student Repos Group | Organization/group for student repos |
| Template Group | Organization/group containing templates |

::: info TODO
Document repository naming, assignments
:::

## Workflow

1. **Configure** - Set up platform credentials
2. **Verify** - Test platform connectivity
3. **Create** - Generate student repositories

## Directory Layouts

When cloning repositories, you can choose from:

| Layout | Structure |
|--------|-----------|
| Flat | All repos in one directory |
| By Team | Grouped by team/group |
| By Task | Grouped by assignment |

::: info TODO
Document clone functionality when implemented
:::
