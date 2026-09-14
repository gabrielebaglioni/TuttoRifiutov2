import {
  createSession,
  deleteLoginAttempt,
  deleteSession,
  pruneLoginAttempts,
  reserveLoginAttempt,
} from "../db.js";
import {
  hashClientIp,
  hashToken,
  LOGIN_WINDOW_MS,
  MAX_FAILED_LOGINS,
  requireAdmin,
  sessionCookie,
  SESSION_DURATION_MS,
  verifyCredentials,
} from "../auth.js";
import { randomToken } from "../crypto.js";
import { jsonResponse } from "../response.js";

const MAX_LOGIN_BODY_BYTES = 1024;
const MAX_CREDENTIAL_LENGTH = 256;

function privateResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return jsonResponse(body, { ...init, headers });
}

function invalidCredentials() {
  return privateResponse({ error: "Invalid credentials" }, { status: 401 });
}

async function credentialsFrom(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof body?.username !== "string"
      || body.username.length > MAX_CREDENTIAL_LENGTH
      || typeof body?.password !== "string"
      || body.password.length > MAX_CREDENTIAL_LENGTH
    ) return null;
    return body;
  } catch {
    return null;
  }
}

export async function login(request, env) {
  const credentials = await credentialsFrom(request);
  if (
    !credentials
    || !env.DB
    || typeof env.SESSION_SECRET !== "string"
    || env.SESSION_SECRET.length === 0
    || typeof env.ADMIN_USERNAME !== "string"
    || env.ADMIN_USERNAME.length === 0
    || typeof env.ADMIN_PASSWORD !== "string"
    || env.ADMIN_PASSWORD.length === 0
  ) {
    return invalidCredentials();
  }

  const now = Date.now();
  const ipHash = await hashClientIp(request, env);
  if (!ipHash) return invalidCredentials();
  await pruneLoginAttempts(env.DB, now - LOGIN_WINDOW_MS);
  const reservation = await reserveLoginAttempt(
    env.DB,
    ipHash,
    now,
    now - LOGIN_WINDOW_MS,
    MAX_FAILED_LOGINS,
  );
  if (!reservation) return invalidCredentials();

  const valid = await verifyCredentials(env, credentials.username, credentials.password);
  if (!valid) {
    return invalidCredentials();
  }
  await deleteLoginAttempt(env.DB, reservation.id);

  const token = randomToken();
  const csrfToken = randomToken();
  const createdAt = Date.now();
  await createSession(
    env.DB,
    await hashToken(token, env.SESSION_SECRET),
    csrfToken,
    createdAt + SESSION_DURATION_MS,
    createdAt,
  );
  return privateResponse(
    { csrfToken },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
}

export async function logout(request, env) {
  const authorized = await requireAdmin(request, env, { csrf: true });
  if (authorized instanceof Response) return authorized;
  const token = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)tr_admin=([^;]+)/)?.[1];
  if (token) await deleteSession(env.DB, await hashToken(token, env.SESSION_SECRET));
  return privateResponse({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
}

export async function session(request, env) {
  const authorized = await requireAdmin(request, env);
  if (authorized instanceof Response) return authorized;
  return privateResponse({ authenticated: true, csrfToken: authorized.csrf_token });
}
