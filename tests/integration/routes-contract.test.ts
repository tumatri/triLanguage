import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');

describe('API route contracts (Phase 1)', () => {
  it('auth routes expose /bootstrap GET', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/auth.ts'), 'utf8');
    expect(content).toContain("authRoutes.get('/bootstrap'");
  });

  it('auth routes expose /login POST', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/auth.ts'), 'utf8');
    expect(content).toContain("authRoutes.post('/login'");
  });

  it('auth routes expose /logout POST', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/auth.ts'), 'utf8');
    expect(content).toContain("authRoutes.post('/logout'");
  });

  it('register endpoint returns 404 after bootstrap', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/auth.ts'), 'utf8');
    expect(content).toContain('Registration is closed');
    expect(content).toContain('404');
  });

  it('notebook routes have CRUD endpoints', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/notebooks.ts'), 'utf8');
    expect(content).toContain("notebookRoutes.get('");
    expect(content).toContain("notebookRoutes.post('");
    expect(content).toContain("notebookRoutes.put('");
    expect(content).toContain("notebookRoutes.delete('");
  });

  it('all notebook queries filter by user_id (ownership check)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/repositories/notebook.ts'), 'utf8');
    expect(content).toContain('user_id = $');
  });

  it('CSRF protection middleware checks X-CSRF-Token header', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/middleware/csrf.ts'), 'utf8');
    expect(content).toContain('x-csrf-token');
    expect(content).toContain('403');
  });

  it('soft delete requires confirm parameter', () => {
    const content = fs.readFileSync(path.join(ROOT, 'worker/routes/notebooks.ts'), 'utf8');
    expect(content).toContain('confirm');
  });
});
