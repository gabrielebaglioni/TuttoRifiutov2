import { SITE_CONTENT } from "../data/site-content.ts";
import { THEME_KEY } from '../data/theme.ts';
import { publicTheme } from './theme.ts';

const REQUEST_TIMEOUT_MS = 4_000;
const menuValuesByRoot = new WeakMap();

export function isAllowedLink(value) {
  if (typeof value !== "string" || !value || value.includes("\\")) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "mailto:" && Boolean(url.pathname));
  } catch {
    return false;
  }
}

function valueAtPath(value, path) {
  if (!path) return value;
  return path.split(".").reduce((current, part) => (
    Array.isArray(current) && /^\d+$/.test(part) ? current[Number(part)] : undefined
  ), value);
}

// Astro adds indentation-only text nodes around nested spans. Those nodes do
// not represent editorial copy; regular spaces and all non-empty text remain
// literal so a CMS update cannot accidentally normalize prose.
function isAstroFormattingWhitespace(value) {
  return /^[\t\f\r\n ]*$/.test(value) && /[\r\n]/.test(value);
}

function semanticText(node) {
  let value = "";
  const visit = (current) => {
    if (current?.nodeType === 3) {
      const text = current.data ?? current.textContent ?? "";
      if (!isAstroFormattingWhitespace(text)) value += text;
      return;
    }
    for (const child of current?.childNodes ?? []) visit(child);
  };
  visit(node);
  return value;
}

function equalValues(left, right) {
  if (typeof left === "string" || typeof right === "string") return typeof left === "string" && left === right;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => equalValues(value, right[index]));
}

function setText(node, value) {
  if (typeof value !== "string" || semanticText(node) === value) return false;
  node.textContent = value;
  return true;
}

function setLink(node, value) {
  if (typeof value !== "string" || !isAllowedLink(value) || node.getAttribute("href") === value) return false;
  node.setAttribute("href", value);
  return true;
}

function stringRows(value, width) {
  return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.length === width && row.every((part) => typeof part === "string"));
}

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function directChildren(node, selector) {
  return [...node.children].filter((child) => child.matches(selector));
}

function markedTarget(node) {
  if (node?.matches?.("[data-content-path]")) return node;
  return node?.querySelector?.("[data-content-path]") ?? node;
}

function writePreservingMarker(node, value) {
  return node ? setText(markedTarget(node), value) : false;
}

function markedLeaves(node) {
  const leaves = [];
  if (node?.matches?.("[data-content-path]")) leaves.push(node);
  leaves.push(...(node?.querySelectorAll?.("[data-content-path]") ?? []));
  return leaves;
}

function rewritePaths(child, index) {
  for (const leaf of markedLeaves(child)) {
    const current = leaf.getAttribute("data-content-path");
    if (!current) continue;
    const suffix = current.split(".").slice(1);
    const next = [String(index), ...suffix].join(".");
    if (next !== current) leaf.setAttribute("data-content-path", next);
  }
}

function reconcile(node, values, selector, read, write, create) {
  const existing = directChildren(node, selector);
  const current = existing.map(read);
  if (equalValues(current, values)) return false;
  const template = existing[0] ?? null;
  const reused = Math.min(existing.length, values.length);
  for (let index = 0; index < reused; index += 1) write(existing[index], values[index], index);
  for (let index = reused; index < values.length; index += 1) {
    const child = template ? template.cloneNode(true) : create(values[index], index);
    rewritePaths(child, index);
    write(child, values[index], index);
    node.appendChild(child);
  }
  for (let index = values.length; index < existing.length; index += 1) existing[index].remove();
  return true;
}

function clientRows(node) {
  return directChildren(node, ".client-row").map((row) => [...row.querySelectorAll("p")].map(semanticText));
}

function renderClients(node, rows, key) {
  if (!stringRows(rows, 2)) return false;
  const current = clientRows(node);
  if (!current.length && equalValues(SITE_CONTENT[key], rows)) return false;
  return reconcile(node, rows, ".client-row", (row) => [...row.querySelectorAll("p")].map(semanticText), (row, [name, place]) => {
    const parts = row.querySelectorAll("p");
    writePreservingMarker(parts[0], name);
    writePreservingMarker(parts[1], place);
  }, ([name, place], index) => {
    const row = element(node.ownerDocument, "div", "client-row", "");
    const nameNode = element(node.ownerDocument, "p", "type-mono", name);
    const placeNode = element(node.ownerDocument, "p", "type-mono", place);
    nameNode.setAttribute("data-content-path", `${index}.0`);
    placeNode.setAttribute("data-content-path", `${index}.1`);
    row.append(nameNode, placeNode);
    return row;
  });
}

