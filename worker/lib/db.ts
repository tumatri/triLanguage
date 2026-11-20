/**
 * PostgreSQL database client using the 'postgres' npm package.
 * Replaces Cloudflare D1 Database binding.
 */
import postgres from 'postgres';
import type { Sql } from 'postgres';

export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  maybeOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  none(sql: string, params?: unknown[]): Promise<void>;
}

let _client: Sql | undefined;

export function getDb(url: string, max = 10): DbClient {
  if (!_client) {
    _client = postgres(url, { max, idle_timeout: 30, connect_timeout: 10 });
  }
  return new PgClient(_client);
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = undefined;
  }
}

class PgClient implements DbClient {
  constructor(private readonly sql: Sql) {}

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const rows = await this.sql.unsafe(sql, (params ?? []) as Parameters<Sql['unsafe']>[1]);
    return rows as unknown as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T> {
    const [row] = await this.sql.unsafe(sql, (params ?? []) as Parameters<Sql['unsafe']>[1]);
    return row as unknown as T;
  }

  async maybeOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
    const [row] = await this.sql.unsafe(sql, (params ?? []) as Parameters<Sql['unsafe']>[1]);
    return (row ?? null) as unknown as T | null;
  }

  async none(sql: string, params?: unknown[]): Promise<void> {
    await this.sql.unsafe(sql, (params ?? []) as Parameters<Sql['unsafe']>[1]);
  }
}
