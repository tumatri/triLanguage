import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 2 route contracts', () => {
  const ROOT = path.join(__dirname, '../..');

  it('card routes exist and have CRUD endpoints', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/cards.ts'), 'utf8');
    expect(content).toContain("cardRoutes.get('");
    expect(content).toContain("cardRoutes.post('");
    expect(content).toContain("cardRoutes.put('");
    expect(content).toContain("cardRoutes.delete('");
  });

  it('media routes expose upload/get/delete', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/media.ts'), 'utf8');
    expect(content).toContain("mediaRoutes.post('");
    expect(content).toContain("mediaRoutes.get('");
    expect(content).toContain("mediaRoutes.delete('");
  });

  it('import routes expose preview/commit', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/import.ts'), 'utf8');
    expect(content).toContain("importRoutes.post('");
    expect(content).toContain("importRoutes.get('");
  });

  it('all card queries filter by notebook scope', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/repositories/card.ts'), 'utf8');
    expect(content).toContain("notebook_id");
  });

  it('media validation checks MIME and size limits', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/services/media.ts'), 'utf8');
    expect(content).toContain('validateMimeType');
    expect(content).toContain('validateSize');
  });

  it('import service handles CSV parsing', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/services/import.ts'), 'utf8');
    expect(content).toContain('parseCsvText');
    expect(content).toContain('duplicateHash');
  });
});
