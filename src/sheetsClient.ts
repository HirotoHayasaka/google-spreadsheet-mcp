/**
 * Google Sheets API Client
 * Provides type-safe access to Google Sheets and Drive APIs
 */

import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.js';
import * as fs from 'fs';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  locale: string;
  timeZone: string;
  sheets: SheetInfo[];
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export type CellValue = string | number | boolean | null;

// ============================================================================
// Authentication
// ============================================================================

function loadCredentials(): GoogleAuth {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;

  if (keyJson) {
    logger.debug('Authenticating with GOOGLE_SERVICE_ACCOUNT_KEY_JSON');
    const credentials = JSON.parse(keyJson);
    return new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  if (keyPath) {
    logger.debug(`Authenticating with key file: ${keyPath}`);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Service account key file not found: ${keyPath}`);
    }
    return new GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  throw new Error(
    'Google authentication not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable.'
  );
}

// ============================================================================
// Error Handling
// ============================================================================

function handleApiError(error: unknown, context: string): never {
  logger.error(`${context}: ${error}`);

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const apiError = error as { code: number; message?: string };
    switch (apiError.code) {
      case 404:
        throw new Error(
          `${context}: スプレッドシートが見つかりません。IDを確認し、サービスアカウントに共有してください。`
        );
      case 403:
        throw new Error(
          `${context}: 権限がありません。スプレッドシートをサービスアカウントのメールアドレスに共有してください。`
        );
      case 400:
        throw new Error(
          `${context}: 無効なリクエストです。範囲指定はA1記法を使用してください（例: Sheet1!A1:D10）。Detail: ${apiError.message || ''}`
        );
      default:
        throw new Error(`${context} (${apiError.code}): ${apiError.message || 'Unknown error'}`);
    }
  }

  throw new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

// ============================================================================
// Client Class
// ============================================================================

export class SheetsClient {
  private sheets: sheets_v4.Sheets;

  constructor() {
    const auth = loadCredentials();
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Get spreadsheet metadata (title, sheets list, etc.)
   */
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'spreadsheetId,properties.title,properties.locale,properties.timeZone,sheets.properties',
      });

      const props = response.data.properties!;
      const sheets = (response.data.sheets || []).map(s => ({
        sheetId: s.properties!.sheetId!,
        title: s.properties!.title!,
        rowCount: s.properties!.gridProperties?.rowCount ?? 0,
        columnCount: s.properties!.gridProperties?.columnCount ?? 0,
      }));

      return {
        spreadsheetId: response.data.spreadsheetId!,
        title: props.title!,
        locale: props.locale || '',
        timeZone: props.timeZone || '',
        sheets,
      };
    } catch (error) {
      return handleApiError(error, 'Failed to get spreadsheet info');
    }
  }

  /**
   * Read cell values (formatted display values)
   */
  async getValues(spreadsheetId: string, range: string): Promise<CellValue[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      return (response.data.values as CellValue[][]) || [];
    } catch (error) {
      return handleApiError(error, `Failed to read values from ${range}`);
    }
  }

  /**
   * Read cell formulas
   */
  async getFormulas(spreadsheetId: string, range: string): Promise<CellValue[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMULA',
      });
      return (response.data.values as CellValue[][]) || [];
    } catch (error) {
      return handleApiError(error, `Failed to read formulas from ${range}`);
    }
  }

  /**
   * Read both values and formulas in parallel
   */
  async getValuesAndFormulas(
    spreadsheetId: string,
    range: string
  ): Promise<{ values: CellValue[][]; formulas: CellValue[][] }> {
    const [values, formulas] = await Promise.all([
      this.getValues(spreadsheetId, range),
      this.getFormulas(spreadsheetId, range),
    ]);
    return { values, formulas };
  }

  /**
   * Update cell values in a range
   */
  async updateValues(
    spreadsheetId: string,
    range: string,
    values: CellValue[][]
  ): Promise<{ updatedRange: string; updatedRows: number; updatedColumns: number; updatedCells: number }> {
    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      return {
        updatedRange: response.data.updatedRange || range,
        updatedRows: response.data.updatedRows || 0,
        updatedColumns: response.data.updatedColumns || 0,
        updatedCells: response.data.updatedCells || 0,
      };
    } catch (error) {
      return handleApiError(error, `Failed to update values in ${range}`);
    }
  }

  /**
   * Batch update multiple ranges
   */
  async batchUpdateValues(
    spreadsheetId: string,
    data: Array<{ range: string; values: CellValue[][] }>
  ): Promise<{ totalUpdatedCells: number; totalUpdatedRows: number }> {
    try {
      const response = await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: data.map(d => ({
            range: d.range,
            values: d.values,
          })),
        },
      });

      return {
        totalUpdatedCells: response.data.totalUpdatedCells || 0,
        totalUpdatedRows: response.data.totalUpdatedRows || 0,
      };
    } catch (error) {
      return handleApiError(error, 'Failed to batch update values');
    }
  }

  /**
   * Batch get values from multiple ranges
   */
  async batchGetValues(
    spreadsheetId: string,
    ranges: string[]
  ): Promise<Array<{ range: string; values: CellValue[][] }>> {
    try {
      const response = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: 'FORMATTED_VALUE',
      });

      return (response.data.valueRanges || []).map(vr => ({
        range: vr.range || '',
        values: (vr.values as CellValue[][]) || [],
      }));
    } catch (error) {
      return handleApiError(error, 'Failed to batch get values');
    }
  }

  /**
   * Append rows to the end of a sheet
   */
  async appendRows(
    spreadsheetId: string,
    range: string,
    values: CellValue[][]
  ): Promise<{ updatedRange: string; updatedRows: number; updatedCells: number }> {
    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });

      const updates = response.data.updates;
      return {
        updatedRange: updates?.updatedRange || range,
        updatedRows: updates?.updatedRows || 0,
        updatedCells: updates?.updatedCells || 0,
      };
    } catch (error) {
      return handleApiError(error, `Failed to append rows to ${range}`);
    }
  }

  /**
   * Add a new sheet (tab) to the spreadsheet
   */
  async addSheet(
    spreadsheetId: string,
    title: string,
    rowCount?: number,
    columnCount?: number
  ): Promise<SheetInfo> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title,
                  gridProperties: {
                    rowCount: rowCount || 1000,
                    columnCount: columnCount || 26,
                  },
                },
              },
            },
          ],
        },
      });

      const reply = response.data.replies?.[0]?.addSheet;
      return {
        sheetId: reply?.properties?.sheetId || 0,
        title: reply?.properties?.title || title,
        rowCount: reply?.properties?.gridProperties?.rowCount || rowCount || 1000,
        columnCount: reply?.properties?.gridProperties?.columnCount || columnCount || 26,
      };
    } catch (error) {
      return handleApiError(error, `Failed to add sheet "${title}"`);
    }
  }

  /**
   * Delete a sheet (tab) from the spreadsheet
   */
  async deleteSheet(spreadsheetId: string, sheetId: number): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });
    } catch (error) {
      return handleApiError(error, `Failed to delete sheet ${sheetId}`);
    }
  }

  /**
   * Get cell formatting data
   */
  async getFormatting(
    spreadsheetId: string,
    range: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [range],
        includeGridData: true,
        fields: 'sheets.data.rowData.values(effectiveFormat,formattedValue)',
      });

      const sheetData = response.data.sheets?.[0]?.data?.[0]?.rowData;
      return sheetData || [];
    } catch (error) {
      return handleApiError(error, `Failed to get formatting for ${range}`);
    }
  }

  /**
   * Update cell formatting
   */
  async updateFormatting(
    spreadsheetId: string,
    sheetId: number,
    startRowIndex: number,
    endRowIndex: number,
    startColumnIndex: number,
    endColumnIndex: number,
    format: sheets_v4.Schema$CellFormat,
    fields: string
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex,
                  endRowIndex,
                  startColumnIndex,
                  endColumnIndex,
                },
                cell: {
                  userEnteredFormat: format,
                },
                fields: `userEnteredFormat(${fields})`,
              },
            },
          ],
        },
      });
    } catch (error) {
      return handleApiError(error, 'Failed to update formatting');
    }
  }

  /**
   * Resolve sheet title to sheetId
   */
  async resolveSheetId(spreadsheetId: string, sheetTitle: string): Promise<number> {
    const info = await this.getSpreadsheetInfo(spreadsheetId);
    const sheet = info.sheets.find(
      s => s.title.toLowerCase() === sheetTitle.toLowerCase()
    );
    if (!sheet) {
      throw new Error(`Sheet "${sheetTitle}" not found. Available sheets: ${info.sheets.map(s => s.title).join(', ')}`);
    }
    return sheet.sheetId;
  }
}

// Singleton instance
let clientInstance: SheetsClient | null = null;

export function getSheetsClient(): SheetsClient {
  if (!clientInstance) {
    clientInstance = new SheetsClient();
  }
  return clientInstance;
}
