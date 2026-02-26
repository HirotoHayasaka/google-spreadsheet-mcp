#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 読み込み
const possibleEnvPaths = [
  path.join(__dirname, '../.env'),
  '.env',
  path.join(process.cwd(), '.env'),
  path.join(process.env.HOME || '~', '.env'),
];

for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// 必須環境変数バリデーション（どちらか一方が必要）
if (
  !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON &&
  !process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
) {
  console.error('Error: Google authentication not configured.');
  console.error('');
  console.error('Set one of the following environment variables:');
  console.error(
    "  GOOGLE_SERVICE_ACCOUNT_KEY_JSON='{\"type\":\"service_account\",...}'"
  );
  console.error(
    '  GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account-key.json'
  );
  process.exit(1);
}

const { startServer } = await import('./index.js');
startServer();
