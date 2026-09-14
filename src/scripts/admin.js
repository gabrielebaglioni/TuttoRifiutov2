import { optimizeImage, variantFieldsFor } from "./admin-image-optimizer.js";
import { contentLabel, fieldLabel } from "./admin-labels.js";
import { SITE_CONTENT } from "../data/site-content.js";
import {
  AdminDrafts,
  AuthEpoch,
  BusyResources,
  DirtyResources,
  buildCollectionReorderRequest,
  buildContentRequest,
  buildMediaMetadataRequest,
  buildMediaOrderRequest,
  collectionSlugControl,
  mediaPreviewKind,
  mergeMediaSlots,
  runBusyResource,
} from "./admin-model.js";

const CONTENT_SECTIONS = {
  home: { title: "Home", keys: ["home.", "seo.home."] },
  archive: { title: "Archivio", keys: ["archive.", "seo.archive."] },
  events: { title: "Eventi", keys: ["events.", "seo.events."] },
  project: { title: "Progetto", keys: ["project.", "seo.project."] },
  contact: { title: "Contatti", keys: ["contact.", "seo.contact."] },
  global: { title: "Globali", keys: ["global.", "site.", "seo.default.", "seo.social."] },
};

const COLLECTION_FIELDS = {
  events: ["slug", "status", "title", "code", "summary", "meta", "description", "info", "outro", "outroInfo", "seo", "position"],
  archive: ["slug", "title", "code", "href", "description", "details", "outro", "seo", "position"],
};

export function adminSectionForContentKey(key) {
  return Object.entries(CONTENT_SECTIONS).find(([, section]) => section.keys.some((prefix) => key.startsWith(prefix)))?.[0] ?? null;
}

export function createAdminController({
  document: documentRef = globalThis.document,
  window: windowRef = globalThis.window,
  fetch: fetchImpl = globalThis.fetch,
  optimizeImage: optimizeImageImpl = optimizeImage,
  FormData: FormDataImpl = globalThis.FormData,
} = {}) {
  if (!documentRef || typeof fetchImpl !== "function") throw new TypeError("Admin controller requires document and fetch");
  const document = documentRef;
  const window = windowRef ?? globalThis;
  const fetch = fetchImpl;
  const FormData = FormDataImpl;
  const loginPanel = document.querySelector("#admin-login");
  const loginForm = document.querySelector("#admin-login-form");
  const loginStatus = document.querySelector("#admin-login-status");
  const editor = document.querySelector("#admin-editor");
  const status = document.querySelector("#admin-status");
  const panels = document.querySelector("#admin-panels");
  const editorTitle = document.querySelector("#admin-title");
  const logoutButton = document.querySelector("#admin-logout");
  const dirtyIndicator = document.querySelector("#admin-dirty");
  const tabs = [...document.querySelectorAll("[data-admin-section]")];

  const state = {
  csrfToken: "",
  content: {},
  collections: { events: [], archive: [] },
  section: "home",
  dirty: new DirtyResources(),
  drafts: new AdminDrafts(),
  busy: new BusyResources(),
  auth: new AuthEpoch(),
  nextDraftId: 0,
  };

function node(tag, { text, className, attrs = {}, type } = {}) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  if (type) element.type = type;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) element.setAttribute(name, "");
    else if (value !== false && value !== undefined && value !== null && value !== "") element.setAttribute(name, String(value));
  }
  return element;
}

function button(label, action, className = "") {
  const control = node("button", { text: label, type: "button", className });
  control.addEventListener("click", action);
  return control;
}

