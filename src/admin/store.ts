import { AdminDrafts, AuthEpoch, DirtyResources, mergeMediaSlots, buildContentRequest, buildCollectionReorderRequest, buildMediaMetadataRequest, buildMediaOrderRequest } from '../scripts/admin-model.js';
import { THEME_KEY, validatePalette } from '../data/theme.js';

export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type Kind = 'events' | 'archive';
// Transitional boundary: the existing CMS accepts heterogeneous editorial records.
// Keep that shape here, rather than distributing unchecked casts through the UI.
export type Item = Record<string, any> & { slug: string; title: string; position: number; isNew?: boolean; draftId?: string };
export const sections = { home: 'Home', archive: 'Archivio', events: 'Eventi', project: 'Progetto', contact: 'Contatti', global: 'Globali', colors: 'Colori' };
export type Section = keyof typeof sections;
export const fields: Record<Kind, string[]> = {
  events: ['slug', 'status', 'title', 'code', 'summary', 'meta', 'description', 'info', 'outro', 'outroInfo', 'seo', 'position'],
  archive: ['slug', 'title', 'code', 'href', 'description', 'details', 'outro', 'seo', 'position'],
};
export function sectionFor(key: string): Section {
  if (key === THEME_KEY) return 'colors';
  for (const section of ['home', 'archive', 'events', 'project', 'contact'] as const)
    if (key.startsWith(`${section}.`) || key.startsWith(`seo.${section}.`)) return section;
  return 'global';
}
export const collectionKey = (kind: Kind, item: Item) => `collection:${kind}:${item.draftId ?? item.slug}`;
export const mediaPrefix = (kind: Kind, item: Item) => `media:${kind}:${item.draftId ?? item.slug}`;
export const mediaKey = (kind: Kind, item: Item, media: any) => `${mediaPrefix(kind, item)}:${Number.isSafeInteger(media.id) ? `stored:${media.id}` : `${media.virtual ? 'fallback' : 'new'}:${media.role}:${media.position}`}`;
const stale = () => Object.assign(new Error('Richiesta superata'), { stale: true });
const clone = <T>(value: T): T => structuredClone(value);

