import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { hashToken } from '../worker/auth.ts';
import { routeRequest } from '../worker/router.ts';
import { d1Double, r2Double, sqlInput } from './worker-fixtures.mts';
import type { WorkerEnv, MediaStore } from '../worker/types.ts';
import type { SQLInputValue } from 'node:sqlite';
import type { D1PreparedStatement } from '@cloudflare/workers-types/index.ts';
import assert from 'node:assert/strict';

export async function rocketWorkerFixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  function statement(sql: string, args: SQLInputValue[] = []) {
    return {
      bind: (...values: unknown[]) => statement(sql, values.map(sqlInput)),
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
  }
  const objects = new Map<string, Blob>();
  const secret = 'isolated-rocket-test-session-secret', token = 'a'.repeat(64), csrf = 'b'.repeat(64);
  db.prepare('INSERT INTO sessions(token_hash,csrf_token,expires_at,created_at) VALUES(?,?,?,?)').run(await hashToken(token, secret), csrf, Date.now() + 3600000, Date.now());
  const env: WorkerEnv = {
    SESSION_SECRET: secret,
    DB: d1Double({ prepare: statement, async batch(entries: D1PreparedStatement[]) { db.exec('BEGIN'); try { const results = []; for (const entry of entries) results.push(await entry.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } }),
    MEDIA: r2Double({ async put(key: string, value: Parameters<MediaStore['put']>[1]) { assert.ok(value instanceof Blob); objects.set(key, value); }, async delete(key: string | string[]) { assert.ok(typeof key === 'string'); objects.delete(key); }, async get(key: string) { const value = objects.get(key); return value ? { body: value.stream() } : null; } }),
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
  };
  return {
    db, env,
    async fetch(path: RequestInfo | URL, options: RequestInit = {}) {
      const headers = new Headers(options.headers ?? (path instanceof Request ? path.headers : undefined));
      headers.set('cookie', `tr_admin=${token}`); headers.set('origin', 'https://site.test');
      const target = path instanceof Request ? path : new URL(path, 'https://site.test');
      return routeRequest(new Request(target, { ...options, headers }), env, {});
    },
    close() { db.close(); },
  };
}
