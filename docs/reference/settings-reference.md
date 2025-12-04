# Settings Reference

Complete reference of all configuration options.

## LMS Settings

| Setting | Type | Description |
|---------|------|-------------|
| `lmsType` | `Canvas` \| `Moodle` | LMS platform type |
| `urlOption` | `TUE` \| `CUSTOM` | URL preset or custom |
| `baseUrl` | string | LMS base URL |
| `customUrl` | string | Custom LMS URL |
| `accessToken` | string | API access token |
| `courseId` | string | Course identifier |

## Output Settings

| Setting | Type | Description |
|---------|------|-------------|
| `outputFolder` | string | Output directory path |
| `yamlFile` | string | YAML output filename |
| `csvFile` | string | CSV output filename |
| `xlsxFile` | string | XLSX output filename |
| `yaml` | boolean | Enable YAML output |
| `csv` | boolean | Enable CSV output |
| `xlsx` | boolean | Enable XLSX output |

## Repository Settings

| Setting | Type | Description |
|---------|------|-------------|
| `platform` | string | Git platform type |
| `baseUrl` | string | Platform API URL |
| `accessToken` | string | Platform access token |
| `user` | string | Platform username |
| `studentReposGroup` | string | Student repos organization |
| `templateGroup` | string | Template repos organization |
| `targetFolder` | string | Clone target directory |

::: info TODO
Complete settings reference from schema
:::
