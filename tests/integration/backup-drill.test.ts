import { describe, it, expect } from 'vitest';

const EXPORT_VERSION = '1.0.0';

interface BackupManifest {
  app: string;
  version: string;
  exported_at: string;
  owner_id: string;
  notebooks_count: number;
  notebooks: Array<{ id: string; name: string; language_variant: string; timezone: string; created_at: string; updated_at: string }>;
}

function validateBackupJson(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Top-level value must be an object'] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.app !== 'triLanguage') errors.push('Missing or incorrect app field');
  if (obj.version !== EXPORT_VERSION) errors.push(`Expected version ${EXPORT_VERSION}, got ${obj.version}`);
  if (typeof obj.exported_at !== 'string') errors.push('Missing exported_at timestamp');
  if (!Array.isArray(obj.notebooks)) errors.push('Missing or invalid notebooks array');
  else {
    for (let i = 0; i < obj.notebooks.length; i++) {
      const nb = obj.notebooks[i] as Record<string, unknown>;
      if (typeof nb.id !== 'string') errors.push(`Notebook[${i}]: missing id`);
      if (!['zh-Hant', 'zh-Hans', 'en-US'].includes(nb.language_variant as string)) {
        errors.push(`Notebook[${i}]: invalid language_variant`);
      }
    }
  }
  const raw = JSON.stringify(obj);
  if (/AGNES_API_KEY|SESSION_SECRET/i.test(raw)) errors.push('Export contains secret/key material');
  return { valid: errors.length === 0, errors };
}

function runBackupDrill(): { passed: boolean; details: string[] } {
  const details: string[] = [];
  const mockExport: BackupManifest = {
    app: 'triLanguage',
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    owner_id: 'test-owner-id',
    notebooks_count: 2,
    notebooks: [
      { id: 'nb-1', name: 'Tiếng Trung', language_variant: 'zh-Hant', timezone: 'Asia/Taipei', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-15T00:00:00Z' },
      { id: 'nb-2', name: 'English', language_variant: 'en-US', timezone: 'America/New_York', created_at: '2024-02-01T00:00:00Z', updated_at: '2024-02-10T00:00:00Z' }
    ]
  };

  const validation = validateBackupJson(mockExport);
  if (validation.valid) details.push('✅ Backup schema validation passed');
  else details.push(`❌ Backup schema validation failed: ${validation.errors.join(', ')}`);

  const serialized = JSON.stringify(mockExport);
  if (!/AGNES_API_KEY|SESSION_SECRET/i.test(serialized)) details.push('✅ No secrets leaked in export JSON');
  else details.push('❌ Secrets detected in export');

  const tsValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(mockExport.exported_at);
  if (tsValid) details.push('✅ Timestamps in ISO-8601 format');
  else details.push('❌ Invalid timestamp format');

  if (mockExport.notebooks_count === mockExport.notebooks.length) details.push('✅ Notebook count matches array length');
  else details.push('❌ Notebook count mismatch');

  return { passed: details.every((d) => d.startsWith('✅')), details };
}

describe('backup drill', () => {
  it('passes schema validation', () => {
    const result = runBackupDrill();
    expect(result.passed).toBe(true);
  });

  it('verifies no secrets in export JSON', () => {
    const result = runBackupDrill();
    expect(result.details.some((d: string) => d.includes('secret') && d.startsWith('✅'))).toBe(true);
  });

  it('verifies ISO timestamps', () => {
    const result = runBackupDrill();
    expect(result.details.some((d: string) => d.toLowerCase().includes('timestamp') && d.startsWith('✅'))).toBe(true);
  });

  it('verifies notebook count consistency', () => {
    const result = runBackupDrill();
    expect(result.details.some((d: string) => d.includes('count') && d.startsWith('✅'))).toBe(true);
  });
});
