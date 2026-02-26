#!/usr/bin/env node

/**
 * Google Spreadsheet MCP Server
 * Provides Model Context Protocol interface for Google Sheets API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSheetsClient } from './sheetsClient.js';
import {
  formatAsMarkdownTable,
  formatValuesAndFormulas,
  formatSpreadsheetInfo,
  formatCellFormatting,
} from './formatter.js';
import { logger } from './logger.js';

// package.jsonからバージョンを読み取る
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

// ============================================================================
// Server Configuration
// ============================================================================

const SERVER_CONFIG = {
  name: 'google-spreadsheet-mcp',
  version: VERSION,
};

const mcpServer = new Server(SERVER_CONFIG, {
  capabilities: {
    tools: {},
  },
});

logger.info(`Starting ${SERVER_CONFIG.name} v${SERVER_CONFIG.version}...`);

// ============================================================================
// Utility Functions
// ============================================================================

export function createTextResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

export function createErrorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

// ============================================================================
// Tool Schemas
// ============================================================================

export const schemas = {
  'get-spreadsheet-info': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID from the URL'),
  }),

  'read-values': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z.string().describe('A1 notation range (e.g. Sheet1!A1:D10)'),
  }),

  'read-formulas': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z.string().describe('A1 notation range (e.g. Sheet1!A1:D10)'),
  }),

  'read-all': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z.string().describe('A1 notation range (e.g. Sheet1!A1:D10)'),
  }),

  'update-cells': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z.string().describe('A1 notation range (e.g. Sheet1!A1:B2)'),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe('2D array of values to write. Use string starting with = for formulas.'),
  }),

  'batch-update-cells': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    data: z
      .array(
        z.object({
          range: z.string().describe('A1 notation range'),
          values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
        })
      )
      .describe('Array of {range, values} objects for batch update'),
  }),

  'append-rows': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z
      .string()
      .describe('A1 notation range indicating the sheet and starting column (e.g. Sheet1!A:D)'),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe('2D array of rows to append'),
  }),

  'add-sheet': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    title: z.string().describe('Name for the new sheet tab'),
    rowCount: z.number().optional().describe('Number of rows (default: 1000)'),
    columnCount: z.number().optional().describe('Number of columns (default: 26)'),
  }),

  'delete-sheet': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    sheetTitle: z.string().describe('Name of the sheet tab to delete'),
  }),

  'get-formatting': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    range: z.string().describe('A1 notation range (e.g. Sheet1!A1:D10)'),
  }),

  'update-formatting': z.object({
    spreadsheetId: z.string().describe('The spreadsheet ID'),
    sheetTitle: z.string().describe('Name of the sheet tab'),
    startRowIndex: z.number().describe('Start row (0-based, inclusive)'),
    endRowIndex: z.number().describe('End row (0-based, exclusive)'),
    startColumnIndex: z.number().describe('Start column (0-based, inclusive)'),
    endColumnIndex: z.number().describe('End column (0-based, exclusive)'),
    format: z
      .object({
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        strikethrough: z.boolean().optional(),
        fontSize: z.number().optional(),
        fontFamily: z.string().optional(),
        foregroundColor: z
          .object({
            red: z.number().optional(),
            green: z.number().optional(),
            blue: z.number().optional(),
          })
          .optional(),
        backgroundColor: z
          .object({
            red: z.number().optional(),
            green: z.number().optional(),
            blue: z.number().optional(),
          })
          .optional(),
        horizontalAlignment: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
        numberFormat: z
          .object({
            type: z.enum([
              'TEXT',
              'NUMBER',
              'PERCENT',
              'CURRENCY',
              'DATE',
              'TIME',
              'DATE_TIME',
              'SCIENTIFIC',
            ]),
            pattern: z.string().optional(),
          })
          .optional(),
      })
      .describe('Formatting properties to apply'),
  }),
};

// ============================================================================
// Tool Handlers
// ============================================================================

export const handlers = {
  'get-spreadsheet-info': async (
    params: z.infer<(typeof schemas)['get-spreadsheet-info']>
  ) => {
    try {
      const client = getSheetsClient();
      const info = await client.getSpreadsheetInfo(params.spreadsheetId);
      return createTextResponse(formatSpreadsheetInfo(info));
    } catch (error) {
      logger.error(`get-spreadsheet-info error: ${error}`);
      return createErrorResponse(
        `Failed to get spreadsheet info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'read-values': async (params: z.infer<(typeof schemas)['read-values']>) => {
    try {
      const client = getSheetsClient();
      const values = await client.getValues(params.spreadsheetId, params.range);
      return createTextResponse(
        `## Values (${params.range})\n\n${formatAsMarkdownTable(values)}`
      );
    } catch (error) {
      logger.error(`read-values error: ${error}`);
      return createErrorResponse(
        `Failed to read values: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'read-formulas': async (params: z.infer<(typeof schemas)['read-formulas']>) => {
    try {
      const client = getSheetsClient();
      const formulas = await client.getFormulas(params.spreadsheetId, params.range);
      return createTextResponse(
        `## Formulas (${params.range})\n\n${formatAsMarkdownTable(formulas)}`
      );
    } catch (error) {
      logger.error(`read-formulas error: ${error}`);
      return createErrorResponse(
        `Failed to read formulas: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'read-all': async (params: z.infer<(typeof schemas)['read-all']>) => {
    try {
      const client = getSheetsClient();
      const { values, formulas } = await client.getValuesAndFormulas(
        params.spreadsheetId,
        params.range
      );
      return createTextResponse(formatValuesAndFormulas(values, formulas, params.range));
    } catch (error) {
      logger.error(`read-all error: ${error}`);
      return createErrorResponse(
        `Failed to read values and formulas: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'update-cells': async (params: z.infer<(typeof schemas)['update-cells']>) => {
    try {
      const client = getSheetsClient();
      const result = await client.updateValues(
        params.spreadsheetId,
        params.range,
        params.values
      );

      // Re-read updated values
      const updated = await client.getValues(params.spreadsheetId, result.updatedRange);

      return createTextResponse(
        `Updated ${result.updatedCells} cells in ${result.updatedRange}\n\n` +
          `## Updated Values\n\n${formatAsMarkdownTable(updated)}`
      );
    } catch (error) {
      logger.error(`update-cells error: ${error}`);
      return createErrorResponse(
        `Failed to update cells: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'batch-update-cells': async (
    params: z.infer<(typeof schemas)['batch-update-cells']>
  ) => {
    try {
      const client = getSheetsClient();
      const result = await client.batchUpdateValues(params.spreadsheetId, params.data);

      // Re-read all updated ranges
      const ranges = params.data.map(d => d.range);
      const updatedData = await client.batchGetValues(params.spreadsheetId, ranges);

      const parts: string[] = [
        `Batch updated ${result.totalUpdatedCells} cells across ${params.data.length} ranges`,
        '',
      ];

      for (const item of updatedData) {
        parts.push(`## ${item.range}`);
        parts.push(formatAsMarkdownTable(item.values));
        parts.push('');
      }

      return createTextResponse(parts.join('\n'));
    } catch (error) {
      logger.error(`batch-update-cells error: ${error}`);
      return createErrorResponse(
        `Failed to batch update cells: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'append-rows': async (params: z.infer<(typeof schemas)['append-rows']>) => {
    try {
      const client = getSheetsClient();
      const result = await client.appendRows(
        params.spreadsheetId,
        params.range,
        params.values
      );

      // Re-read appended range
      const updated = await client.getValues(params.spreadsheetId, result.updatedRange);

      return createTextResponse(
        `Appended ${result.updatedRows} rows (${result.updatedCells} cells) at ${result.updatedRange}\n\n` +
          `## Appended Data\n\n${formatAsMarkdownTable(updated)}`
      );
    } catch (error) {
      logger.error(`append-rows error: ${error}`);
      return createErrorResponse(
        `Failed to append rows: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'add-sheet': async (params: z.infer<(typeof schemas)['add-sheet']>) => {
    try {
      const client = getSheetsClient();
      const sheet = await client.addSheet(
        params.spreadsheetId,
        params.title,
        params.rowCount,
        params.columnCount
      );

      return createTextResponse(
        `Sheet "${sheet.title}" created successfully\n\n` +
          `- **Sheet ID**: ${sheet.sheetId}\n` +
          `- **Rows**: ${sheet.rowCount}\n` +
          `- **Columns**: ${sheet.columnCount}`
      );
    } catch (error) {
      logger.error(`add-sheet error: ${error}`);
      return createErrorResponse(
        `Failed to add sheet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'delete-sheet': async (params: z.infer<(typeof schemas)['delete-sheet']>) => {
    try {
      const client = getSheetsClient();

      // Resolve sheet title to ID
      const sheetId = await client.resolveSheetId(params.spreadsheetId, params.sheetTitle);

      // Read data before deletion
      let backupData = '';
      try {
        const values = await client.getValues(params.spreadsheetId, `${params.sheetTitle}!A:ZZ`);
        if (values.length > 0) {
          backupData =
            `\n\n## Deleted Sheet Data (backup)\n\n${formatAsMarkdownTable(values)}`;
        }
      } catch {
        // Sheet might be empty or range invalid, continue with deletion
        logger.debug('Could not read sheet data before deletion');
      }

      await client.deleteSheet(params.spreadsheetId, sheetId);

      return createTextResponse(
        `Sheet "${params.sheetTitle}" (ID: ${sheetId}) deleted successfully.${backupData}`
      );
    } catch (error) {
      logger.error(`delete-sheet error: ${error}`);
      return createErrorResponse(
        `Failed to delete sheet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'get-formatting': async (params: z.infer<(typeof schemas)['get-formatting']>) => {
    try {
      const client = getSheetsClient();
      const gridData = await client.getFormatting(params.spreadsheetId, params.range);
      return createTextResponse(formatCellFormatting(gridData, params.range));
    } catch (error) {
      logger.error(`get-formatting error: ${error}`);
      return createErrorResponse(
        `Failed to get formatting: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  'update-formatting': async (
    params: z.infer<(typeof schemas)['update-formatting']>
  ) => {
    try {
      const client = getSheetsClient();

      // Resolve sheet title to ID
      const sheetId = await client.resolveSheetId(params.spreadsheetId, params.sheetTitle);

      // Build CellFormat object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cellFormat: any = {};
      const fieldParts: string[] = [];

      if (params.format.bold !== undefined || params.format.italic !== undefined ||
          params.format.strikethrough !== undefined || params.format.fontSize !== undefined ||
          params.format.fontFamily !== undefined || params.format.foregroundColor !== undefined) {
        cellFormat.textFormat = {};
        if (params.format.bold !== undefined) {
          cellFormat.textFormat.bold = params.format.bold;
          fieldParts.push('textFormat.bold');
        }
        if (params.format.italic !== undefined) {
          cellFormat.textFormat.italic = params.format.italic;
          fieldParts.push('textFormat.italic');
        }
        if (params.format.strikethrough !== undefined) {
          cellFormat.textFormat.strikethrough = params.format.strikethrough;
          fieldParts.push('textFormat.strikethrough');
        }
        if (params.format.fontSize !== undefined) {
          cellFormat.textFormat.fontSize = params.format.fontSize;
          fieldParts.push('textFormat.fontSize');
        }
        if (params.format.fontFamily !== undefined) {
          cellFormat.textFormat.fontFamily = params.format.fontFamily;
          fieldParts.push('textFormat.fontFamily');
        }
        if (params.format.foregroundColor !== undefined) {
          cellFormat.textFormat.foregroundColor = params.format.foregroundColor;
          fieldParts.push('textFormat.foregroundColor');
        }
      }

      if (params.format.backgroundColor !== undefined) {
        cellFormat.backgroundColor = params.format.backgroundColor;
        fieldParts.push('backgroundColor');
      }

      if (params.format.horizontalAlignment !== undefined) {
        cellFormat.horizontalAlignment = params.format.horizontalAlignment;
        fieldParts.push('horizontalAlignment');
      }

      if (params.format.numberFormat !== undefined) {
        cellFormat.numberFormat = params.format.numberFormat;
        fieldParts.push('numberFormat');
      }

      if (fieldParts.length === 0) {
        return createErrorResponse('No formatting properties specified.');
      }

      await client.updateFormatting(
        params.spreadsheetId,
        sheetId,
        params.startRowIndex,
        params.endRowIndex,
        params.startColumnIndex,
        params.endColumnIndex,
        cellFormat,
        fieldParts.join(',')
      );

      return createTextResponse(
        `Formatting updated for ${params.sheetTitle} ` +
          `[rows ${params.startRowIndex}-${params.endRowIndex}, cols ${params.startColumnIndex}-${params.endColumnIndex}]\n\n` +
          `Applied: ${fieldParts.join(', ')}`
      );
    } catch (error) {
      logger.error(`update-formatting error: ${error}`);
      return createErrorResponse(
        `Failed to update formatting: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

// ============================================================================
// Tool Definitions
// ============================================================================

const toolDefinitions: Tool[] = [
  {
    name: 'get-spreadsheet-info',
    description:
      'Get spreadsheet metadata including title, locale, timezone, and list of all sheets with their sizes',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description:
            'The spreadsheet ID (from the URL: https://docs.google.com/spreadsheets/d/{spreadsheetId}/...)',
        },
      },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'read-values',
    description:
      'Read cell display values from a spreadsheet range. Returns a Markdown table of formatted values.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:D10", "Sheet1!A:D")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'read-formulas',
    description:
      'Read cell formulas from a spreadsheet range. Shows raw formulas like =SUM(A1:A10) instead of computed values.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:D10")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'read-all',
    description:
      'Read both display values and formulas from a range simultaneously. Returns two Markdown tables for comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:D10")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'update-cells',
    description:
      'Update cell values in a range. Supports formulas (strings starting with =). Returns updated values after write.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description: 'A1 notation range to update (e.g. "Sheet1!A1:B2")',
        },
        values: {
          type: 'array',
          description:
            '2D array of values. Use strings starting with "=" for formulas (e.g. "=SUM(A1:A10)").',
          items: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' },
              ],
            },
          },
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'batch-update-cells',
    description:
      'Update multiple ranges at once. More efficient than multiple update-cells calls. Returns updated values.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        data: {
          type: 'array',
          description: 'Array of {range, values} objects',
          items: {
            type: 'object',
            properties: {
              range: { type: 'string', description: 'A1 notation range' },
              values: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'boolean' },
                      { type: 'null' },
                    ],
                  },
                },
              },
            },
            required: ['range', 'values'],
          },
        },
      },
      required: ['spreadsheetId', 'data'],
    },
  },
  {
    name: 'append-rows',
    description:
      'Append rows to the end of data in a sheet. New rows are inserted after the last row with data.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description:
            'A1 notation range indicating sheet and columns (e.g. "Sheet1!A:D")',
        },
        values: {
          type: 'array',
          description: '2D array of rows to append',
          items: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'null' },
              ],
            },
          },
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'add-sheet',
    description: 'Add a new sheet (tab) to the spreadsheet',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        title: { type: 'string', description: 'Name for the new sheet tab' },
        rowCount: { type: 'number', description: 'Number of rows (default: 1000)' },
        columnCount: { type: 'number', description: 'Number of columns (default: 26)' },
      },
      required: ['spreadsheetId', 'title'],
    },
  },
  {
    name: 'delete-sheet',
    description:
      'Delete a sheet (tab) from the spreadsheet. Returns the sheet data before deletion as backup.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        sheetTitle: { type: 'string', description: 'Name of the sheet tab to delete' },
      },
      required: ['spreadsheetId', 'sheetTitle'],
    },
  },
  {
    name: 'get-formatting',
    description:
      'Get cell formatting information (background color, font, number format, alignment, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:D10")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'update-formatting',
    description:
      'Update cell formatting (bold, italic, colors, number format, alignment, etc.). Uses 0-based row/column indices.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        sheetTitle: { type: 'string', description: 'Name of the sheet tab' },
        startRowIndex: {
          type: 'number',
          description: 'Start row index (0-based, inclusive)',
        },
        endRowIndex: {
          type: 'number',
          description: 'End row index (0-based, exclusive)',
        },
        startColumnIndex: {
          type: 'number',
          description: 'Start column index (0-based, inclusive)',
        },
        endColumnIndex: {
          type: 'number',
          description: 'End column index (0-based, exclusive)',
        },
        format: {
          type: 'object',
          description: 'Formatting properties to apply',
          properties: {
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            strikethrough: { type: 'boolean' },
            fontSize: { type: 'number' },
            fontFamily: { type: 'string' },
            foregroundColor: {
              type: 'object',
              description: 'Text color (RGB values 0-1)',
              properties: {
                red: { type: 'number' },
                green: { type: 'number' },
                blue: { type: 'number' },
              },
            },
            backgroundColor: {
              type: 'object',
              description: 'Background color (RGB values 0-1)',
              properties: {
                red: { type: 'number' },
                green: { type: 'number' },
                blue: { type: 'number' },
              },
            },
            horizontalAlignment: {
              type: 'string',
              enum: ['LEFT', 'CENTER', 'RIGHT'],
            },
            numberFormat: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'TEXT',
                    'NUMBER',
                    'PERCENT',
                    'CURRENCY',
                    'DATE',
                    'TIME',
                    'DATE_TIME',
                    'SCIENTIFIC',
                  ],
                },
                pattern: { type: 'string' },
              },
              required: ['type'],
            },
          },
        },
      },
      required: [
        'spreadsheetId',
        'sheetTitle',
        'startRowIndex',
        'endRowIndex',
        'startColumnIndex',
        'endColumnIndex',
        'format',
      ],
    },
  },
];

// ============================================================================
// Request Handlers
// ============================================================================

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: toolDefinitions };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  logger.debug(`Tool invoked: ${name}`);

  type ToolName = keyof typeof handlers;
  const toolName = name as ToolName;

  const handler = handlers[toolName];
  if (!handler) {
    logger.error(`Unknown tool: ${name}`);
    return createErrorResponse(`Unknown tool: ${name}`);
  }

  try {
    const schema = schemas[toolName];
    if (!schema) {
      logger.error(`Schema not found for tool: ${name}`);
      return createErrorResponse(`Schema not found for tool: ${name}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validatedArgs = schema.parse(args) as any;
    return await handler(validatedArgs);
  } catch (error) {
    logger.error(`Tool execution failed: ${name} - ${error}`);

    if (error instanceof z.ZodError) {
      return createErrorResponse(
        `Invalid arguments for ${name}: ${JSON.stringify(error.errors)}`
      );
    }

    return createErrorResponse(
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// ============================================================================
// Server Startup
// ============================================================================

/* istanbul ignore next */
export async function startServer() {
  try {
    const transport = new StdioServerTransport();
    logger.info(`${SERVER_CONFIG.name} starting...`);

    await mcpServer.connect(transport);
    logger.setServer(mcpServer);
    logger.info(`${SERVER_CONFIG.name} connected successfully!`);
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

/* istanbul ignore next */
if (
  (process.argv[1] && process.argv[1].endsWith('index.ts')) ||
  process.argv[1]?.endsWith('index.js')
) {
  startServer();
}