function renderMenu(node, rows, key, root) {
  if (!stringRows(rows, 2) || !rows.every(([, href]) => isAllowedLink(href))) return false;
  const remembered = menuValuesByRoot.get(root);
  if (remembered) {
    if (equalValues(remembered, rows)) return false;
    menuValuesByRoot.set(root, rows.map((row) => [...row]));
    return true;
  }
  const current = directChildren(node, ".menu-segment").map((segment) => [semanticText(segment), segment.getAttribute("href")]);
  // Menu owns its rich, animated DOM. Hydration only reports a changed data
  // set; menu.js receives that exact key and rebuilds it when necessary.
  const changed = current.length ? !equalValues(current, rows) : !equalValues(SITE_CONTENT[key], rows);
  menuValuesByRoot.set(root, rows.map((row) => [...row]));
  return changed;
}

function renderAbout(node, values) {
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return false;
  return reconcile(node, values, "h3", (child) => semanticText(markedTarget(child)), writePreservingMarker, (value, index) => {
    const child = element(node.ownerDocument, "h3", "type-var-2", value);
    child.setAttribute("data-content-path", String(index));
    return child;
  });
}

function renderStats(node, values) {
  if (!stringRows(values, 3)) return false;
  const document = node.ownerDocument;
  const create = ([count, text, label], index) => {
    const item = element(document, "div", "stat-item", "");
    const countBox = element(document, "div", "stat-count", "");
    const countNode = element(document, "h1", "", count); countNode.setAttribute("data-content-path", `${index}.0`); countBox.appendChild(countNode);
    const content = element(document, "div", "stat-content", "");
    const title = element(document, "div", "stat-title", "");
    const titleNode = element(document, "h3", "", text); titleNode.setAttribute("data-content-path", `${index}.1`); title.appendChild(titleNode);
    const info = element(document, "div", "stat-info", "");
    const infoNode = element(document, "p", "type-mono", label); infoNode.setAttribute("data-content-path", `${index}.2`); info.appendChild(infoNode);
    content.append(title, info); item.append(countBox, content); return item;
  };
  return reconcile(node, values, ".stat-item", (item) => [
    semanticText(markedTarget(item.querySelector(".stat-count h1"))),
    semanticText(markedTarget(item.querySelector(".stat-title h3"))),
    semanticText(markedTarget(item.querySelector(".stat-info p"))),
  ], (item, [count, text, label]) => {
    writePreservingMarker(item.querySelector(".stat-count h1"), count);
    writePreservingMarker(item.querySelector(".stat-title h3"), text);
    writePreservingMarker(item.querySelector(".stat-info p"), label);
  }, create);
}

function contactClockPartIndex(template) {
  const parts = [...template?.querySelectorAll?.("p") ?? []];
  const clock = template?.querySelector?.(".contact-clock");
  const index = parts.indexOf(clock);
  return index >= 0 ? index : 1;
}

function normalizeContactClock(node, clockPartIndex) {
  for (const [rowIndex, row] of directChildren(node, ".contact-info-row").entries()) {
    [...row.querySelectorAll("p")].forEach((part, partIndex) => part.classList.toggle("contact-clock", rowIndex === 0 && partIndex === clockPartIndex));
  }
}

function renderContactRows(node, values) {
  if (!stringRows(values, 2)) return false;
  const template = directChildren(node, ".contact-info-row")[0] ?? null;
  const clockPartIndex = contactClockPartIndex(template);
  const changed = reconcile(node, values, ".contact-info-row", (row) => [...row.querySelectorAll("p")].map((part) => semanticText(markedTarget(part))), (row, [label, value]) => {
    const parts = row.querySelectorAll("p");
    writePreservingMarker(parts[0], label);
    writePreservingMarker(parts[1], value);
  }, ([label, value], index) => {
    const row = element(node.ownerDocument, "div", "contact-info-row", "");
    const labelNode = element(node.ownerDocument, "p", "", label);
    const valueNode = element(node.ownerDocument, "p", index === 0 && clockPartIndex === 1 ? "contact-clock" : "", value);
    labelNode.setAttribute("data-content-path", `${index}.0`);
    valueNode.setAttribute("data-content-path", `${index}.1`);
    row.append(labelNode, valueNode);
    return row;
  });
  if (changed) normalizeContactClock(node, clockPartIndex);
  return changed;
}

function renderProjectMeta(node, values) {
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return false;
  return reconcile(node, values, "p", (child) => semanticText(markedTarget(child)), writePreservingMarker, (value, index) => {
    const child = element(node.ownerDocument, "p", "type-mono", value);
    child.setAttribute("data-content-path", String(index));
    return child;
  });
}

function columnPairs(column) {
  const leaves = [...column.querySelectorAll("p")].map(markedTarget);
  if (leaves.length % 2) return [];
  const rows = [];
  for (let index = 0; index < leaves.length; index += 2) rows.push([semanticText(leaves[index]), semanticText(leaves[index + 1])]);
  return rows;
}

