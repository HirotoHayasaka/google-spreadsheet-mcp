# google-spreadsheet-mcp

Google Sheets 用の MCP (Model Context Protocol) サーバーです。Claude などの AI アシスタントから Google スプレッドシートの読み書き・フォーマット操作が可能になります。

## インストール

```bash
npx google-spreadsheet-mcp
```

## 設定

### MCP クライアント設定

MCP クライアントの設定ファイルに追加します（Claude Code の `~/.claude.json`、Claude Desktop の `claude_desktop_config.json` など）:

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

### 認証

Google Cloud のサービスアカウントと Sheets API の有効化が必要です。以下のいずれかの環境変数を設定してください:

| 環境変数 | 説明 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | サービスアカウントキーの JSON 文字列（推奨） |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | サービスアカウントキー JSON ファイルのパス |

#### セットアップ手順

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **Google Sheets API** を有効化
3. **サービスアカウント** を作成し、JSON キーをダウンロード
4. 対象のスプレッドシートをサービスアカウントのメールアドレスに **共有**（例: `my-sa@my-project.iam.gserviceaccount.com`）

## 利用可能なツール

### 読み取り

| ツール | 説明 |
|---|---|
| `get-spreadsheet-info` | スプレッドシートのメタデータ取得（タイトル、シート一覧、サイズ） |
| `read-values` | 表示値を Markdown テーブルとして取得 |
| `read-formulas` | 数式をそのまま取得（例: `=SUM(A1:A10)`） |
| `read-all` | 表示値と数式を同時に取得 |
| `get-formatting` | セルの書式情報を取得（色、フォント、数値書式） |

### 書き込み

| ツール | 説明 |
|---|---|
| `update-cells` | 指定範囲のセル値を更新（数式対応） |
| `batch-update-cells` | 複数範囲を一括更新 |
| `append-rows` | データ末尾に行を追加 |
| `update-formatting` | セルの書式を更新（太字、色、配置など） |

### シート管理

| ツール | 説明 |
|---|---|
| `add-sheet` | 新しいシートタブを追加 |
| `delete-sheet` | シートタブを削除（削除前のデータをバックアップとして返却） |

## 使用例

### スプレッドシートの読み取り

```
「Sales」シートの A1:D10 の値を読み取って
スプレッドシート ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### 数式の書き込み

```
Sheet1!E2:E5 に合計の数式を入れて:
[["=SUM(B2:D2)"], ["=SUM(B3:D3)"], ["=SUM(B4:D4)"], ["=SUM(B5:D5)"]]
```

## ライセンス

MIT
