import { jsonResponse } from "./response.js";
import { login, logout, session } from "./handlers/auth.js";
import { readContent, restoreContent, updateContent } from "./handlers/content.js";
import {
  createCollectionItem,
  deleteCollectionItem,
  reorderCollectionItems,
  readAdminCollection,
  readCollection,
  updateCollectionItem,
} from "./handlers/collections.js";
import { deleteMediaHandler, reorderMediaHandler, scheduleTombstoneRetry, serveMedia, updateMediaMetadataHandler, uploadMedia } from "./handlers/media.js";
import { isSlug } from "./slug.js";
import { getContentOverridesForKeys } from "./db.js";
import { mergeContent } from "./handlers/content.js";
import { SITE_CONTENT } from "./content-defaults.js";
import { rewriteMetadata } from "./html-metadata.js";
import { isPublicEventStatus } from "../src/data/event-status.js";
import { embeddedHtmlResponse } from "./static-html.js";

function methodNotAllowed(allow) {
  return jsonResponse(
    { error: "Method not allowed" },
    { status: 405, headers: { allow, "cache-control": "no-store" } },
  );
}

const SEO_PAGE_FOR_PATH = {
  "/": "home",
  "/index": "home",
  "/work": "archive",
  "/events": "events",
  "/contact": "contact",
  "/project": "project",
};

function rowsFrom(result) {
  return Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : [];
}

function seoPage(pathname) {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SEO_PAGE_FOR_PATH[trimmed] ?? null;
}

export function templatePathFor(pathname) {
  const match = typeof pathname === "string"
    ? pathname.match(/^\/(eventi|archivio)\/([^/]+)\/?$/)
    : null;
  if (!match || match[2] === "template" || !isSlug(match[2])) return null;
  return `/${match[1]}/template/`;
}

function parseSeo(value) {
  try {
    const seo = typeof value === "string" ? JSON.parse(value) : value;
    return seo && typeof seo.title === "string" && typeof seo.description === "string" ? seo : null;
  } catch {
    return null;
  }
}

function freshRepresentationHeaders(source) {
  const headers = new Headers(source);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-range", "accept-ranges"]) headers.delete(name);
  headers.set("cache-control", "no-store");
  return headers;
}

