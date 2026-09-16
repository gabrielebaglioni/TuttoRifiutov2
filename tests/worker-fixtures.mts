import assert from 'node:assert/strict';
import type { WorkerDatabase, MediaStore } from '../worker/types.ts';
import type { SQLInputValue } from 'node:sqlite';
import type { D1PreparedStatement, D1Result, R2PutOptions } from '@cloudflare/workers-types/index.ts';

export type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
export type SqlRow = Record<string, unknown>;
export type StatementDouble = {
  bind?: (...values: unknown[]) => StatementDouble;
  first?: () => Promise<unknown>;
  all?: () => Promise<unknown>;
  run?: () => Promise<unknown>;
};
export type DatabaseDouble = {
  prepare(sql: string): StatementDouble;
  batch?: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
};

export function record(value: unknown): asserts value is SqlRow {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'SQL fixture must return a row object');
}
export async function jsonRecord(response: Response): Promise<SqlRow> {
  const value: unknown = await response.json(); record(value); return value;
}
export function recordRows(value: unknown): SqlRow[] {
  assert.ok(Array.isArray(value));
  return value.map((row: unknown) => { record(row); return row; });
}
export async function jsonRows(response: Response): Promise<SqlRow[]> { return recordRows(await response.json()); }
// D1 itself exposes caller-selected T for query results. This is the sole
// trusted-query assertion: the mock validates row structure, not the query's T.
function queryRow<T>(value: unknown): T {
  record(value);
  return value as T;
}
function result<T>(value: unknown): D1Result<T> {
  if (Array.isArray(value)) return result({ results: value });
  record(value);
  const rows = value.results ?? [];
  assert.ok(Array.isArray(rows));
  const meta = value.meta ?? {};
  record(meta);
  const changes = typeof meta.changes === 'number' ? meta.changes : 0;
  return { success: true, results: rows.map(row => queryRow<T>(row)), meta: {
    duration: 0, size_after: 0, rows_read: rows.length, rows_written: changes,
    last_row_id: typeof meta.last_row_id === 'number' ? meta.last_row_id : 0,
    changed_db: changes > 0, changes,
  } };
}
export function d1Statement(source: StatementDouble): D1PreparedStatement {
  return {
    bind(...values: unknown[]) {
      assert.ok(source.bind, 'fixture does not implement bind');
      return d1Statement(source.bind(...values));
    },
    async first<T>(column?: string): Promise<T | null> {
      assert.ok(source.first, 'fixture does not implement first');
      const row: unknown = await source.first();
      if (row === null || row === undefined) return null;
      record(row);
      if (column !== undefined) {
        const value = row[column];
        assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value) || value instanceof ArrayBuffer, 'SQL column must be a scalar');
        return value as T;
      }
      return queryRow<T>(row);
    },
    async all<T>() {
      assert.ok(source.all, 'fixture does not implement all');
      return result<T>(await source.all());
    },
    async run<T>() {
      assert.ok(source.run, 'fixture does not implement run');
      return result<T>(await source.run());
    },
    async raw<T>(_options?: { columnNames?: boolean }): Promise<never> {
      throw new Error('raw SQL is not consumed by this fixture');
    },
  };
}

export function d1Double<T extends DatabaseDouble>(source: T): Omit<T, 'prepare' | 'batch'> & WorkerDatabase {
  const prepare = source.prepare.bind(source);
  const batch = source.batch?.bind(source);
  return Object.assign(source, {
    prepare(sql: string) { return d1Statement(prepare(sql)); },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      if (batch) return (await batch(statements)).map(value => result<T>(value));
      return Promise.all(statements.map(statement => statement.run<T>()));
    },
  });
}

export function sqlString(value: unknown): string { assert.equal(typeof value, 'string'); assert.ok(typeof value === 'string'); return value; }
export function sqlNumber(value: unknown): number { assert.equal(typeof value, 'number'); assert.ok(typeof value === 'number'); return value; }
export function sqlInput(value: unknown): SQLInputValue {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  assert.ok(value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint');
  return value;
}
export function required<T>(value: T | null | undefined): T { assert.ok(value !== null && value !== undefined); return value; }

export type ObjectDouble = { body: ReadableStream; httpEtag?: string; writeHttpMetadata?: (headers: Headers) => void };
export type R2Double = {
  get?: (key: string) => Promise<ObjectDouble | null | undefined>;
  put?: (key: string, value: Parameters<MediaStore['put']>[1], options?: R2PutOptions) => Promise<unknown>;
  delete?: (key: string | string[]) => Promise<void>;
};
export function r2Object(_key: string, source?: ObjectDouble) {
  const body = source?.body ?? new Blob([]).stream();
  return {
    httpEtag: source?.httpEtag ?? '"fixture-etag"', body,
    writeHttpMetadata(headers: Headers) { source?.writeHttpMetadata?.(headers); },
  };
}
export function r2Double<T extends R2Double>(source: T): Omit<T, 'get' | 'put' | 'delete'> & MediaStore {
  const get = source.get?.bind(source), put = source.put?.bind(source), remove = source.delete?.bind(source);
  return Object.assign(source, {
    async get(key: string) { const found = await get?.(key); return found ? r2Object(key, found) : null; },
    async put(key: string, value: Parameters<MediaStore['put']>[1], options?: R2PutOptions) {
      assert.ok(put, 'fixture does not implement put');
      await put(key, value, options); return r2Object(key);
    },
    async delete(key: string | string[]) { assert.ok(remove, 'fixture does not implement delete'); await remove(key); },
  });
}
