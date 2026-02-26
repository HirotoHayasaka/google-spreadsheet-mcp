/**
 * Output formatter for Google Spreadsheet MCP server
 * Converts spreadsheet data to Markdown tables
 */

const MAX_ROWS = 500;

/**
 * Format 2D array data as a Markdown table
 * First row is treated as headers if hasHeader is true
 */
export function formatAsMarkdownTable(
  data: (string | number | boolean | null | undefined)[][],
  hasHeader = false
): string {
  if (!data || data.length === 0) {
    return '(empty)';
  }

  // Determine column count from the widest row
  const colCount = Math.max(...data.map(row => row.length));
  if (colCount === 0) {
    return '(empty)';
  }

  let truncated = false;
  let rows = data;
  if (rows.length > MAX_ROWS + (hasHeader ? 1 : 0)) {
    rows = rows.slice(0, MAX_ROWS + (hasHeader ? 1 : 0));
    truncated = true;
  }

  // Generate column headers (A, B, C, ... or first row)
  let headerRow: string[];
  let dataRows: (string | number | boolean | null | undefined)[][];

  if (hasHeader && rows.length > 0) {
    headerRow = rows[0].map(cell => String(cell ?? ''));
    dataRows = rows.slice(1);
  } else {
    headerRow = Array.from({ length: colCount }, (_, i) => columnLabel(i));
    dataRows = rows;
  }

  // Pad header to colCount
  while (headerRow.length < colCount) {
    headerRow.push(columnLabel(headerRow.length));
  }

  const lines: string[] = [];

  // Header
  lines.push('| ' + headerRow.join(' | ') + ' |');
  // Separator
  lines.push('| ' + headerRow.map(() => '---').join(' | ') + ' |');
  // Data rows
  for (const row of dataRows) {
    const cells: string[] = [];
    for (let i = 0; i < colCount; i++) {
      const val = i < row.length ? row[i] : undefined;
      cells.push(escapeMarkdown(String(val ?? '')));
    }
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  let result = lines.join('\n');
  if (truncated) {
    result += `\n\n⚠️ ${MAX_ROWS}行を超えるため、先頭${MAX_ROWS}行のみ表示しています（全${data.length - (hasHeader ? 1 : 0)}行）`;
  }

  return result;
}

/**
 * Format values and formulas side by side
 */
export function formatValuesAndFormulas(
  values: (string | number | boolean | null | undefined)[][],
  formulas: (string | number | boolean | null | undefined)[][],
  range: string
): string {
  const parts: string[] = [];

  parts.push(`## Values (${range})`);
  parts.push(formatAsMarkdownTable(values));

  parts.push('');
  parts.push(`## Formulas (${range})`);
  parts.push(formatAsMarkdownTable(formulas));

  return parts.join('\n');
}

/**
 * Format spreadsheet metadata
 */
export function formatSpreadsheetInfo(info: {
  spreadsheetId: string;
  title: string;
  locale: string;
  timeZone: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    rowCount: number;
    columnCount: number;
  }>;
}): string {
  const lines: string[] = [];
  lines.push(`# ${info.title}`);
  lines.push('');
  lines.push(`- **Spreadsheet ID**: ${info.spreadsheetId}`);
  lines.push(`- **Locale**: ${info.locale}`);
  lines.push(`- **Time Zone**: ${info.timeZone}`);
  lines.push('');
  lines.push('## Sheets');
  lines.push('');
  lines.push('| Sheet Name | Sheet ID | Rows | Columns |');
  lines.push('| --- | --- | --- | --- |');
  for (const sheet of info.sheets) {
    lines.push(
      `| ${escapeMarkdown(sheet.title)} | ${sheet.sheetId} | ${sheet.rowCount} | ${sheet.columnCount} |`
    );
  }

  return lines.join('\n');
}

/**
 * Format cell formatting info
 */
export function formatCellFormatting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridData: any[],
  range: string
): string {
  const lines: string[] = [];
  lines.push(`## Cell Formatting (${range})`);
  lines.push('');

  for (const row of gridData) {
    if (!row.values) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cell of row.values) {
      if (!cell.effectiveFormat) continue;
      const addr = cell.formattedValue ?? '(empty)';
      const fmt = cell.effectiveFormat;
      const props: string[] = [];

      if (fmt.textFormat) {
        if (fmt.textFormat.bold) props.push('bold');
        if (fmt.textFormat.italic) props.push('italic');
        if (fmt.textFormat.strikethrough) props.push('strikethrough');
        if (fmt.textFormat.fontSize) props.push(`fontSize: ${fmt.textFormat.fontSize}`);
        if (fmt.textFormat.foregroundColorStyle?.rgbColor) {
          props.push(`color: ${formatColor(fmt.textFormat.foregroundColorStyle.rgbColor)}`);
        }
      }
      if (fmt.backgroundColor) {
        props.push(`bg: ${formatColor(fmt.backgroundColor)}`);
      }
      if (fmt.numberFormat) {
        props.push(`format: ${fmt.numberFormat.type} (${fmt.numberFormat.pattern || 'default'})`);
      }
      if (fmt.horizontalAlignment) {
        props.push(`align: ${fmt.horizontalAlignment}`);
      }

      if (props.length > 0) {
        lines.push(`- **${addr}**: ${props.join(', ')}`);
      }
    }
  }

  if (lines.length <= 2) {
    lines.push('No formatting data found.');
  }

  return lines.join('\n');
}

/**
 * Convert column index (0-based) to A1 notation column label
 */
function columnLabel(index: number): string {
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Escape pipe characters for Markdown tables
 */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Format RGB color object to hex string
 */
function formatColor(color: { red?: number; green?: number; blue?: number }): string {
  const r = Math.round((color.red ?? 0) * 255);
  const g = Math.round((color.green ?? 0) * 255);
  const b = Math.round((color.blue ?? 0) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
