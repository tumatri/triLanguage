export interface OutboxEntry {
  id: string;
  notebook_id: string;
  operation: 'review_log' | 'card_progress' | 'exercise_session';
  payload_json: string;
  created_at: string;
  synced_at: string | null;
  attempt_count: number;
}

// Browser-only IndexedDB wrapper — Dexie loaded at runtime to avoid SSR/Node issues
let _dexie: any = null;

async function getDexie(): Promise<any> {
  if (_dexie) return _dexie;
  try {
    const mod = await import('dexie');
    const DexieCtor = (mod as any).default ?? mod;
    const D = new DexieCtor('triLanguageDb');
    (D as any).version(1).stores({
      outbox: 'id, notebook_id, operation, created_at, synced_at, attempt_count'
    });
    _dexie = D;
  } catch {
    // Dexie unavailable (server environment)
    return null;
  }
  return _dexie;
}

export async function enqueueOperation(entry: Omit<OutboxEntry, 'synced_at' | 'attempt_count'>): Promise<string> {
  const id = crypto.randomUUID();
  const db = await getDexie();
  if (!db) throw new Error('IndexedDB not available');
  await (db.outbox as any).add({ ...entry, synced_at: null, attempt_count: 0 });
  return id;
}

export async function getPendingOperations(limit = 50): Promise<OutboxEntry[]> {
  const db = await getDexie();
  if (!db) return [];
  const rows = await (db.outbox as any)
    .where('synced_at')
    .equals(null)
    .sortBy('created_at');
  return (rows as OutboxEntry[]).slice(0, limit);
}

export async function markSynced(entryId: string): Promise<void> {
  const db = await getDexie();
  if (!db) return;
  await (db.outbox as any).update(entryId, { synced_at: new Date().toISOString() });
}

export async function pruneSynced(beforeMs: number): Promise<number> {
  const db = await getDexie();
  if (!db) return 0;
  const before = new Date(beforeMs).toISOString();
  const entries = await (db.outbox as any).where('synced_at').below(before).toArray();
  if (entries.length === 0) return 0;
  await (db.outbox as any).bulkDelete(entries.map((e: OutboxEntry) => e.id));
  return entries.length;
}
