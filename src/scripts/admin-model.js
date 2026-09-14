export function buildContentRequest(key, value) {
  return { path: `/api/admin/content/${encodeURIComponent(key)}`, method: "PUT", body: { value } };
}

export function setAtPath(value, path, next) {
  if (!path.length) return next;
  const [head, ...tail] = path;
  const copy = Array.isArray(value)
    ? value.slice()
    : typeof head === "number"
      ? []
      : { ...(value && typeof value === "object" ? value : {}) };
  copy[head] = setAtPath(value == null ? undefined : value[head], tail, next);
  return copy;
}

function getAtPath(value, path) {
  return path.reduce((current, key) => current == null ? undefined : current[key], value);
}

function clone(value) {
  return structuredClone(value);
}

function startsWithPrefix(key, prefix) {
  return key === prefix || key.startsWith(`${prefix}:`);
}

function normalizePath(path) {
  return Array.isArray(path) ? path.slice() : [path];
}

function pathKey(path) {
  return JSON.stringify(path);
}

function isPathPrefix(parent, child) {
  return parent.length <= child.length && parent.every((part, index) => part === child[index]);
}

function markDirtyPath(record, path) {
  const normalized = normalizePath(path);
  const existing = [...record.dirtyPaths.values()];
  if (existing.some((candidate) => isPathPrefix(candidate, normalized))) return;
  for (const candidate of existing) {
    if (isPathPrefix(normalized, candidate)) record.dirtyPaths.delete(pathKey(candidate));
  }
  record.dirtyPaths.set(pathKey(normalized), normalized);
}

