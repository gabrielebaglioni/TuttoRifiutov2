import { isRecord, isMedia, readMedia, readChild, type Kind, type Item, type Media, type MediaDraft, type Path } from './admin-types.ts';
interface DraftRecord { value: unknown; revision: number; dirtyPaths: Map<string, Path> }
export function buildContentRequest(key: string, value: unknown) {
  return { path: `/api/admin/content/${encodeURIComponent(key)}`, method: "PUT", body: { value } };
}

export function setAtPath(value: unknown, path: Path, next: unknown): unknown {
  if (!path.length) return next;
  const [head, ...tail] = path;
  if (head === undefined) return next;
  const copy: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? value.slice()
    : typeof head === "number"
      ? []
      : { ...(value && isRecord(value) ? value : {}) };
  const result = setAtPath(readChild(value, head), tail, next);
  if (Array.isArray(copy)) { if (typeof head === "number") copy[head] = result; else Object.defineProperty(copy, head, {value: result, enumerable: true, writable: true, configurable: true}); }
  else copy[String(head)] = result;
  return copy;
}

function getAtPath(value: unknown, path: Path) {
  return path.reduce<unknown>((current, key) => readChild(current, key), value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function startsWithPrefix(key: string, prefix: string) {
  return key === prefix || key.startsWith(`${prefix}:`);
}

function normalizePath(path: Path | string | number): Path {
  return Array.isArray(path) ? path.slice() : [path];
}

function pathKey(path: Path) {
  return JSON.stringify(path);
}

function isPathPrefix(parent: Path, child: Path) {
  return parent.length <= child.length && parent.every((part, index) => part === child[index]);
}

function markDirtyPath(record: DraftRecord, path: Path | string | number) {
  const normalized = normalizePath(path);
  const existing = [...record.dirtyPaths.values()];
  if (existing.some((candidate) => isPathPrefix(candidate, normalized))) return;
  for (const candidate of existing) {
    if (isPathPrefix(normalized, candidate)) record.dirtyPaths.delete(pathKey(candidate));
  }
  record.dirtyPaths.set(pathKey(normalized), normalized);
}

export class DirtyResources {
  #items = new Set<string>();
  mark(key: string) { this.#items.add(key); }
  clear(key: string) { this.#items.delete(key); }
  clearPrefix(prefix: string) {
    let cleared = 0;
    for (const key of [...this.#items]) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from: string, to: string) {
    const moved = [...this.#items].filter((key) => startsWithPrefix(key, from));
    for (const key of moved) { this.#items.delete(key); this.#items.add(`${to}${key.slice(from.length)}`); }
    return moved.length;
  }
  reset() { this.#items.clear(); }
  has(key: string) { return this.#items.has(key); }
  get count() { return this.#items.size; }
  get dirty() { return this.#items.size > 0; }
}

export class AdminDrafts {
  #items = new Map<string, DraftRecord>();
  #record(key: string) { return this.#items.get(key); }
  begin(key: string, value: unknown) {
    if (!this.#items.has(key)) this.#items.set(key, { value: clone(value), revision: 0, dirtyPaths: new Map() });
    return this.#record(key)?.value;
  }
  get(key: string) { return this.#record(key)?.value; }
  dirtyPaths(key: string) { return [...(this.#record(key)?.dirtyPaths.values() ?? [])].map((path) => path.slice()); }
  isPathDirty(key: string, path: Path | string | number) {
    const normalized = normalizePath(path);
    return this.dirtyPaths(key).some((candidate) => isPathPrefix(candidate, normalized) || isPathPrefix(normalized, candidate));
  }
  snapshot(key: string) {
    const record = this.#record(key);
    return { revision: record?.revision ?? -1 };
  }
  snapshotPrefix(prefix: string) {
    return [...this.#items.entries()]
      .filter(([key]) => startsWithPrefix(key, prefix))
      .map(([key, record]) => ({ key, revision: record.revision }));
  }
  set(key: string, path: Path | string | number, value: unknown) {
    const record = this.#record(key);
    if (!record) throw new Error(`Missing draft resource: ${key}`);
    const normalized = normalizePath(path);
    record.value = setAtPath(record.value, normalized, clone(value));
    markDirtyPath(record, normalized);
    record.revision += 1;
    return record.value;
  }
  replace(key: string, value: unknown) {
    const record = this.#record(key);
    if (record) {
      record.value = clone(value);
      markDirtyPath(record, []);
      record.revision += 1;
      return record.value;
    }
    this.#items.set(key, { value: clone(value), revision: 0, dirtyPaths: new Map([[pathKey([]), []]]) });
    return this.#record(key)?.value;
  }
  rebase(key: string, serverValue: unknown, { expectedRevision }: { expectedRevision?: number; paths?: Path[] } = {}) {
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
  clear(key: string, { expectedRevision }: { expectedRevision?: number } = {}) {
    const record = this.#record(key);
    if (!record || (expectedRevision !== undefined && record.revision !== expectedRevision)) return false;
    this.#items.delete(key);
    return true;
  }
  clearPrefix(prefix: string) {
    let cleared = 0;
    for (const key of [...this.#items.keys()]) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from: string, to: string) {
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
  #items = new Map<string, number>();
  #generation = 0;
  acquire(key: string) {
    if (this.#items.has(key)) return null;
    const token = ++this.#generation;
    this.#items.set(key, token);
    return token;
  }
  release(key: string, token: number | null) {
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
  clearPrefix(prefix: string) {
    let cleared = 0;
    for (const key of this.#items.keys()) {
      if (startsWithPrefix(key, prefix)) { this.#items.delete(key); cleared += 1; }
    }
    return cleared;
  }
  remapPrefix(from: string, to: string) {
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
  has(key: string) { return this.#items.has(key); }
  get busy() { return this.#items.size > 0; }
}

export class AuthEpoch {
  #value = 0;
  capture() { return this.#value; }
  invalidate() { this.#value += 1; return this.#value; }
  isCurrent(value: number) { return value === this.#value; }
}

export function updateDraft(drafts: AdminDrafts, dirty: DirtyResources, resource: string, path: Path, next: unknown) {
  const control = isRecord(next) && Object.prototype.hasOwnProperty.call(next, "value") ? next : null;
  drafts.set(resource, path, control ? control.value : next);
  dirty.mark(resource);
  return control ?? next;
}

export async function runBusyResource<T>(busy: BusyResources, resource: string, work: (token: number) => Promise<T>) {
  const token = busy.acquire(resource);
  if (token === null) return { started: false };
  try { return { started: true, value: await work(token) }; }
  finally { busy.release(resource, token); }
}

export function collectionSlugControl(item: Pick<Item, "slug" | "isNew"> | null | undefined) {
  return { value: String(item?.slug ?? ""), readOnly: !item?.isNew };
}

function fallbackMediaSlots(item: Pick<Item, 'coverMedia' | 'cardMedia' | 'detailMedia' | 'media'> | null | undefined) {
  const fallback: Media[] = [];
  const cover = item?.coverMedia ?? item?.cardMedia;
  if (cover) fallback.push(readMedia({ ...cover, role: "cover", position: 0, virtual: true }));
  const details = Array.isArray(item?.detailMedia) ? item.detailMedia : [];
  details.forEach((entry, position) => {
    if (entry) fallback.push(readMedia({ ...entry, role: "detail", position, virtual: true }));
  });
  return fallback;
}

function validMediaSlot(entry: unknown): entry is Media {
  return isMedia(entry) && ["cover", "detail"].includes(entry.role)
    && Number.isSafeInteger(entry.position) && entry.position >= 0
    && (entry.role !== "cover" || entry.position === 0)
    && (entry.state === undefined || entry.state === "active");
}

export function mergeMediaSlots(item: Pick<Item, 'coverMedia' | 'cardMedia' | 'detailMedia' | 'media'> | null | undefined) {
  const slots = new Map<string, Media>();
  for (const entry of fallbackMediaSlots(item)) slots.set(`${entry.role}:${entry.position}`, entry);
  const stored = Array.isArray(item?.media) ? item.media.filter(validMediaSlot) : [];
  for (const entry of stored) slots.set(`${entry.role}:${entry.position}`, { ...entry });
  return [...slots.values()].sort((left, right) => {
    const role = Number(left.role === "cover") - Number(right.role === "cover");
    return role ? -role : left.position - right.position || (left.id ?? 0) - (right.id ?? 0);
  });
}

export function mediaPreviewKind(media: Pick<Media, "type" | "src"> | null | undefined) {
  return media?.type === "video" || /\.(?:mp4|webm|ogv|ogg)(?:$|[?#])/i.test(media?.src ?? "") ? "video" : "image";
}

export function buildCollectionReorderRequest(kind: Kind, items: readonly Pick<Item, "slug" | "position">[]) {
  return { path: `/api/admin/${kind}/_order`, method: "PUT", body: { items: items.map(({ slug, position }) => ({ slug, position })) } };
}

export function buildMediaMetadataRequest(ownerType: Kind, id: number, { role, alt, position }: MediaDraft) {
  return { path: `/api/admin/media/${ownerType}/${id}`, method: "PUT", body: { role, alt, position } };
}

export function buildMediaOrderRequest(ownerType: Kind, ownerSlug: string, items: readonly { id: number; position: number }[]) {
  return {
    path: "/api/admin/media/_order",
    method: "PUT",
    body: { ownerType, ownerSlug, items: items.map(({ id, position }) => ({ id, position })) },
  };
}
