export function getContentOverrides(db) {
  return db.prepare("SELECT key, value_json, published, updated_at FROM content_entries WHERE published = 1 ORDER BY key").all();
}

export function getContentOverridesForKeys(db, keys) {
  if (!Array.isArray(keys) || !keys.length) return Promise.resolve([]);
  const placeholders = keys.map(() => "?").join(", ");
  return db.prepare(`SELECT key, value_json, published, updated_at FROM content_entries WHERE published = 1 AND key IN (${placeholders}) ORDER BY key`).bind(...keys).all();
}

export async function setContentOverride(db, key, value, updatedAt = Date.now()) {
  return db.prepare(`
    INSERT INTO content_entries (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value), updatedAt).run();
}

export function deleteContentOverride(db, key) {
  return db.prepare("DELETE FROM content_entries WHERE key = ?").bind(key).run();
}

const collections = {
  events: "events",
  archive: "archive_items",
};

export function getCollectionOverrides(db, kind) {
  const table = collections[kind];
  if (!table) throw new TypeError("Unsupported collection kind");
  return db.prepare(`SELECT * FROM ${table} ORDER BY position, id`).all();
}

export function createSession(db, tokenHash, csrfToken, expiresAt, createdAt = Date.now()) {
  return db.prepare("INSERT INTO sessions (token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, csrfToken, expiresAt, createdAt).run();
}

export function getSession(db, tokenHash) {
  return db.prepare("SELECT id, token_hash, csrf_token, expires_at FROM sessions WHERE token_hash = ?").bind(tokenHash).first();
}

export function deleteSession(db, tokenHash) {
  return db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function addLoginAttempt(db, ipHash, attemptedAt = Date.now()) {
  return db.prepare("INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ipHash, attemptedAt).run();
}

export function countRecentLoginAttempts(db, ipHash, since) {
  return db.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE ip_hash = ? AND attempted_at >= ?").bind(ipHash, since).first();
}

export function pruneLoginAttempts(db, before) {
  return db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(before).run();
}

export function reserveLoginAttempt(db, ipHash, attemptedAt, since, limit) {
  return db.prepare(`
    INSERT INTO login_attempts (ip_hash, attempted_at)
    SELECT ?, ?
    WHERE (SELECT COUNT(*) FROM login_attempts WHERE ip_hash = ? AND attempted_at >= ?) < ?
    RETURNING id
  `).bind(ipHash, attemptedAt, ipHash, since, limit).first();
}

export function deleteLoginAttempt(db, id) {
  return db.prepare("DELETE FROM login_attempts WHERE id = ?").bind(id).run();
}

const mediaTables = {
  events: { table: "event_media", parent: "event_id" },
  archive: { table: "archive_media", parent: "archive_item_id" },
};

export function getMediaForCollectionItem(db, kind, parentId) {
  const media = mediaTables[kind];
  if (!media) throw new TypeError("Unsupported collection kind");
  return db.prepare(`SELECT * FROM ${media.table} WHERE ${media.parent} = ? AND state = 'active' ORDER BY position, id`).bind(parentId).all();
}

export function insertMedia(db, kind, parentId, key, role, alt, position, widths) {
  const media = mediaTables[kind];
  if (!media) throw new TypeError("Unsupported collection kind");
  return db.prepare(`INSERT INTO ${media.table} (${media.parent}, key, role, alt, position, widths_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(parentId, key, role, alt, position, JSON.stringify(widths), Date.now()).run();
}

export function deleteMedia(db, kind, id) {
  const media = mediaTables[kind];
  if (!media) throw new TypeError("Unsupported collection kind");
  return db.prepare(`DELETE FROM ${media.table} WHERE id = ?`).bind(id).run();
}