async function storedDetailOverride(env, pathname) {
  const templatePath = templatePathFor(pathname);
  if (!templatePath) return null;
  if (!env.DB) throw new Error("Collection storage unavailable");
  const match = pathname.match(/^\/(eventi|archivio)\/([^/]+)\/?$/);
  const kind = match[1] === "eventi" ? "events" : "archive";
  const slug = match[2];
  const table = kind === "events" ? "events" : "archive_items";
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE slug = ? LIMIT 1`).bind(slug).first();
  if (!row) return { kind, slug, row: null, seo: null, templatePath, isPublic: true };
  const isPublic = row.slug === slug && !row.deleting && row.published !== 0
    && (kind !== "events" || isPublicEventStatus(row.status));
  const seo = parseSeo(row.seo_json ?? row.seo);
  return { kind, slug, row, seo, templatePath, isPublic: isPublic && Boolean(seo) };
}

async function rewriteStaticMetadata(request, env, response, dynamic = null) {
  if (request.method !== "GET" || response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return response;
  const url = new URL(request.url);
  const page = seoPage(url.pathname);
  if (!env.DB || (!page && !dynamic)) return response;
  let values = SITE_CONTENT;
  try {
    values = mergeContent(SITE_CONTENT, rowsFrom(await getContentOverridesForKeys(env.DB, [
      ...(page ? [`seo.${page}.title`, `seo.${page}.description`] : []), "site.name", "seo.social.image_alt",
    ])));
  } catch {
    if (!dynamic) return response;
  }
  try {
    let title = dynamic?.seo?.title ?? (page ? values[`seo.${page}.title`] : null);
    let description = dynamic?.seo?.description ?? (page ? values[`seo.${page}.description`] : null);
    if (typeof title !== "string" || typeof description !== "string") return response;
    const canonical = new URL(url.pathname, url.origin).href;
    const body = rewriteMetadata(await response.text(), {
      title, description, canonical, url: canonical,
      siteName: values["site.name"], author: values["site.name"], imageAlt: values["seo.social.image_alt"],
    });
    const headers = freshRepresentationHeaders(response.headers);
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

function requestWithoutRepresentationValidators(request) {
  const headers = new Headers(request.headers);
  for (const name of ["if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range", "range"]) headers.delete(name);
  return new Request(request, { headers });
}

function serviceUnavailable(method = "GET") {
  return new Response(method === "HEAD" ? null : "Service unavailable", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function hiddenDetailResponse(method) {
  return new Response(method === "HEAD" ? null : "Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

function secureHtmlResponse(response, method) {
  if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return response;
  const headers = new Headers(response.headers);
  // set() replaces an upstream policy instead of appending a second,
  // potentially conflicting field value.
  headers.set("content-security-policy", HTML_CONTENT_SECURITY_POLICY);
  headers.set("x-frame-options", "DENY");
  return new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function canonicalPath(pathname) {
  if (typeof pathname !== "string") return null;
  const segments = [];
  for (const segment of pathname.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export function isInternalTemplatePath(pathname) {
  if (typeof pathname !== "string" || pathname.length > 4_096) return false;
  let candidate = pathname;
  for (let depth = 0; depth <= 2; depth += 1) {
    const normalized = canonicalPath(candidate);
    if (normalized && /^\/(?:eventi|archivio)\/template(?:\/index\.html)?$/i.test(normalized)) return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return false;
}

function noStoreResponse(response, method) {
  return new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: freshRepresentationHeaders(response.headers),
  });
}

function blockedTemplateResponse() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

async function fetchAsset(env, request) {
  const embedded = embeddedHtmlResponse(request);
  if (embedded) return embedded;
  try {
    return await env.ASSETS.fetch(request);
  } catch {
    return null;
  }
}

async function routeRequestInternal(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return jsonResponse({ ok: true });
  }
  if (url.pathname === "/api/content") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return readContent(request, env);
  }
  if (url.pathname === "/api/admin/media") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return uploadMedia(request, env, ctx);
  }
  if (url.pathname === "/api/admin/media/_order") {
    if (request.method !== "PUT") return methodNotAllowed("PUT");
    return reorderMediaHandler(request, env);
  }
  const adminMedia = url.pathname.match(/^\/api\/admin\/media\/(events|archive)\/(\d+)$/);
  if (adminMedia) {
    if (request.method === "PUT") return updateMediaMetadataHandler(request, env, adminMedia[1], Number(adminMedia[2]));
    if (request.method !== "DELETE") return methodNotAllowed("PUT, DELETE");
    return deleteMediaHandler(request, env, adminMedia[1], Number(adminMedia[2]), ctx);
  }
  const publicMedia = url.pathname.match(/^\/media\/(.+)$/);
  if (publicMedia) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    try {
      const parts = publicMedia[1].split("/").map(decodeURIComponent);
      if (parts.some((part) => !part || part.includes("/"))) return new Response("Not found", { status: 404 });
      scheduleTombstoneRetry(env, ctx);
      return serveMedia(request, env, parts.join("/"));
    } catch { return new Response("Not found", { status: 404 }); }
  }

  const contentRoute = url.pathname.match(/^\/api\/admin\/content\/(.+)$/);
  if (contentRoute) {
    let key;
    try {
      key = decodeURIComponent(contentRoute[1]);
    } catch {
      return jsonResponse({ error: "Invalid content key" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    if (request.method === "PUT") return updateContent(request, env, key);
    if (request.method === "DELETE") return restoreContent(request, env, key);
    return methodNotAllowed("PUT, DELETE");
  }

  const publicCollection = url.pathname.match(/^\/api\/(events|archive)(?:\/([^/]+))?$/);
  if (publicCollection) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    let slug;
    try { slug = publicCollection[2] ? decodeURIComponent(publicCollection[2]) : undefined; } catch { return jsonResponse({ error: "Invalid slug" }, { status: 400, headers: { "cache-control": "no-store" } }); }
    if (slug && !isSlug(slug)) return jsonResponse({ error: "Invalid slug" }, { status: 400, headers: { "cache-control": "no-store" } });
    scheduleTombstoneRetry(env, ctx);
    return readCollection(request, env, publicCollection[1], slug);
  }

  const adminCollection = url.pathname.match(/^\/api\/admin\/(events|archive)(?:\/([^/]+))?$/);
  if (adminCollection) {
    const [, kind, encodedSlug] = adminCollection;
    if (encodedSlug === "_order") {
      if (request.method !== "PUT") return methodNotAllowed("PUT");
      return reorderCollectionItems(request, env, kind);
    }
    let slug;
    try { slug = encodedSlug ? decodeURIComponent(encodedSlug) : undefined; } catch { return jsonResponse({ error: "Invalid slug" }, { status: 400, headers: { "cache-control": "no-store" } }); }
    if (slug && !isSlug(slug)) return jsonResponse({ error: "Invalid slug" }, { status: 400, headers: { "cache-control": "no-store" } });
    if (request.method === "GET") return readAdminCollection(request, env, kind, slug);
    if (!slug && request.method === "POST") return createCollectionItem(request, env, kind);
    if (slug && request.method === "PUT") return updateCollectionItem(request, env, kind, slug);
    if (slug && request.method === "DELETE") {
      const response = await deleteCollectionItem(request, env, kind, slug);
      if (response.status === 202 || response.status === 409) scheduleTombstoneRetry(env, ctx);
      return response;
    }
    return methodNotAllowed(slug ? "GET, PUT, DELETE" : "GET, POST");
  }
  const authRoutes = {
    "/api/admin/login": { method: "POST", handler: login },
    "/api/admin/logout": { method: "POST", handler: logout },
    "/api/admin/session": { method: "GET", handler: session },
  };
  const authRoute = authRoutes[url.pathname];
  if (authRoute) {
    if (request.method !== authRoute.method) {
      return methodNotAllowed(authRoute.method);
    }
    return authRoute.handler(request, env);
  }
  if (isInternalTemplatePath(url.pathname)) return blockedTemplateResponse();

  const templatePath = templatePathFor(url.pathname);
  const isSeoRoute = Boolean(seoPage(url.pathname) || templatePath);
  const representationMethod = request.method === "GET" || request.method === "HEAD";
  let detailOverride = null;
  if (templatePath && representationMethod) {
    try {
      detailOverride = await storedDetailOverride(env, url.pathname);
    } catch {
      return serviceUnavailable(request.method);
    }
    if (detailOverride.row && !detailOverride.isPublic) return hiddenDetailResponse(request.method);
  }
  const refreshesRepresentation = representationMethod && isSeoRoute && (!templatePath || detailOverride?.row);
  const assetRequest = refreshesRepresentation ? requestWithoutRepresentationValidators(request) : request;
  const staticResponse = await fetchAsset(env, assetRequest);
  if (!staticResponse) return serviceUnavailable(request.method);
  if (staticResponse.status !== 404 || !templatePath) {
    if (detailOverride && !detailOverride.row) return staticResponse;
    const rewritten = await rewriteStaticMetadata(request, env, staticResponse, detailOverride);
    return detailOverride?.row ? noStoreResponse(rewritten, request.method) : rewritten;
  }
  if (!representationMethod) return methodNotAllowed("GET, HEAD");

  if (!detailOverride?.row || !detailOverride.isPublic) return noStoreResponse(staticResponse, request.method);

  const templateUrl = new URL(detailOverride.templatePath, url.origin);
  const templateRequest = requestWithoutRepresentationValidators(new Request(templateUrl, {
    method: assetRequest.method,
    headers: assetRequest.headers,
  }));
  const templateResponse = await fetchAsset(env, templateRequest);
  if (!templateResponse || templateResponse.status !== 200 || !templateResponse.headers.get("content-type")?.toLowerCase().includes("text/html")) return serviceUnavailable(request.method);
  if (request.method === "HEAD") return new Response(null, { status: templateResponse.status, statusText: templateResponse.statusText, headers: freshRepresentationHeaders(templateResponse.headers) });
  return rewriteStaticMetadata(request, env, templateResponse, detailOverride);
}

export function routeRequest(request, env, ctx) {
  const pathname = new URL(request.url).pathname;
  const routed = routeRequestInternal(request, env, ctx);
  // API and R2 responses are never HTML. Return their original promise so the
  // security decoration does not alter lifecycle task scheduling semantics.
  if (pathname.startsWith("/api/") || pathname.startsWith("/media/")) return routed;
  return routed.then((response) => secureHtmlResponse(response, request.method));
}