export function createAdminStore(fetchImpl: typeof fetch = globalThis.fetch) {
  const drafts = new AdminDrafts(), dirty = new DirtyResources(), auth = new AuthEpoch();
  const listeners = new Set<() => void>();
  let csrf = '', nextId = 0;
  const state = { authenticated: false, busy: false, dirty: 0, revision: 0, message: '', error: false, section: 'home' as Section, content: {} as Record<string, Value>, collections: { events: [], archive: [] } as Record<Kind, Item[]> };
  const emit = () => { state.dirty = dirty.count; state.revision++; listeners.forEach(fn => fn()); };
  const reset = () => { auth.invalidate(); csrf = ''; state.authenticated = false; state.content = {}; state.collections = { events: [], archive: [] }; drafts.reset(); dirty.reset(); emit(); };
  async function api(path: string, options: RequestInit = {}) {
    const epoch = auth.capture();
    const headers = new Headers(options.headers);
    if (options.method && options.method !== 'GET' && csrf) headers.set('x-csrf-token', csrf);
    let response: Response;
    try { response = await fetchImpl(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' }); }
    catch (error) { if (!auth.isCurrent(epoch)) throw stale(); throw error; }
    const payload = await response.json().catch(() => null);
    if (!auth.isCurrent(epoch)) throw stale();
    if (!response.ok) {
      if (response.status === 401) reset();
      throw new Error(payload?.error || 'Operazione non riuscita');
    }
    return payload;
  }
  const request = (entry: { path: string; method: string; body: unknown }) => api(entry.path, { method: entry.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry.body) });
  async function run(work: () => Promise<void>) {
    if (state.busy) return;
    state.busy = true; state.message = ''; state.error = false; emit();
    try { await work(); }
    catch (error) { if (!(error as { stale?: boolean })?.stale) { state.message = error instanceof Error ? error.message : 'Operazione non riuscita'; state.error = true; } }
    finally { state.busy = false; emit(); }
  }
  function clearCurrent(key: string, revision: number) {
    if (drafts.clear(key, { expectedRevision: revision })) dirty.clear(key);
  }
  async function load(session: { authenticated?: boolean; csrfToken?: string }) {
    if (!session.csrfToken) return;
    csrf = session.csrfToken;
    const [content, events, archive] = await Promise.all([api('/api/content'), api('/api/admin/events'), api('/api/admin/archive')]);
    state.content = content; state.collections = { events, archive }; state.authenticated = true; emit();
  }
  async function reloadCollections() {
    const [events, archive] = await Promise.all([api('/api/admin/events'), api('/api/admin/archive')]);
    for (const kind of ['events', 'archive'] as const) {
      const incoming: Item[] = kind === 'events' ? events : archive;
      for (const item of incoming) {
        const key = collectionKey(kind, item);
        if (drafts.get(key)) drafts.rebase(key, item);
        for (const media of mergeMediaSlots(item)) {
          const resource = mediaKey(kind, item, media);
          if (drafts.get(resource)) drafts.rebase(resource, { role: media.role, alt: media.alt || '', position: media.position });
        }
      }
      state.collections[kind] = [...incoming, ...state.collections[kind].filter(item => item.isNew && !incoming.some(server => server.slug === item.slug))];
    }
    emit();
  }
  const store = {
    state,
    subscribe(fn: () => void) { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; },
    draft<T>(key: string, initial: T): T { return drafts.begin(key, initial); },
    edit(key: string, path: (string | number)[], value: unknown) { drafts.set(key, path, value); dirty.mark(key); emit(); },
    cancel(key: string) { drafts.clear(key); dirty.clear(key); emit(); },
    select(section: Section) { state.section = section; emit(); },
    async boot() { try { await load(await api('/api/admin/session')); } catch (error) { if (!(error as { stale?: boolean })?.stale) emit(); } },
    async login(username: string, password: string) {
      auth.invalidate();
      await run(async () => { const session = await request({ path: '/api/admin/login', method: 'POST', body: { username, password } }); await load(session); });
    },
    async logout() { auth.invalidate(); await run(async () => { await api('/api/admin/logout', { method: 'POST' }); reset(); }); },
    async saveContent(key: string, restore = false) {
      const resource = `content:${key}`, value = clone(drafts.get(resource)), revision = drafts.snapshot(resource).revision;
      await run(async () => {
        if (!restore && key === THEME_KEY && !validatePalette(value)) throw new Error('Palette non valida: usa tutti i colori #RRGGBB.');
        if (restore) { await api(`/api/admin/content/${encodeURIComponent(key)}`, { method: 'DELETE' }); state.content = await api('/api/content'); }
        else { await request(buildContentRequest(key, value)); state.content[key] = value; }
        clearCurrent(resource, revision); state.message = restore ? 'Placeholder ripristinato.' : 'Salvato.';
      });
    },
    add(kind: Kind) {
      const common = { slug: `nuovo-${kind}-${++nextId}`, title: 'Nuovo elemento', code: 'TR-00', position: state.collections[kind].length, seo: { title: 'Nuovo elemento', description: '' }, isNew: true, draftId: `new-${nextId}`, media: [], description: '', outro: '' };
      const item = kind === 'events' ? { ...common, status: 'upcoming', summary: '', meta: [''], info: [[['Etichetta', 'Valore']]], outroInfo: [[['Etichetta', 'Valore']]] } : { ...common, href: '/project', details: [['Etichetta', 'Valore']] };
      state.collections[kind] = [...state.collections[kind], item]; drafts.begin(collectionKey(kind, item), item); dirty.mark(collectionKey(kind, item)); emit();
    },
    async saveCollection(kind: Kind, item: Item) {
      const key = collectionKey(kind, item), value = clone(drafts.get(key)) as Item, revision = drafts.snapshot(key).revision;
      await run(async () => {
        const saved = await request({ path: `/api/admin/${kind}${item.isNew ? '' : `/${encodeURIComponent(item.slug)}`}`, method: item.isNew ? 'POST' : 'PUT', body: Object.fromEntries(fields[kind].map(field => [field, value[field]])) });
        clearCurrent(key, revision);
        if (item.isNew) {
          const canonical = { ...value, ...saved, slug: saved.slug || value.slug, isNew: false, draftId: undefined };
          drafts.remapPrefix(key, collectionKey(kind, canonical)); dirty.remapPrefix(key, collectionKey(kind, canonical));
          drafts.remapPrefix(mediaPrefix(kind, item), mediaPrefix(kind, canonical)); dirty.remapPrefix(mediaPrefix(kind, item), mediaPrefix(kind, canonical));
          state.collections[kind] = state.collections[kind].filter(entry => entry.draftId !== item.draftId);
        }
        await reloadCollections(); state.message = 'Elemento salvato.';
      });
    },
    async removeCollection(kind: Kind, item: Item) {
      await run(async () => {
        if (!item.isNew) await api(`/api/admin/${kind}/${encodeURIComponent(item.slug)}`, { method: 'DELETE' });
        for (const prefix of [collectionKey(kind, item), mediaPrefix(kind, item)]) { drafts.clearPrefix(prefix); dirty.clearPrefix(prefix); }
        state.collections[kind] = state.collections[kind].filter(entry => collectionKey(kind, entry) !== collectionKey(kind, item));
        if (!item.isNew) await reloadCollections();
      });
    },
    async reorderCollection(kind: Kind, index: number, direction: number) {
      await run(async () => {
        const items = state.collections[kind].slice(), target = index + direction;
        if (target < 0 || target >= items.length) return;
        if (items.some(item => item.isNew)) throw new Error('Salva i nuovi elementi prima di riordinare.');
        [items[index], items[target]] = [items[target], items[index]];
        await request(buildCollectionReorderRequest(kind, items.map((item, position) => ({ ...item, position })))); await reloadCollections();
      });
    },
    async upload(kind: Kind, item: Item, media: any, file: File) {
      const key = mediaKey(kind, item, media), value = clone(drafts.get(key)), revision = drafts.snapshot(key).revision;
      await run(async () => {
        if (item.isNew) throw new Error('Salva l’elemento prima di caricare le immagini.');
        // The optimizer is requested only when a file is actually uploaded.
        const { optimizeImage, variantFieldsFor } = await import('../scripts/admin-image-optimizer.js');
        const variants = await optimizeImage(file), body = new FormData();
        body.set('ownerType', kind); body.set('ownerSlug', item.slug); body.set('role', value.role); body.set('alt', value.alt); body.set('position', String(value.role === 'cover' ? 0 : value.position));
        const names = variantFieldsFor(variants.map(variant => variant.width));
        variants.forEach((variant, index) => body.set(names[index], variant.blob as Blob, `${variant.width}.webp`));
        const saved = await api('/api/admin/media', { method: 'POST', body });
        clearCurrent(key, revision);
        if (Number.isSafeInteger(saved?.id)) { const canonical = mediaKey(kind, item, saved); drafts.remapPrefix(key, canonical); dirty.remapPrefix(key, canonical); }
        await reloadCollections(); state.message = 'Immagine ottimizzata e caricata.';
      });
    },
    async saveMedia(kind: Kind, item: Item, media: any, remove = false) {
      const key = mediaKey(kind, item, media), value = clone(drafts.get(key)), revision = drafts.snapshot(key).revision;
      await run(async () => {
        if (!Number.isSafeInteger(media.id)) throw new Error('Carica prima un’immagine.');
        if (remove) await api(`/api/admin/media/${kind}/${media.id}`, { method: 'DELETE' });
        else await request(buildMediaMetadataRequest(kind, media.id, { ...value, position: value.role === 'cover' ? 0 : value.position }));
        clearCurrent(key, revision); await reloadCollections(); state.message = 'Immagine aggiornata.';
      });
    },
    async reorderMedia(kind: Kind, item: Item, media: any, direction: number) {
      await run(async () => {
        const all = (item.media || []).filter((entry: any) => Number.isSafeInteger(entry.id) && (entry.state === undefined || entry.state === 'active'));
        const details = all.filter((entry: any) => entry.role === 'detail').sort((a: any, b: any) => a.position - b.position);
        const index = details.findIndex((entry: any) => entry.id === media.id), target = index + direction;
        if (index < 0 || target < 0 || target >= details.length) return;
        const left = details[index], right = details[target];
        const ordered = all.map((entry: any) => ({ ...entry, position: entry.id === left.id ? right.position : entry.id === right.id ? left.position : entry.position }));
        await request(buildMediaOrderRequest(kind, item.slug, ordered)); await reloadCollections();
      });
    },
  };
  return store;
}
export type AdminStore = ReturnType<typeof createAdminStore>;
