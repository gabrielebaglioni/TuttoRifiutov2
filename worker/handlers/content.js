import { SITE_CONTENT } from "../content-defaults.js";
import { deleteContentOverride, getContentOverrides, setContentOverride } from "../db.js";
import { jsonResponse } from "../response.js";
import { requireAdmin } from "../auth.js";
import { isEditableContentKey, validateContentValue } from "../validation.js";

const PUBLIC_HEADERS = { "cache-control": "no-store" };

function rowsFrom(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.results) ? result.results : [];
}

function invalidKey() {
  return jsonResponse({ error: "Invalid content key" }, { status: 400, headers: PUBLIC_HEADERS });
}

function invalidValue() {
  return jsonResponse({ error: "Invalid content value" }, { status: 400, headers: PUBLIC_HEADERS });
}

function storageFailure() {
  return jsonResponse({ error: "Content storage unavailable" }, { status: 500, headers: PUBLIC_HEADERS });
}

export function mergeContent(defaults, rows) {
  const merged = { ...defaults };
  for (const row of rows ?? []) {
    if (!row || !isEditableContentKey(row.key, defaults)) continue;
    try {
      const value = JSON.parse(row.value_json);
      if (validateContentValue(row.key, value, defaults)) merged[row.key] = value;
    } catch {
      // Bad stored values cannot make a public page lose its static fallback.
    }
  }
  return merged;
}

export async function readContent(_request, env) {
  try {
    const rows = env.DB ? rowsFrom(await getContentOverrides(env.DB)) : [];
    return jsonResponse(mergeContent(SITE_CONTENT, rows), { headers: PUBLIC_HEADERS });
  } catch {
    return jsonResponse(SITE_CONTENT, { headers: PUBLIC_HEADERS });
  }
}

const MAX_CONTENT_REQUEST_BYTES = 1_000_000;

async function readBoundedText(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_CONTENT_REQUEST_BYTES) return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let source = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_CONTENT_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      source += decoder.decode(value, { stream: true });
    }
    return source + decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function readValue(request) {
  const source = await readBoundedText(request);
  if (source === null) return null;
  try {
    const payload = JSON.parse(source);
    return payload && Object.prototype.hasOwnProperty.call(payload, "value") ? payload.value : null;
  } catch {
    return null;
  }
}

export async function updateContent(request, env, key) {
  const admin = await requireAdmin(request, env, { csrf: true });
  if (admin instanceof Response) return admin;
  if (!isEditableContentKey(key)) return invalidKey();

  const value = await readValue(request);
  if (!validateContentValue(key, value)) return invalidValue();
  try {
    await setContentOverride(env.DB, key, value);
    return jsonResponse({ key, value }, { headers: PUBLIC_HEADERS });
  } catch {
    return storageFailure();
  }
}

export async function restoreContent(request, env, key) {
  const admin = await requireAdmin(request, env, { csrf: true });
  if (admin instanceof Response) return admin;
  if (!isEditableContentKey(key)) return invalidKey();
  try {
    await deleteContentOverride(env.DB, key);
    return jsonResponse({ key, value: SITE_CONTENT[key] }, { headers: PUBLIC_HEADERS });
  } catch {
    return storageFailure();
  }
}
