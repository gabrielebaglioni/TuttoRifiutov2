import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { hashToken } from '../worker/auth.js';
import { routeRequest } from '../worker/router.js';

export async function rocketWorkerFixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  function statement(sql, args = []) {
    return {
      bind: (...values) => statement(sql, values),
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
  }
  const objects = new Map();
  const secret = 'isolated-rocket-test-session-secret', token = 'a'.repeat(64), csrf = 'b'.repeat(64);
  db.prepare('INSERT INTO sessions(token_hash,csrf_token,expires_at,created_at) VALUES(?,?,?,?)').run(await hashToken(token, secret), csrf, Date.now() + 3600000, Date.now());
  const env = {
    SESSION_SECRET: secret,
    DB: { prepare: statement, async batch(entries) { db.exec('BEGIN'); try { const results = []; for (const entry of entries) results.push(await entry.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } },
    MEDIA: { async put(key, value) { objects.set(key, value); }, async delete(key) { objects.delete(key); }, async head(key) { return objects.has(key) ? {} : null; }, async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; } },
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
  };
  return {
    db, env,
    async fetch(path, options = {}) {
      const headers = new Headers(options.headers);
      headers.set('cookie', `tr_admin=${token}`); headers.set('origin', 'https://site.test');
      return routeRequest(new Request(new URL(path, 'https://site.test'), { ...options, headers }), env, {});
    },
    close() { db.close(); },
  };
}
