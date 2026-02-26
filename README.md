# google-spreadsheet-mcp

[![npm version](https://badge.fury.io/js/google-spreadsheet-mcp.svg)](https://www.npmjs.com/package/google-spreadsheet-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server for Google Sheets. Enables AI assistants like Claude to read, write, and format Google Spreadsheets.

## Installation

```bash
npx google-spreadsheet-mcp
```

## Configuration

### MCP Client Setup

Add to your MCP client configuration (e.g. Claude Code `~/.claude.json`, Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "google-spreadsheet-mcp"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_JSON": "{\"type\":\"service_account\",\"project_id\":\"...\",\"private_key\":\"...\",\"client_email\":\"...\"}"
      }
    }
  }
}
```

### Authentication

Requires a Google Cloud service account with Sheets API enabled. Set one of the following environment variables:

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Service account key JSON string (recommended) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the service account key JSON file |

#### Setup Steps

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Sheets API**
3. Create a **Service Account** and download the JSON key
4. **Share your spreadsheet** with the service account email (e.g. `my-sa@my-project.iam.gserviceaccount.com`)

## Available Tools

### Reading

| Tool | Description |
|---|---|
| `get-spreadsheet-info` | Get spreadsheet metadata (title, sheets list, sizes) |
| `read-values` | Read display values as a Markdown table |
| `read-formulas` | Read raw formulas (e.g. `=SUM(A1:A10)`) |
| `read-all` | Read both values and formulas simultaneously |
| `get-formatting` | Get cell formatting (colors, fonts, number formats) |

### Writing

| Tool | Description |
|---|---|
| `update-cells` | Update cell values in a range (supports formulas) |
| `batch-update-cells` | Update multiple ranges at once |
| `append-rows` | Append rows after the last row with data |
| `update-formatting` | Update cell formatting (bold, colors, alignment, etc.) |

### Sheet Management

| Tool | Description |
|---|---|
| `add-sheet` | Add a new sheet tab |
| `delete-sheet` | Delete a sheet tab (returns data backup) |

## Examples

### Reading a spreadsheet

```
Read values from sheet "Sales" range A1:D10
Spreadsheet ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### Writing formulas

```
Update cells in Sheet1!E2:E5 with formulas:
[["=SUM(B2:D2)"], ["=SUM(B3:D3)"], ["=SUM(B4:D4)"], ["=SUM(B5:D5)"]]
```

## License

MIT
