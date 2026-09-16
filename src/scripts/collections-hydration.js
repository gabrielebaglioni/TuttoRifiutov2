import { fetchJson, isAllowedLink } from "./content-hydration.js";
import { validMediaSources } from "../data/media-source.ts";
import { ensureCollectionsReadiness } from "./collections-readiness.ts";
import { eventsForPublicGroup } from "../data/event-status.ts";

export { eventsForPublicGroup } from "../data/event-status.ts";

const detailFallbacks = new WeakMap();

function imageMedia(document, media, { width, height, loading = "lazy", sizes = "(max-width: 1000px) 100vw, 40vw", fallback = null }) {
  if (!media || media.type !== "image" || typeof media.alt !== "string" || !Array.isArray(media.sources)) return null;
  const sources = validMediaSources(media.sources);
  if (!sources.length) return null;
  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.type = "image/webp";
  source.srcset = sources.map((item) => `${item.src} ${item.width}w`).join(", ");
  source.sizes = sizes;
  picture.appendChild(source);
  const image = document.createElement("img");
  image.src = sources.at(-1).src;
  image.alt = media.alt;
  image.width = width;
  image.height = height;
  image.loading = loading;
  image.decoding = "async";
  image.sizes = source.sizes;
  image.addEventListener("error", () => {
    if (fallback) picture.replaceWith(fallback.cloneNode(true));
  }, { once: true });
  picture.appendChild(image);
  return picture;
}

function validEvent(event) {
  return event && typeof event.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug)
    && typeof event.title === "string" && typeof event.code === "string";
}

function validArchive(item) {
  return item && typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)
    && typeof item.title === "string" && typeof item.code === "string" && isAllowedLink(item.href);
}

function mediaOverride(item, role, position, fallback) {
  if (!Array.isArray(item.media)) return fallback;
  const media = item.media.find((candidate) => candidate?.role === role && candidate.position === position);
  return media && Array.isArray(media.sources) ? { type: "image", alt: media.alt, sources: media.sources } : fallback;
}

function fallbackRow(container, item, fallbacks) {
  return fallbacks?.get(item.slug) ?? [...container.querySelectorAll(".work-item-row")].find((row) => row.dataset.collectionSlug === item.slug) ?? null;
}

function mediaPlaceholder(document, title) {
  const placeholder = document.createElement("div");
  placeholder.className = "work-item-media-placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", title);
  return placeholder;
}

function detailMediaPlaceholder(document, title) {
  const placeholder = document.createElement("div");
  placeholder.className = "project-img-media-placeholder";
  placeholder.dataset.mediaFallbackPlaceholder = "detail";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", title);
  return placeholder;
}

function originalVisual(container) {
  const local = [...(container?.children ?? [])].find((child) => child.hasAttribute?.("data-media-fallback"));
  const visual = local ?? container?.firstElementChild;
  if (!visual) return null;
  const clone = visual.cloneNode(true);
  clone.removeAttribute?.("hidden");
  return clone;
}

function detailOwnerKey(root, item) {
  const kind = root?.dataset?.publicDetailKind ?? item?.kind ?? "";
  const slug = root?.dataset?.publicDetailSlug ?? item?.slug ?? "";
  return `${kind}:${slug}`;
}

function originalDetailFallbacks(root, item) {
  let owners = detailFallbacks.get(root);
  if (!owners) {
    owners = new Map();
    detailFallbacks.set(root, owners);
  }
  const owner = detailOwnerKey(root, item);
  if (!owners.has(owner)) {
    const fallbacks = new Map();
    const cover = root.querySelector("[data-collection-media=cover]");
    if (cover) fallbacks.set("cover", originalVisual(cover));
    const list = root.querySelector("[data-collection-media-list]");
    for (const wrapper of list?.querySelectorAll?.("[data-collection-media-slot]") ?? []) {
      const slot = wrapper.dataset.collectionMediaSlot;
      if (slot) fallbacks.set(slot, originalVisual(wrapper));
    }
    owners.set(owner, fallbacks);
  }
  return owners.get(owner);
}

function fallbackForSlot(fallbacks, slot, document, title) {
  if (!fallbacks.has(slot) || !fallbacks.get(slot)) fallbacks.set(slot, detailMediaPlaceholder(document, title));
  const fallback = fallbacks.get(slot);
  // A synthetic fallback has no original editorial alt text, so keep its
  // accessible label aligned with the newest remote record while its fixed
  // placeholder structure remains stable.
  if (fallback?.dataset?.mediaFallbackPlaceholder) fallback.setAttribute("aria-label", title);
  return fallback;
}

function fallbackVisual(row, document, title) {
  return row?.querySelector(".work-item picture, .work-item img, .work-item video")?.cloneNode(true) ?? mediaPlaceholder(document, title);
}