const disclosures = new Map();
function disclosure(key, title, { card = false, open = false } = {}) {
  const wrap = node("details", { className: card ? "admin-card admin-disclosure" : "admin-disclosure", attrs: { open: disclosures.get(key) ?? open, "aria-busy": String(state.busy.busy) } });
  const summary = node("summary");
  summary.append(node(card ? "h3" : "span", { text: title }));
  wrap.append(summary);
  wrap.addEventListener("toggle", () => { disclosures.set(key, wrap.hasAttribute("open")); });
  return wrap;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function setStatus(message = "", kind = "") {
  status.textContent = message;
  if (kind) status.dataset.kind = kind;
  else delete status.dataset.kind;
}

function setLoginStatus(message = "", kind = "") {
  loginStatus.textContent = message;
  if (kind) loginStatus.dataset.kind = kind;
  else delete loginStatus.dataset.kind;
}

function refreshDirtyIndicator() {
  dirtyIndicator.textContent = state.dirty.count ? `${state.dirty.count} modifiche non salvate` : "Nessuna modifica non salvata";
}

function markDirty(resource) {
  state.dirty.mark(resource);
  refreshDirtyIndicator();
}

function clearDirty(resource) {
  state.dirty.clear(resource);
  refreshDirtyIndicator();
}

function clearDraftIfCurrent(resource, operation) {
  if (!state.drafts.clear(resource, { expectedRevision: operation.revision })) return false;
  clearDirty(resource);
  return true;
}

function staleRequest() {
  const error = new Error("Richiesta superata da un cambio sessione");
  error.stale = true;
  return error;
}

function isStale(error) {
  return Boolean(error?.stale);
}

function resetEditor(message, kind = "error") {
  state.auth.invalidate();
  state.csrfToken = "";
  state.content = {};
  state.collections = { events: [], archive: [] };
  state.section = "home";
  state.dirty.reset();
  state.drafts.reset();
  state.busy.reset();
  panels.replaceChildren();
  dirtyIndicator.textContent = "";
  editor.hidden = true;
  editor.inert = true;
  loginPanel.hidden = false;
  loginForm.reset?.();
  if (message) setLoginStatus(message, kind);
  loginForm.querySelector("input")?.focus();
}

function setScopeBusy(scope, busy) {
  if (!scope) return;
  scope.setAttribute("aria-busy", String(busy));
  for (const control of scope.querySelectorAll("button, input, select, textarea")) {
    if (busy) {
      if (!control.disabled) control.setAttribute("data-admin-busy-disabled", "true");
      control.disabled = true;
    } else if (control.hasAttribute("data-admin-busy-disabled")) {
      control.disabled = false;
      control.removeAttribute("data-admin-busy-disabled");
    }
  }
}

function refreshBusyState() {
  const editorBusy = state.busy.busy;
  setScopeBusy(editor, editorBusy);
  setScopeBusy(loginForm, state.busy.has("login"));
}

async function withBusy(resource, scope, work) {
  try {
    return await runBusyResource(state.busy, resource, async (token) => {
      refreshBusyState();
      setScopeBusy(scope, true);
      return work(token);
    });
  } finally { refreshBusyState(); }
}

function reportError(error, setter = setStatus) {
  if (!isStale(error)) setter(error?.message || "Operazione non riuscita", "error");
}

async function api(path, { method = "GET", body, headers = {}, resetOnUnauthorized = true } = {}) {
  const epoch = state.auth.capture();
  const requestHeaders = new Headers(headers);
  if (method !== "GET" && state.csrfToken) requestHeaders.set("x-csrf-token", state.csrfToken);
  let response;
  try {
    response = await fetch(path, { method, body, headers: requestHeaders, credentials: "same-origin" });
  } catch (error) {
    if (!state.auth.isCurrent(epoch)) throw staleRequest();
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch { /* Private API responses are JSON, but a proxy can still return text. */ }
  if (!state.auth.isCurrent(epoch)) throw staleRequest();
  if (!response.ok) {
    const error = new Error(payload?.error || "Operazione non riuscita");
    error.status = response.status;
    if (response.status === 401 && resetOnUnauthorized) resetEditor("Sessione scaduta. Accedi di nuovo.");
    throw error;
  }
  return payload;
}

function isContentKeyInSection(key, section) {
  return adminSectionForContentKey(key) === section;
}

function inputForString(value, onChange, label, { readOnly = false, name } = {}) {
  const field = node("label", { className: "admin-field" });
  field.append(node("span", { text: label }));
  const multiline = value.length > 130 || value.includes("\n");
  const control = node(multiline ? "textarea" : "input");
  if (!multiline) control.type = "text";
  if (name) control.name = name;
  control.value = value;
  control.readOnly = readOnly;
  if (readOnly) control.setAttribute("aria-readonly", "true");
  control.addEventListener("input", () => onChange(control.value));
  field.append(control);
  return field;
}

function emptyArrayItem(path, sample) {
  if (sample !== undefined) return clone(sample);
  if (/(details|items|rows)$/.test(path)) return ["", ""];
  if (/(info|outroInfo)$/.test(path)) return [["", ""]];
  return "";
}

function valueEditor(value, onChange, path, refresh, live = () => value, relativePath = []) {
  if (typeof value === "string") return inputForString(value, (next) => onChange(next, relativePath), fieldLabel(path));
  if (typeof value === "number") {
    const field = node("label", { className: "admin-field" });
    field.append(node("span", { text: fieldLabel(path) }));
    const control = node("input", { type: "number" });
    control.value = String(value);
    control.addEventListener("input", () => onChange(Number(control.value), relativePath));
    field.append(control);
    return field;
  }
  if (Array.isArray(value)) {
    const list = node("ol", { className: "admin-list" });
    value.forEach((entry, index) => {
      const item = node("li", { className: "admin-array-row" });
      item.append(valueEditor(entry, onChange, `${path}.${index + 1}`, refresh, () => live()[index], [...relativePath, index]));
      const tools = node("div", { className: "admin-array-tools" });
      if (index > 0) tools.append(button("Reorder ↑", () => {
        const copy = live().slice(); [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; onChange(copy, relativePath); refresh();
      }, "admin-quiet"));
      if (index < value.length - 1) tools.append(button("Reorder ↓", () => {
        const copy = live().slice(); [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]]; onChange(copy, relativePath); refresh();
      }, "admin-quiet"));
      tools.append(button("Remove", () => { const copy = live().slice(); copy.splice(index, 1); onChange(copy, relativePath); refresh(); }, "admin-quiet"));
      item.append(tools);
      list.append(item);
    });
    const wrap = node("div");
    wrap.append(list, button("Add row", () => {
      const source = live(); onChange([...source, emptyArrayItem(path, source[0])], relativePath); refresh();
    }, "admin-quiet"));
    return wrap;
  }
  if (value && typeof value === "object") {
    const wrap = node("div", { className: "admin-list" });
    for (const [key, child] of Object.entries(value)) {
      wrap.append(valueEditor(child, onChange, `${path}.${key}`, refresh, () => live()[key], [...relativePath, key]));
    }
    return wrap;
  }
  return node("p", { text: "Valore non supportato" });
}

function contentCard(key, original) {
  const card = disclosure("content:" + key, contentLabel(key), { card: true });
  let baseline = clone(original);
  const resource = `content:${key}`;
  let draft = state.drafts.begin(resource, original);
  const valueSlot = node("div");
  const renderValue = () => {
    valueSlot.replaceChildren(valueEditor(draft, (next, path) => {
      draft = state.drafts.set(resource, path, next);
      markDirty(resource);
    }, key, renderValue, () => draft));
  };
  renderValue();
  const save = async () => {
    const operation = state.drafts.snapshot(resource);
    const savedValue = clone(draft);
    try {
      await withBusy(resource, card, async () => {
        const request = buildContentRequest(key, savedValue);
        await api(request.path, { method: request.method, body: JSON.stringify(request.body), headers: { "content-type": "application/json" } });
        if (!clearDraftIfCurrent(resource, operation)) return;
        baseline = clone(savedValue);
        state.content[key] = clone(savedValue);
        draft = state.drafts.begin(resource, savedValue);
        setStatus("Salvato.");
      });
    } catch (error) { reportError(error); }
  };
  card.append(node("p", { text: key, className: "admin-key" }), valueSlot);
  const actions = node("div", { className: "admin-actions" });
  actions.append(button("Save", save), button("Cancel", () => {
    draft = clone(baseline);
    state.drafts.clear(resource);
    draft = state.drafts.begin(resource, baseline);
    renderValue();
    clearDirty(resource);
    setStatus("Modifiche annullate.");
  }, "admin-quiet"));
  actions.append(button("Restore placeholder", async () => {
    const operation = state.drafts.snapshot(resource);
    try {
      await withBusy(resource, card, async () => {
        await api(`/api/admin/content/${encodeURIComponent(key)}`, { method: "DELETE" });
        const content = await api("/api/content");
        if (!clearDraftIfCurrent(resource, operation)) return;
        baseline = clone(content[key]);
        draft = state.drafts.begin(resource, content[key]);
        state.content[key] = clone(content[key]);
        renderValue();
        setStatus("Placeholder ripristinato.");
      });
    } catch (error) { reportError(error); }
  }, "admin-quiet"));
  card.append(actions);
  return card;
}

function blankCollection(kind, index) {
  const slug = `${kind === "events" ? "nuovo-evento" : "nuovo-pacchetto"}-${index + 1}`;
  const common = {
    slug,
    title: "Nuovo elemento",
    code: "TR-00",
    position: index,
    seo: { title: "Nuovo elemento", description: "" },
    isNew: true,
    draftId: `new-${++state.nextDraftId}`,
    media: [],
  };
  return kind === "events"
    ? { ...common, status: "upcoming", summary: "", meta: [""], description: "", info: [[ ["Etichetta", "Valore"] ]], outro: "", outroInfo: [[ ["Etichetta", "Valore"] ]] }
    : { ...common, href: "/project", description: "", details: [["Etichetta", "Valore"]], outro: "" };
}

function collectionResource(kind, item) {
  return `collection:${kind}:${item.draftId ?? item.slug}`;
}

function collectionOrderResource(kind) {
  return `collection-order:${kind}`;
}

function collectionDraftsAreCurrent(kind, snapshots) {
  const current = new Map(state.drafts.snapshotPrefix(`collection:${kind}`).map(({ key, revision }) => [key, revision]));
  return current.size === snapshots.length && snapshots.every(({ key, revision }) => current.get(key) === revision);
}

function serverMediaDraft(media) {
  return {
    role: media.role,
    alt: media.alt || "",
    position: media.role === "cover" ? 0 : safePosition(media.position),
  };
}

function reconcileMediaDrafts(kind, item, previous) {
  const nextResources = new Set();
  for (const media of mergeMediaSlots(item)) {
    const resource = mediaResource(kind, item, media);
    nextResources.add(resource);
    const draft = state.drafts.get(resource);
    if (!draft) continue;
    const server = serverMediaDraft(media);
    if (["role", "alt", "position"].some((field) => draft[field] !== server[field])) state.drafts.rebase(resource, server);
  }
  let cleared = false;
  for (const media of previous ? mergeMediaSlots(previous) : []) {
    const resource = mediaResource(kind, item, media);
    if (!nextResources.has(resource) && !state.drafts.dirtyPaths(resource).length && state.drafts.clear(resource)) {
      state.dirty.clear(resource);
      cleared = true;
    }
  }
  if (cleared) refreshDirtyIndicator();
}

function reconcileCollectionDraft(kind, item) {
  const previous = state.collections[kind].find((entry) => entry.slug === item.slug);
  const identity = previous?.draftId ? { ...item, draftId: previous.draftId } : item;
  const resource = collectionResource(kind, identity);
  reconcileMediaDrafts(kind, identity, previous);
  if (!state.drafts.get(resource)) return identity;
  const refreshed = state.drafts.rebase(resource, item).value;
  return { ...item, ...refreshed, ...(previous?.draftId ? { draftId: previous.draftId } : {}) };
}

function collectionPayload(kind, item) {
  return Object.fromEntries(COLLECTION_FIELDS[kind].map((field) => [field, clone(item[field])]));
}

function pendingNewItems(kind) {
  return state.collections[kind].filter((item) => item.isNew);
}

async function fetchCollections() {
  const [events, archive] = await Promise.all([api("/api/admin/events"), api("/api/admin/archive")]);
  return { events, archive };
}

async function reloadCollections(epoch = state.auth.capture()) {
  const next = await fetchCollections();
  if (!state.auth.isCurrent(epoch)) throw staleRequest();
  state.collections = {
    events: [...next.events.map((item) => reconcileCollectionDraft("events", item)), ...pendingNewItems("events").filter((item) => !next.events.some((server) => server.slug === item.slug))],
    archive: [...next.archive.map((item) => reconcileCollectionDraft("archive", item)), ...pendingNewItems("archive").filter((item) => !next.archive.some((server) => server.slug === item.slug))],
  };
  return state.collections;
}

async function saveCollection(kind, item) {
  const payload = collectionPayload(kind, item);
  const path = item.isNew ? `/api/admin/${kind}` : `/api/admin/${kind}/${encodeURIComponent(item.slug)}`;
  return api(path, { method: item.isNew ? "POST" : "PUT", body: JSON.stringify(payload), headers: { "content-type": "application/json" } });
}

async function reorderCollection(kind, from, to, scope) {
  const items = state.collections[kind];
  if (to < 0 || to >= items.length) return;
  if (items.some((item) => item.isNew)) return setStatus("Salva i nuovi elementi prima di riordinare.", "error");
  const ordered = items.map((item) => ({ ...item }));
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  ordered.forEach((item, position) => { item.position = position; });
  try {
    const resource = collectionOrderResource(kind);
    state.drafts.begin(resource, { items: ordered.map(({ slug, position }) => ({ slug, position })) });
    const operation = state.drafts.snapshot(resource);
    const collectionSnapshots = state.drafts.snapshotPrefix(`collection:${kind}`);
    await withBusy(resource, scope, async () => {
      const request = buildCollectionReorderRequest(kind, ordered);
      const result = await api(request.path, { method: request.method, body: JSON.stringify(request.body), headers: { "content-type": "application/json" } });
      if (state.drafts.snapshot(resource).revision !== operation.revision || !collectionDraftsAreCurrent(kind, collectionSnapshots)) return;
      state.collections[kind] = (Array.isArray(result) ? result : ordered).map((item) => reconcileCollectionDraft(kind, item));
      if (!clearDraftIfCurrent(resource, operation)) return;
      setStatus("Ordine salvato.");
      renderApp();
    });
  } catch (error) { reportError(error); }
}

function mediaResource(kind, item, media) {
  const owner = item.draftId ?? item.slug;
  const identity = Number.isSafeInteger(media.id)
    ? `stored:${media.id}`
    : `${media.virtual ? "fallback" : "new"}:${media.role}:${media.position}`;
  return `media:${kind}:${owner}:${identity}`;
}

function mediaResourcePrefix(kind, item) {
  return `media:${kind}:${item.draftId ?? item.slug}`;
}

function parentResourceSnapshots(kind, item) {
  const parent = collectionResource(kind, item);
  const media = mediaResourcePrefix(kind, item);
  return [
    ...state.drafts.snapshotPrefix(parent),
    ...state.drafts.snapshotPrefix(media),
  ];
}

function clearParentResources(kind, item, snapshots) {
  const parent = collectionResource(kind, item);
  const media = mediaResourcePrefix(kind, item);
  if (snapshots) {
    for (const { key, revision } of snapshots) clearDraftIfCurrent(key, { revision });
    return;
  }
  state.drafts.clearPrefix(parent);
  state.dirty.clearPrefix(parent);
  state.drafts.clearPrefix(media);
  state.dirty.clearPrefix(media);
  state.busy.clearPrefix(media);
  refreshDirtyIndicator();
}

function transitionNewParentResources(kind, item, saved, operation) {
  const oldParent = collectionResource(kind, item);
  if (state.drafts.snapshot(oldParent).revision < 0) return null;
  const savedIdentity = { ...saved, isNew: false };
  delete savedIdentity.draftId;
  const nextParent = collectionResource(kind, savedIdentity);
  const oldMedia = mediaResourcePrefix(kind, item);
  const nextMedia = mediaResourcePrefix(kind, savedIdentity);
  state.drafts.remapPrefix(oldParent, nextParent);
  state.dirty.remapPrefix(oldParent, nextParent);
  // A late parent edit moves with the new stable slug; only the exact draft
  // revision sent to the server may be cleared as authoritative.
  clearDraftIfCurrent(nextParent, operation);
  state.drafts.remapPrefix(oldMedia, nextMedia);
  state.dirty.remapPrefix(oldMedia, nextMedia);
  state.busy.remapPrefix(oldMedia, nextMedia);
  refreshDirtyIndicator();
  return savedIdentity;
}

function safePosition(value) {
  const position = Number(value);
  return Number.isSafeInteger(position) && position >= 0 ? position : 0;
}

async function uploadMedia(kind, item, media, file, scope, resource) {
  if (item.isNew) return setStatus("Salva prima il nuovo elemento.", "error");
  const operation = state.drafts.snapshot(resource);
  try {
    await withBusy(resource, scope, async () => {
      setStatus("Ottimizzazione in corso…");
      const variants = await optimizeImageImpl(file);
      const data = new FormData();
      data.set("ownerType", kind);
      data.set("ownerSlug", item.slug);
      data.set("role", media.role);
      data.set("position", String(media.role === "cover" ? 0 : safePosition(media.position)));
      data.set("alt", media.alt || "");
      const fields = variantFieldsFor(variants.map((variant) => variant.width));
      variants.forEach((variant, index) => data.append(fields[index], variant.blob, `${variant.width}.webp`));
      const stored = await api("/api/admin/media", { method: "POST", body: data });
      const nextResource = Number.isSafeInteger(stored?.id) ? mediaResource(kind, item, stored) : resource;
      if (state.drafts.snapshot(resource).revision === operation.revision) {
        clearDraftIfCurrent(resource, operation);
      } else if (state.drafts.snapshot(resource).revision >= 0 && nextResource !== resource) {
        state.drafts.remapPrefix(resource, nextResource);
        state.dirty.remapPrefix(resource, nextResource);
        state.busy.remapPrefix(resource, nextResource);
        refreshDirtyIndicator();
      }
      await reloadCollections();
      setStatus("Immagine caricata.");
      renderApp();
    });
  } catch (error) { reportError(error); }
}

function mediaEditor(kind, item, media, card) {
  const wrap = node("section", { className: "admin-media", attrs: { "aria-busy": String(state.busy.busy) } });
  const resource = mediaResource(kind, item, media);
  let draft = state.drafts.begin(resource, {
    role: media.role,
    alt: media.alt || "",
    position: media.role === "cover" ? 0 : safePosition(media.position),
  });
  const current = () => ({ ...media, ...draft, position: draft.role === "cover" ? 0 : safePosition(draft.position) });
  const preview = node(mediaPreviewKind(media) === "video" ? "video" : "img", {
    attrs: mediaPreviewKind(media) === "video"
      ? { controls: true, poster: media.poster || "", "aria-label": media.alt || "Anteprima video" }
      : { alt: media.alt || "Anteprima media" },
  });
  if (media.src) preview.src = media.src;
  const controls = node("div", { className: "admin-media-controls" });
  const role = node("select");
  ["cover", "detail"].forEach((value) => {
    const option = node("option", { text: value === "cover" ? "Copertina" : "Immagine di dettaglio" });
    option.value = value;
    option.selected = draft.role === value;
    role.append(option);
  });
  const roleLabel = node("label", { text: "Ruolo" }); roleLabel.append(role);
  const alt = node("input", { type: "text" }); alt.value = draft.alt;
  const altLabel = node("label", { text: "Testo alternativo" }); altLabel.append(alt);
  const position = node("input", { type: "number" });
  position.min = "0";
  position.value = String(draft.position);
  position.readOnly = draft.role === "cover";
  const positionLabel = node("label", { text: "Posizione" }); positionLabel.append(position);
  const file = node("input", { type: "file", attrs: { accept: "image/jpeg,image/png,image/webp,image/avif" } });
  const fileLabel = node("label", { text: "Sostituisci immagine (ottimizzazione automatica)" }); fileLabel.append(file);
  controls.append(roleLabel, altLabel, positionLabel, fileLabel);

  const change = (next) => {
    const nextDraft = { ...draft, ...next };
    if (nextDraft.role === "cover") {
      nextDraft.position = 0;
      position.value = "0";
      position.readOnly = true;
    } else position.readOnly = false;
    for (const [field, value] of Object.entries(nextDraft)) {
      if (draft[field] !== value) draft = state.drafts.set(resource, [field], value);
    }
    markDirty(resource);
  };
  role.addEventListener("change", () => change({ role: role.value }));
  alt.addEventListener("input", () => change({ alt: alt.value }));
  position.addEventListener("input", () => change({ position: safePosition(position.value) }));
  file.addEventListener("change", () => {
    if (file.files?.[0]) uploadMedia(kind, item, current(), file.files[0], card, resource);
  });

  const actions = node("div", { className: "admin-row-actions" });
  actions.append(button("Remove image", async () => {
    if (!Number.isSafeInteger(media.id)) return setStatus("Immagine placeholder: sostituiscila per creare una copia modificabile.", "error");
    const operation = state.drafts.snapshot(resource);
    try {
      await withBusy(resource, card, async () => {
        await api(`/api/admin/media/${kind}/${media.id}`, { method: "DELETE" });
        clearDraftIfCurrent(resource, operation);
        await reloadCollections();
        setStatus("Immagine rimossa: il fallback è di nuovo visibile.");
        renderApp();
      });
    } catch (error) { reportError(error); }
  }, "admin-quiet"));
  actions.append(button("Save media", async () => {
    if (!Number.isSafeInteger(media.id)) return setStatus("Immagine placeholder: sostituiscila per modificare i metadati.", "error");
    const operation = state.drafts.snapshot(resource);
    const savedMedia = current();
    try {
      await withBusy(resource, card, async () => {
        const request = buildMediaMetadataRequest(kind, media.id, savedMedia);
        await api(request.path, { method: request.method, body: JSON.stringify(request.body), headers: { "content-type": "application/json" } });
        clearDraftIfCurrent(resource, operation);
        await reloadCollections();
        setStatus("Metadati immagine salvati.");
        renderApp();
      });
    } catch (error) { reportError(error); }
  }, "admin-quiet"));
  if (Number.isSafeInteger(media.id) && media.role === "detail") {
    actions.append(button("Reorder ↑", () => reorderMedia(kind, item, media.id, -1, card), "admin-quiet"));
    actions.append(button("Reorder ↓", () => reorderMedia(kind, item, media.id, 1, card), "admin-quiet"));
  }
  wrap.append(
    node("h4", { text: media.role === "cover" ? "Immagine di copertina" : "Immagine di dettaglio " + (safePosition(media.position) + 1) }),
    node("p", { text: media.role === "cover" ? "Compare nell’elenco e nell’apertura della pagina. Sostituisci il placeholder con la copertina definitiva." : "Foto della galleria nella pagina di dettaglio. La posizione stabilisce l’ordine delle immagini." }),
    preview, controls, actions,
  );
  return wrap;
}

async function reorderMedia(kind, item, mediaId, direction, scope) {
  const parentResource = collectionResource(kind, item);
  const resource = `media-order:${parentResource}`;
  const draft = state.drafts.get(parentResource) ?? item;
  const details = (Array.isArray(draft.media) ? draft.media : [])
    .filter((media) => Number.isSafeInteger(media.id) && media.role === "detail")
    .sort((left, right) => left.position - right.position || left.id - right.id);
  const from = details.findIndex((media) => media.id === mediaId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= details.length) return;
  const reordered = details.slice();
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  const positions = new Map(reordered.map((media, position) => [media.id, position]));
  const items = draft.media
    .filter((media) => Number.isSafeInteger(media.id))
    .map((media) => ({ id: media.id, position: positions.get(media.id) ?? media.position }));
  if (items.length !== draft.media.length) return setStatus("Salva o sostituisci tutti i media prima di riordinarli.", "error");
  state.drafts.begin(resource, { items });
  const operation = state.drafts.snapshot(resource);
  try {
    await withBusy(resource, scope, async () => {
      const request = buildMediaOrderRequest(kind, item.slug, items);
      await api(request.path, { method: request.method, body: JSON.stringify(request.body), headers: { "content-type": "application/json" } });
      if (!clearDraftIfCurrent(resource, operation)) return;
      await reloadCollections();
      setStatus("Ordine media salvato.");
      renderApp();
    });
  } catch (error) { reportError(error); }
}

function collectionFieldEditor(field, draft, onChange, rerender, live = () => draft) {
  if (field === "slug") {
    const control = collectionSlugControl(draft);
    return inputForString(control.value, (next) => onChange(next, [field]), "Indirizzo della pagina (slug)", { readOnly: control.readOnly, name: "slug" });
  }
  return valueEditor(draft[field], (next, relativePath) => onChange(next, [field, ...relativePath]), field, rerender, () => live()[field]);
}

function collectionCard(kind, item, index, collectionScope) {
  const resource = collectionResource(kind, item);
  let draft = state.drafts.begin(resource, item);
  const card = disclosure(resource, draft.title || draft.slug, { card: true, open: Boolean(item.isNew) });
  const fields = node("div", { className: "admin-list" });
  const update = (next, path) => {
    draft = state.drafts.set(resource, path, next);
    markDirty(resource);
  };
  const rerender = () => {
    const media = mergeMediaSlots(draft);
    const stages = [
      ["cover", "01 · Copertina dell’elenco e immagine hero", []],
      ["intro", "02 · Apertura: titolo e presentazione", ["title", "summary", "code", "meta"]],
      ["description", "03 · Descrizione principale e informazioni", ["description", "info", "details"]],
      ["gallery", "04 · Galleria delle immagini di dettaglio", []],
      ["outro", "05 · Testi conclusivi", ["outro", "outroInfo"]],
      ["settings", "06 · Pubblicazione, indirizzo e motori di ricerca", ["status", "slug", "href", "seo", "position"]],
    ];
    fields.replaceChildren(...stages.map(([stage, title, keys]) => {
      const section = disclosure(resource + ":" + stage, title);
      section.dataset.editorStage = stage;
      if (stage === "cover") {
        section.append(node("p", { text: "La copertina caricata viene usata anche come immagine di apertura nella pagina interna." }));
        section.append(mediaEditor(kind, draft, media.find((entry) => entry.role === "cover") ?? { role: "cover", alt: "", position: 0 }, card));
      } else if (stage === "gallery") {
        const details = media.filter((entry) => entry.role === "detail");
        if (!details.length) section.append(node("p", { text: "Nessuna immagine di dettaglio.", className: "admin-empty" }));
        details.forEach((entry) => section.append(mediaEditor(kind, draft, entry, card)));
      } else {
        keys.filter((field) => COLLECTION_FIELDS[kind].includes(field)).forEach((field) => section.append(collectionFieldEditor(field, draft, update, rerender, () => draft)));
      }
      return section;
    }));
  };
  rerender();
  card.append(fields);
  const actions = node("div", { className: "admin-actions" });
  actions.append(button("Save", async () => {
    const operation = state.drafts.snapshot(resource);
    try {
      await withBusy(resource, card, async () => {
        const saved = await saveCollection(kind, draft);
        if (item.isNew) {
          const savedIdentity = transitionNewParentResources(kind, item, saved, operation);
          if (!savedIdentity) return;
          state.collections[kind] = state.collections[kind].map((entry) => entry.draftId === item.draftId ? savedIdentity : entry);
        } else clearDraftIfCurrent(resource, operation);
        await reloadCollections();
        setStatus("Elemento salvato.");
        renderApp();
      });
    } catch (error) { reportError(error); }
  }));
  actions.append(button("Cancel", () => {
    draft = clone(item);
    state.drafts.clear(resource);
    draft = state.drafts.begin(resource, item);
    rerender();
    clearDirty(resource);
    setStatus("Modifiche annullate.");
  }, "admin-quiet"));
  actions.append(button("Delete", async () => {
    if (item.isNew) {
      state.collections[kind] = state.collections[kind].filter((entry) => entry.draftId !== item.draftId);
      clearParentResources(kind, item);
      renderApp();
      return;
    }
    if (!window.confirm("Eliminare questo elemento?")) return;
    const snapshots = parentResourceSnapshots(kind, item);
    try {
      await withBusy(resource, card, async () => {
        await api(`/api/admin/${kind}/${encodeURIComponent(draft.slug)}`, { method: "DELETE" });
        clearParentResources(kind, item, snapshots);
        await reloadCollections();
        setStatus("Elemento eliminato.");
        renderApp();
      });
    } catch (error) { reportError(error); }
  }, "admin-quiet"));
  actions.append(
    button("Reorder ↑", () => reorderCollection(kind, index, index - 1, collectionScope), "admin-quiet"),
    button("Reorder ↓", () => reorderCollection(kind, index, index + 1, collectionScope), "admin-quiet"),
  );
  card.append(actions);
  return card;
}

function collectionPanel(kind, title) {
  const wrap = node("section", { className: "admin-panel", attrs: { "aria-busy": String(state.busy.busy) } });
  wrap.append(node("h2", { text: title }));
  const list = state.collections[kind];
  wrap.append(button(`Create ${title.slice(0, -1) || title}`, () => {
    const next = blankCollection(kind, list.length);
    const resource = collectionResource(kind, next);
    state.collections[kind].push(next);
    state.drafts.begin(resource, next);
    markDirty(resource);
    renderApp();
  }));
  list.forEach((item, index) => wrap.append(collectionCard(kind, item, index, wrap)));
  return wrap;
}

function renderApp() {
  panels.replaceChildren();
  const config = CONTENT_SECTIONS[state.section];
  const panel = node("section", { className: "admin-panel" });
  panel.append(node("h2", { text: config.title }));
  const orderedKeys = Object.keys(SITE_CONTENT).filter((key) => !key.startsWith("seo."));
  const order = (key) => orderedKeys.includes(key) ? orderedKeys.indexOf(key) : orderedKeys.length;
  const entries = Object.entries(state.content)
    .filter(([key]) => isContentKeyInSection(key, state.section))
    .sort(([left], [right]) => order(left) - order(right));
  entries.filter(([key]) => !key.startsWith("seo.")).forEach(([key, value]) => panel.append(contentCard(key, value)));
  if (state.section === "archive") panel.append(collectionPanel("archive", "Archivio"));
  if (state.section === "events") panel.append(collectionPanel("events", "Eventi"));
  entries.filter(([key]) => key.startsWith("seo.")).forEach(([key, value]) => panel.append(contentCard(key, value)));
  panels.append(panel);
  tabs.forEach((tab) => {
    if (tab.dataset.adminSection === state.section) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  refreshBusyState();
}

async function loadEditor(session, epoch = state.auth.capture()) {
  if (!state.auth.isCurrent(epoch) || !session?.csrfToken) return false;
  state.csrfToken = session.csrfToken;
  editor.setAttribute("aria-busy", "true");
  try {
    const [content, collections] = await Promise.all([api("/api/content"), fetchCollections()]);
    if (!state.auth.isCurrent(epoch)) return false;
    state.content = content;
    state.collections = collections;
    state.dirty.reset();
    state.drafts.reset();
    refreshDirtyIndicator();
    loginPanel.hidden = true;
    editor.hidden = false;
    editor.inert = false;
    setLoginStatus("");
    setStatus("");
    renderApp();
    editorTitle.focus();
    return true;
  } finally {
    editor.setAttribute("aria-busy", "false");
  }
}

  let booted = false;
  function boot() {
    if (booted) return controller;
    booted = true;
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      // Supersede the boot-time session probe (and any earlier login) before
      // the credential request starts, so its 401 cannot reset this attempt.
      const epoch = state.auth.invalidate();
      const form = new FormData(loginForm);
      setLoginStatus("Accesso in corso…");
      try {
        await withBusy("login", loginForm, async () => {
          const session = await api("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
            headers: { "content-type": "application/json" },
            resetOnUnauthorized: false,
          });
          if (!state.auth.isCurrent(epoch)) throw staleRequest();
          const authenticatedEpoch = state.auth.invalidate();
          await loadEditor(session, authenticatedEpoch);
        });
      } catch (error) {
        reportError(error, setLoginStatus);
        if (!isStale(error)) loginForm.querySelector("input")?.focus();
      }
    });

    logoutButton.addEventListener("click", async () => {
      const logoutEpoch = state.auth.invalidate();
      try {
        await withBusy("logout", editor, async () => {
          await api("/api/admin/logout", { method: "POST" });
          if (state.auth.isCurrent(logoutEpoch)) resetEditor("Sessione chiusa.", "");
        });
      } catch (error) {
        if (error?.status !== 401) reportError(error);
      }
    });

    tabs.forEach((tab) => tab.addEventListener("click", () => {
      if (state.busy.busy) return;
      state.section = tab.dataset.adminSection;
      renderApp();
    }));
    window.addEventListener?.("beforeunload", (event) => {
      if (state.dirty.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    const initialEpoch = state.auth.capture();
    api("/api/admin/session").then((session) => loadEditor(session, initialEpoch)).catch((error) => {
      if (!isStale(error)) loginForm.querySelector("input")?.focus();
    });
    return controller;
  }

  const controller = { state, boot, render: renderApp, reset: resetEditor, api, reloadCollections };
  return controller;
}

export function bootAdmin(options) {
  const controller = createAdminController(options);
  controller.boot();
  return controller;
}

if (typeof globalThis.document !== "undefined" && globalThis.document.querySelector("#admin-login-form")) bootAdmin();
