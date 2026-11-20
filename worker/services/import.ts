import type { Env } from '../types';
import type { CreateImportInput, ColumnMapping } from '../schemas/import';
import { generateId, nowISO } from '../lib/crypto';
import { computeDuplicateHash } from '../lib/duplicateHash';
import { getDb } from '../lib/db';

export interface ParsedRow {
  [key: string]: string | null;
}

export interface ImportPreviewItem {
  front_text: string;
  card_type: string;
  fields: Record<string, unknown>;
  is_duplicate: boolean;
  duplicate_notebook_id?: string;
}

export interface ImportResult {
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  errorRows: number;
  preview: ImportPreviewItem[];
}

function parseCsvText(text: string, separator: ',' | '\t'): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === separator && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += char; }
    }
    values.push(current.trim());
    const row: ParsedRow = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
    rows.push(row);
  }
  return rows;
}

function parseJsonText(text: string): ParsedRow[] {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => {
      const row: ParsedRow = {};
      for (const key of Object.keys(item)) row[key] = String(item[key] ?? '');
      return row;
    });
  } catch { return []; }
}

export async function runImport(
  env: Env,
  ownerId: string,
  input: CreateImportInput,
  fileContent: string
): Promise<ImportResult> {
  const db = getDb(env.DATABASE_URL);
  const format = input.format;
  const mapping = input.mapping;
  const separator: ',' | '\t' = format === 'tsv' ? '\t' : ',';

  const rows = format === 'json' ? parseJsonText(fileContent) : parseCsvText(fileContent, separator);
  if (rows.length === 0) {
    return { totalRows: 0, insertedRows: 0, duplicateRows: 0, errorRows: 0, preview: [] };
  }

  const notebook = await db.maybeOne<{ id: string; language_variant: string }>(
    `SELECT id, language_variant FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.notebook_id, ownerId]
  );
  if (!notebook) {
    return { totalRows: 0, insertedRows: 0, duplicateRows: 0, errorRows: rows.length, preview: [] };
  }

  const result: ImportResult = { totalRows: rows.length, insertedRows: 0, duplicateRows: 0, errorRows: 0, preview: [] };

  const frontColumn = findColumn(mapping, ['front', 'word', 'term', ' từ ', 'từ']);
  const typeColumn = findColumn(mapping, ['type', 'card_type', 'kind']);
  const fieldsColumns = Object.entries(mapping)
    .filter(([col]) => col !== frontColumn && col !== typeColumn)
    .map(([col, field]) => ({ col, field }));

  const insertParams: unknown[] = [];
  let insertCount = 0;

  for (const row of rows) {
    const frontText = row[frontColumn];
    if (!frontText || frontText.trim() === '') { result.errorRows++; continue; }

    const cardType = row[typeColumn] || 'vocab';
    const normalizedFront = frontText.trim();
    const duplicateHash = await computeDuplicateHash(notebook.id, notebook.language_variant, cardType, normalizedFront);

    const existing = await db.maybeOne<{ id: string; notebook_id: string }>(
      `SELECT id, notebook_id FROM cards WHERE notebook_id = $1 AND duplicate_hash = $2 AND archived_at IS NULL LIMIT 1`,
      [notebook.id, duplicateHash]
    );

    const isDuplicate = !!existing;
    const fields: Record<string, unknown> = {};
    for (const { col, field } of fieldsColumns) {
      const value = row[col];
      if (value && value.trim()) fields[field] = value.trim();
    }

    result.preview.push({ front_text: normalizedFront, card_type: cardType, fields, is_duplicate: isDuplicate, duplicate_notebook_id: existing?.notebook_id });

    if (!isDuplicate && !input.dry_run) {
      const cardId = generateId();
      const now = nowISO();
      const fieldsJson = Object.keys(fields).length > 0 ? JSON.stringify(fields) : null;
      insertParams.push(cardId, notebook.id, cardType, normalizedFront, fieldsJson, duplicateHash, now, now);
      insertCount++;
    }
  }

  // Batch INSERT using PostgreSQL VALUES multi-row syntax
  if (!input.dry_run && insertParams.length > 0) {
    const batchCount = insertCount;
    const paramOffset = 0;
    // Build single multi-row INSERT
    const placeholders: string[] = [];
    const allParams: unknown[] = [];
    for (let i = 0; i < batchCount; i++) {
      const slice = insertParams.slice(i * 8, (i + 1) * 8) as [string, string, string, string, string | null, string, string, string];
      placeholders.push(`($${paramOffset + i * 8 + 1},$${paramOffset + i * 8 + 2},$${paramOffset + i * 8 + 3},$${paramOffset + i * 8 + 4},$${paramOffset + i * 8 + 5},$${paramOffset + i * 8 + 6},$${paramOffset + i * 8 + 7},$${paramOffset + i * 8 + 8})`);
      allParams.push(...slice);
    }
    try {
      await db.none(
        `INSERT INTO cards (id, notebook_id, card_type, front_text, fields_json, duplicate_hash, created_at, updated_at) VALUES ${placeholders.join(',')}`,
        allParams
      );
      result.insertedRows = batchCount;
    } catch {
      result.errorRows += batchCount;
    }
  }

  result.duplicateRows = result.preview.filter(p => p.is_duplicate).length;
  await saveImportJob(env, input, rows.length, result.insertedRows, result.duplicateRows, result.errorRows);
  return result;
}

async function saveImportJob(env: Env, input: CreateImportInput, totalRows: number, insertedRows: number, duplicateRows: number, errorRows: number): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  const id = generateId();
  const createdAt = nowISO();
  const status = errorRows > 0 ? 'failed' : 'completed';
  await db.none(
    `INSERT INTO import_jobs (id, notebook_id, file_name, format, mapping_json, total_rows, inserted_rows, duplicate_rows, error_rows, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, input.notebook_id, input.file_name, input.format, JSON.stringify(input.mapping), totalRows, insertedRows, duplicateRows, errorRows, status, createdAt]
  );
}

function findColumn(mapping: ColumnMapping, keywords: string[]): string {
  for (const [col] of Object.entries(mapping)) {
    const lower = col.toLowerCase();
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) return col;
  }
  for (const [col] of Object.entries(mapping)) {
    const lower = col.toLowerCase();
    if (lower.includes('front') || lower.includes('word') || lower.includes('term') || lower.includes('from')) return col;
  }
  const entries = Object.entries(mapping);
  return entries.length > 0 ? entries[0][0] : '';
}