function eventCard(document, event, index, fallback) {
  const row = document.createElement("div");
  row.className = "work-item-row";
  row.id = `work-item-row-${index + 1}`;
  row.dataset.collectionSlug = event.slug;
  const link = document.createElement("a");
  link.href = `/eventi/${event.slug}`;
  const card = document.createElement("div");
  card.className = "work-item";
  const media = imageMedia(document, mediaOverride(event, "cover", 0, event.cardMedia), { width: 1200, height: 1500, loading: index < 2 ? "eager" : "lazy", fallback: fallbackVisual(fallback, document, event.title) });
  if (!media) return null;
  card.appendChild(media);
  const info = document.createElement("div");
  info.className = "work-item-info";
  for (const value of [event.title, event.code]) {
    const text = document.createElement("p");
    text.textContent = value;
    info.appendChild(text);
  }
  card.appendChild(info);
  link.appendChild(card);
  row.appendChild(link);
  return row;
}

function archiveCard(document, item, index, fallback) {
  const row = document.createElement("div");
  row.className = "work-item-row";
  row.id = `work-item-row-${index + 1}`;
  row.dataset.collectionSlug = item.slug;
  const link = document.createElement("a");
  link.href = fallback ? item.href : `/archivio/${item.slug}`;
  const card = document.createElement("div");
  card.className = "work-item";
  const media = imageMedia(document, mediaOverride(item, "cover", 0, item.coverMedia), { width: 1200, height: 1500, loading: index < 2 ? "eager" : "lazy", fallback: fallbackVisual(fallback, document, item.title) });
  if (!media) return null;
  card.appendChild(media);
  const info = document.createElement("div");
  info.className = "work-item-info";
  for (const value of [item.title, item.code]) {
    const text = document.createElement("p");
    text.textContent = value;
    info.appendChild(text);
  }
  card.appendChild(info);
  link.appendChild(card);
  row.appendChild(link);
  return row;
}

function fallbackCard(container, item, index, kind, fallbacks) {
  const href = kind === "events" ? `/eventi/${item.slug}` : item.href;
  const previous = fallbackRow(container, item, fallbacks);
  if (!previous) return null;
  const card = previous.cloneNode(true);
  card.id = `work-item-row-${index + 1}`;
  card.dataset.collectionSlug = item.slug;
  const link = card.querySelector("a");
  if (link) link.setAttribute("href", href);
  const copy = card.querySelectorAll(".work-item-info p");
  if (copy.length >= 2) {
    copy[0].textContent = item.title;
    copy[1].textContent = item.code;
  }
  return card;
}

function placeholderCard(document, item, index, kind) {
  const row = document.createElement("div");
  row.className = "work-item-row";
  row.id = `work-item-row-${index + 1}`;
  row.dataset.collectionSlug = item.slug;
  const link = document.createElement("a");
  link.href = kind === "events" ? `/eventi/${item.slug}` : `/archivio/${item.slug}`;
  const card = document.createElement("div"); card.className = "work-item";
  const placeholder = mediaPlaceholder(document, item.title);
  const info = document.createElement("div"); info.className = "work-item-info";
  info.append(text(document, "p", "", item.title), text(document, "p", "", item.code));
  card.append(placeholder, info); link.appendChild(card); row.appendChild(link); return row;
}

function renderCollection(container, items, validate, create, kind, fallbacks) {
  if (!container || !Array.isArray(items) || !items.every(validate)) return false;
  if (!items.length) { container.replaceChildren(); return true; }
  const cards = items.map((item, index) => {
    const fallback = fallbackRow(container, item, fallbacks);
    return create(container.ownerDocument, item, index, fallback) ?? fallbackCard(container, item, index, kind, fallbacks) ?? placeholderCard(container.ownerDocument, item, index, kind);
  });
  if (cards.some((card) => !card)) return false;
  container.replaceChildren(...cards);
  return true;
}

export function renderEvents(container, events, fallbacks) {
  return renderCollection(container, events, validEvent, eventCard, "events", fallbacks);
}

export function renderArchive(container, items) {
  return renderCollection(container, items, validArchive, archiveCard, "archive");
}

function text(document, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function renderColumns(node, value, flat = false) {
  const groups = flat ? [value] : value;
  if (!Array.isArray(groups) || !groups.every((group) => Array.isArray(group) && group.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === "string")))) return;
  node.replaceChildren(...groups.map((group) => {
    const column = text(node.ownerDocument, "div", "project-info-sub-col", "");
    for (const [label, content] of group) column.append(text(node.ownerDocument, "p", "type-mono", label), text(node.ownerDocument, "p", "", content), node.ownerDocument.createElement("br"), node.ownerDocument.createElement("br"));
    return column;
  }));
}