function columnBreak(column, index) {
  const existing = [...column.children].filter((child) => child.tagName === "BR");
  return existing[index]?.cloneNode(true) ?? column.ownerDocument.createElement("br");
}

function writeColumn(column, pairs, columnIndex) {
  const leaves = [...column.querySelectorAll("p")];
  const labelTemplate = leaves[0]?.cloneNode(true) ?? element(column.ownerDocument, "p", "type-mono", "");
  const valueTemplate = leaves[1]?.cloneNode(true) ?? element(column.ownerDocument, "p", "", "");
  const children = [];
  for (let rowIndex = 0; rowIndex < pairs.length; rowIndex += 1) {
    const [label, value] = pairs[rowIndex];
    const labelNode = leaves[rowIndex * 2] ?? labelTemplate.cloneNode(true);
    const valueNode = leaves[rowIndex * 2 + 1] ?? valueTemplate.cloneNode(true);
    writePreservingMarker(labelNode, label);
    writePreservingMarker(valueNode, value);
    markedTarget(labelNode).setAttribute("data-content-path", `${columnIndex}.${rowIndex}.0`);
    markedTarget(valueNode).setAttribute("data-content-path", `${columnIndex}.${rowIndex}.1`);
    children.push(labelNode, valueNode, columnBreak(column, rowIndex * 2), columnBreak(column, rowIndex * 2 + 1));
  }
  column.replaceChildren(...children);
}

function renderColumns(node, values) {
  if (!Array.isArray(values) || !values.every((column) => stringRows(column, 2))) return false;
  const existing = directChildren(node, ".project-info-sub-col");
  const current = existing.map(columnPairs);
  if (equalValues(current, values)) return false;
  const template = existing[0] ?? null;
  const reused = Math.min(existing.length, values.length);
  for (let index = 0; index < reused; index += 1) {
    if (!equalValues(columnPairs(existing[index]), values[index])) writeColumn(existing[index], values[index], index);
  }
  for (let index = reused; index < values.length; index += 1) {
    const column = template ? template.cloneNode(true) : element(node.ownerDocument, "div", "project-info-sub-col", "");
    writeColumn(column, values[index], index);
    node.appendChild(column);
  }
  for (let index = values.length; index < existing.length; index += 1) existing[index].remove();
  return true;
}

function renderContentValue(node, value, key, root) {
  const renderer = node.dataset.contentRender;
  if (renderer === "clients") return renderClients(node, value, key);
  if (renderer === "menu") return renderMenu(node, value, key, root);
  if (renderer === "about") return renderAbout(node, value);
  if (renderer === "stats") return renderStats(node, value);
  if (renderer === "contact-rows") return renderContactRows(node, value);
  if (renderer === "project-meta") return renderProjectMeta(node, value);
  if (renderer === "project-columns") return renderColumns(node, value);
  if (node.tagName === "A") return setLink(node, value);
  return setText(node, value);
}

function isNestedRendererMarker(node, key) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.dataset?.contentRender && parent.dataset.contentKey === key) return true;
    parent = parent.parentElement;
  }
  return false;
}

function applyContentChanges(root, values) {
  if (!root || !values || typeof values !== "object" || Array.isArray(values)) return {};
  const changed = {};
  const documentRoot = root.documentElement ? root : root.ownerDocument;
  if (documentRoot && Object.hasOwn(values, THEME_KEY) && publicTheme(documentRoot).apply(values[THEME_KEY])) changed[THEME_KEY] = values[THEME_KEY];
  for (const node of root.querySelectorAll("[data-content-key]")) {
    const key = node.dataset.contentKey;
    if (!key || !Object.prototype.hasOwnProperty.call(values, key) || isNestedRendererMarker(node, key)) continue;
    const value = valueAtPath(values[key], node.dataset.contentPath);
    if (renderContentValue(node, value, key, root)) changed[key] = values[key];
  }
  return changed;
}

export function applyContent(root, values) {
  return Object.keys(applyContentChanges(root, values)).length > 0;
}

export async function fetchJson(path, { timeoutMs = REQUEST_TIMEOUT_MS, array = false } = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload === "object" && (array || !Array.isArray(payload)) ? payload : null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function contentEvent(root, detail) {
  const EventType = root?.defaultView?.CustomEvent ?? root?.ownerDocument?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  return typeof EventType === "function" ? new EventType("tutto-rifiuto:content", { detail }) : null;
}

export async function hydrateContent(root = document) {
  const values = await fetchJson("/api/content");
  if (!values) return false;
  const changed = applyContentChanges(root, values);
  if (Object.keys(changed).length) {
    const event = contentEvent(root, changed);
    if (event) root.dispatchEvent?.(event);
  }
  return Object.keys(changed).length > 0;
}

let resolveContentReady;
export const contentReady = new Promise((resolve) => { resolveContentReady = resolve; });
function start() {
  hydrateContent().catch(() => {}).finally(() => resolveContentReady());
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