export class DirtyResources {
  #items = new Set();
  mark(key) { this.#items.add(key); }
  clear(key) { this.#items.delete(key); }
  clearPrefix(prefix) {
    let cleared = 0;
    for (const key of [...this.#items]) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from, to) {
    const moved = [...this.#items].filter((key) => startsWithPrefix(key, from));
    for (const key of moved) { this.#items.delete(key); this.#items.add(`${to}${key.slice(from.length)}`); }
    return moved.length;
  }
  reset() { this.#items.clear(); }
  has(key) { return this.#items.has(key); }
  get count() { return this.#items.size; }
  get dirty() { return this.#items.size > 0; }
}

export class AdminDrafts {
  #items = new Map();
  #record(key) { return this.#items.get(key); }
  begin(key, value) {
    if (!this.#items.has(key)) this.#items.set(key, { value: clone(value), revision: 0, dirtyPaths: new Map() });
    return this.#record(key).value;
  }
  get(key) { return this.#record(key)?.value; }
  dirtyPaths(key) { return [...(this.#record(key)?.dirtyPaths.values() ?? [])].map((path) => path.slice()); }
  isPathDirty(key, path) {
    const normalized = normalizePath(path);
    return this.dirtyPaths(key).some((candidate) => isPathPrefix(candidate, normalized) || isPathPrefix(normalized, candidate));
  }
  snapshot(key) {
    const record = this.#record(key);
    return { revision: record?.revision ?? -1 };
  }
  snapshotPrefix(prefix) {
    return [...this.#items.entries()]
      .filter(([key]) => startsWithPrefix(key, prefix))
      .map(([key, record]) => ({ key, revision: record.revision }));
  }
  set(key, path, value) {
    const record = this.#record(key);
    if (!record) throw new Error(`Missing draft resource: ${key}`);
    const normalized = normalizePath(path);
    record.value = setAtPath(record.value, normalized, clone(value));
    markDirtyPath(record, normalized);
    record.revision += 1;
    return record.value;
  }
  replace(key, value) {
    const record = this.#record(key);
    if (record) {
      record.value = clone(value);
      markDirtyPath(record, []);
      record.revision += 1;
      return record.value;
    }
    this.#items.set(key, { value: clone(value), revision: 0, dirtyPaths: new Map([[pathKey([]), []]]) });
    return this.#record(key).value;
  }
  rebase(key, serverValue, { expectedRevision } = {}) {
    const record = this.#record(key);
    if (!record) {
      this.#items.set(key, { value: clone(serverValue), revision: 0, dirtyPaths: new Map() });
      return { applied: true, value: this.get(key), revision: 0 };
    }
    if (expectedRevision !== undefined && record.revision !== expectedRevision) return { applied: false, value: record.value, revision: record.revision };
    let next = clone(serverValue);
    for (const path of record.dirtyPaths.values()) {
      next = setAtPath(next, path, clone(getAtPath(record.value, path)));
    }
    record.value = next;
    record.revision += 1;
    return { applied: true, value: record.value, revision: record.revision };
  }
  clear(key, { expectedRevision } = {}) {
    const record = this.#record(key);
    if (!record || (expectedRevision !== undefined && record.revision !== expectedRevision)) return false;
    this.#items.delete(key);
    return true;
  }
  clearPrefix(prefix) {
    let cleared = 0;
    for (const key of [...this.#items.keys()]) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from, to) {
    const moved = [...this.#items.entries()].filter(([key]) => startsWithPrefix(key, from));
    for (const [key, record] of moved) {
      this.#items.delete(key);
      this.#items.set(`${to}${key.slice(from.length)}`, record);
    }
    return moved.length;
  }
  reset() { this.#items.clear(); }
}

export class BusyResources {
  #items = new Map();
  #generation = 0;
  acquire(key) {
    if (this.#items.has(key)) return null;
    const token = ++this.#generation;
    this.#items.set(key, token);
    return token;
  }
  release(key, token) {
    if (!Number.isSafeInteger(token)) return false;
    if (this.#items.get(key) === token) {
      this.#items.delete(key);
      return true;
    }
    for (const [activeKey, activeToken] of this.#items) {
      if (activeToken === token) {
        this.#items.delete(activeKey);
        return true;
      }
    }
    return false;
  }
  clearPrefix(prefix) {
    let cleared = 0;
    for (const key of this.#items.keys()) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from, to) {
    const moved = [...this.#items].filter(([key]) => startsWithPrefix(key, from));
    for (const [key, token] of moved) {
      this.#items.delete(key);
      const target = `${to}${key.slice(from.length)}`;
      // A newer operation may already own the canonical key.  Dropping the
      // remapped token is safer than letting its eventual completion release
      // that newer operation.
      if (!this.#items.has(target)) this.#items.set(target, token);
    }
    return moved.length;
  }
  reset() { this.#items.clear(); }
  has(key) { return this.#items.has(key); }
  get busy() { return this.#items.size > 0; }
}

export class AuthEpoch {
  #value = 0;
  capture() { return this.#value; }
  invalidate() { this.#value += 1; return this.#value; }
  isCurrent(value) { return value === this.#value; }
}

export function updateDraft(drafts, dirty, resource, path, next) {
  const control = next && typeof next === "object" && Object.prototype.hasOwnProperty.call(next, "value") ? next : null;
  drafts.set(resource, path, control ? control.value : next);
  dirty.mark(resource);
  return control ?? next;
}

export async function runBusyResource(busy, resource, work) {
  const token = busy.acquire(resource);
  if (token === null) return { started: false };
  try { return { started: true, value: await work(token) }; }
  finally { busy.release(resource, token); }
}

export function collectionSlugControl(item) {
  return { value: String(item?.slug ?? ""), readOnly: !item?.isNew };
}

function fallbackMediaSlots(item) {
  const fallback = [];
  const cover = item?.coverMedia ?? item?.cardMedia;
  if (cover) fallback.push({ ...cover, role: "cover", position: 0, virtual: true });
  const details = Array.isArray(item?.detailMedia) ? item.detailMedia : [];
  details.forEach((entry, position) => {
    if (entry) fallback.push({ ...entry, role: "detail", position, virtual: true });
  });
  return fallback;
}

function validMediaSlot(entry) {
  return entry && typeof entry === "object" && ["cover", "detail"].includes(entry.role)
    && Number.isSafeInteger(entry.position) && entry.position >= 0
    && (entry.role !== "cover" || entry.position === 0)
    && (entry.state === undefined || entry.state === "active");
}

export function mergeMediaSlots(item) {
  const slots = new Map();
  for (const entry of fallbackMediaSlots(item)) slots.set(`${entry.role}:${entry.position}`, entry);
  const stored = Array.isArray(item?.media) ? item.media.filter(validMediaSlot) : [];
  for (const entry of stored) slots.set(`${entry.role}:${entry.position}`, { ...entry });
  return [...slots.values()].sort((left, right) => {
    const role = (left.role === "cover") - (right.role === "cover");
    return role ? -role : left.position - right.position || (left.id ?? 0) - (right.id ?? 0);
  });
}

export function mediaPreviewKind(media) {
  return media?.type === "video" || /\.(?:mp4|webm|ogv|ogg)(?:$|[?#])/i.test(media?.src ?? "") ? "video" : "image";
}

export function buildCollectionReorderRequest(kind, items) {
  return { path: `/api/admin/${kind}/_order`, method: "PUT", body: { items: items.map(({ slug, position }) => ({ slug, position })) } };
}

export function buildMediaMetadataRequest(ownerType, id, { role, alt, position }) {
  return { path: `/api/admin/media/${ownerType}/${id}`, method: "PUT", body: { role, alt, position } };
}

export function buildMediaOrderRequest(ownerType, ownerSlug, items) {
  return {
    path: "/api/admin/media/_order",
    method: "PUT",
    body: { ownerType, ownerSlug, items: items.map(({ id, position }) => ({ id, position })) },
  };
}