export function renderDetail(root, item, { mediaOnly = false } = {}) {
  if (!root || !item || typeof item !== "object") return false;
  if (!mediaOnly) {
    for (const node of root.querySelectorAll("[data-collection-field]")) {
      const value = item[node.dataset.collectionField];
      if (typeof value === "string" && !node.dataset.collectionRender && node.textContent.trim().replace(/\s+/g, " ") !== value.trim().replace(/\s+/g, " ")) node.textContent = value;
    }
    for (const node of root.querySelectorAll("[data-collection-render]")) {
      const value = item[node.dataset.collectionField];
      if (node.dataset.collectionRender === "meta" && Array.isArray(value) && value.every((part) => typeof part === "string")) node.replaceChildren(...value.map((part) => text(node.ownerDocument, "p", "type-mono", part)));
      if (node.dataset.collectionRender === "columns") renderColumns(node, value);
      if (node.dataset.collectionRender === "details") renderColumns(node, value, true);
    }
  }
  const fallbacks = originalDetailFallbacks(root, item);
  const cover = mediaOverride(item, "cover", 0, null);
  const coverNode = root.querySelector("[data-collection-media=cover]");
  if (cover && coverNode) {
    const fallback = fallbackForSlot(fallbacks, "cover", root.ownerDocument, cover.alt);
    const picture = imageMedia(root.ownerDocument, cover, { width: 1600, height: 1000, loading: "eager", sizes: "100vw", fallback });
    if (picture) coverNode.replaceChildren(picture);
  }
  const storedDetails = Array.isArray(item.media) ? item.media.filter((media) => media?.role === "detail").sort((left, right) => left.position - right.position) : [];
  const mediaList = root.querySelector("[data-collection-media-list]");
  if (mediaList && storedDetails.length) {
    for (const media of storedDetails) {
      const slot = `detail:${media.position}`;
      let wrapper = mediaList.querySelector(`[data-collection-media-slot="${slot}"]`);
      if (!wrapper) { wrapper = text(mediaList.ownerDocument, "div", "project-img", ""); wrapper.dataset.collectionMediaSlot = slot; mediaList.appendChild(wrapper); }
      const fallback = fallbackForSlot(fallbacks, slot, root.ownerDocument, media.alt);
      const picture = imageMedia(root.ownerDocument, { type: "image", alt: media.alt, sources: media.sources }, { width: 1400, height: 1000, sizes: "(max-width: 1000px) 100vw, 75vw", fallback });
      if (picture) wrapper.replaceChildren(picture);
    }
  }
  return true;
}

async function hydrateEvents() {
  if (!document.querySelector("[data-public-events]")) return true;
  const payload = await fetchJson("/api/events", { array: true });
  if (!Array.isArray(payload)) return false;
  const panels = document.querySelectorAll("[data-public-events]");
  const fallbacks = new Map([...panels].flatMap((panel) => [...panel.querySelectorAll(".work-item-row")]).map((row) => [row.dataset.collectionSlug, row]));
  let hydrated = true;
  for (const panel of panels) {
    const status = panel.dataset.publicEvents;
    const items = eventsForPublicGroup(payload, status);
    hydrated = renderEvents(panel, items, fallbacks) && hydrated;
  }
  return hydrated;
}

async function hydrateArchive() {
  if (!document.querySelector("[data-public-archive]")) return true;
  const payload = await fetchJson("/api/archive", { array: true });
  if (!Array.isArray(payload)) return false;
  const container = document.querySelector("[data-public-archive]");
  return container ? renderArchive(container, payload) : true;
}

export function detailIdentityFromPath(pathname) {
  const match = typeof pathname === "string"
    ? pathname.match(/^\/(eventi|archivio)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)
    : null;
  if (!match || match[2] === "template") return null;
  return { kind: match[1] === "eventi" ? "events" : "archive", slug: match[2] };
}

export async function hydrateDetailTemplate(root, pathname, fetcher = fetchJson) {
  if (!root) return false;
  const identity = detailIdentityFromPath(pathname);
  if (!identity || root.dataset.publicDetailTemplate !== identity.kind) return false;
  const item = await fetcher(`/api/${identity.kind}/${identity.slug}`);
  if (!item || item.slug !== identity.slug) return false;
  root.dataset.publicDetailKind = identity.kind;
  root.dataset.publicDetailSlug = identity.slug;
  return renderDetail(root, item);
}

async function hydrateDetails() {
  let hydrated = true;
  for (const root of document.querySelectorAll("[data-public-detail-kind][data-public-detail-slug]")) {
    const kind = root.dataset.publicDetailKind;
    const slug = root.dataset.publicDetailSlug;
    if (!["events", "archive"].includes(kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    const item = await fetchJson(`/api/${kind}/${slug}`);
    if (item) hydrated = renderDetail(root, item, { mediaOnly: root.hasAttribute("data-public-detail-media-only") }) && hydrated;
    else hydrated = false;
  }
  for (const root of document.querySelectorAll("[data-public-detail-template]")) {
    hydrated = await hydrateDetailTemplate(root, window.location.pathname, fetchJson) && hydrated;
  }
  return hydrated;
}

async function start() {
  const readiness = ensureCollectionsReadiness(window);
  const results = await Promise.allSettled([hydrateEvents(), hydrateArchive(), hydrateDetails()]);
  readiness.settle(results.some((result) => result.status === "rejected" || result.value !== true) ? "failure" : "complete");
}

if (typeof document !== "undefined") {
  ensureCollectionsReadiness(window);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start().catch(() => ensureCollectionsReadiness(window).settle("failure")), { once: true });
  else start().catch(() => ensureCollectionsReadiness(window).settle("failure"));
}
