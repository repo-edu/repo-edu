# Quick Start

This guide walks you through setting up RepoManage for the first time.

## Step 1: Configure LMS Connection

1. Open RepoManage
2. Go to the **LMS Import** tab
3. Select your LMS type (Canvas or Moodle)
4. Enter your institution's base URL
5. Add your API access token (see [Getting an Access Token](#getting-an-access-token))
6. Enter your course ID
7. Click **Verify** to test the connection

## Step 2: Export Student Roster

1. Configure output options (YAML, CSV, XLSX)
2. Set the output folder
3. Click **Generate Files**

## Getting an Access Token

### Canvas

1. Log in to Canvas
2. Go to **Account** > **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a name and copy the token

### Moodle

::: info TODO
Moodle token instructions to be added.
:::

::: warning Security
Keep your access token secure. It provides access to your LMS data.
:::

## Next Steps

- [LMS Import Guide](/user-guide/lms-import) - Detailed import options
- [Repository Setup](/user-guide/repository-setup) - Create student repositories
- [Settings](/user-guide/settings) - Configure the application
