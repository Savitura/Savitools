/**
 * Minimal CSV helpers shared by the export endpoints (see Savitura/Savitools#147).
 *
 * - `escapeCsvField` follows RFC 4180: fields containing commas, quotes,
 *   newlines, or leading/trailing whitespace are double-quoted, and embedded
 *   quotes are doubled.
 * - `CSV_BOM` is prepended to exports so Excel opens the file with correct
 *   UTF-8 encoding instead of showing mojibake.
 */

export const CSV_BOM = '\uFEFF';

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    /^\s|\s$/.test(text)
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',');
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(toCsvRow).join('\n') + '\n';
}
