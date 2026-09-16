import { deleteSession, getSession as findSession } from "./db.ts";
import { digest, equalBytes, bytesToHex, hmac } from "./crypto.ts";
import type { WorkerEnv } from './types.ts';

const COOKIE_NAME = "tr_admin";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;

function privateResponse(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionSecret(env: WorkerEnv) {
  return typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length > 0
    ? env.SESSION_SECRET
    : null;
}

export function sessionCookie(token: string, maxAge = 28800) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function verifyCredentials(env: WorkerEnv, username: unknown, password: unknown) {
  if (
    typeof username !== "string"
    || typeof password !== "string"
    || typeof env.ADMIN_USERNAME !== "string"
    || env.ADMIN_USERNAME.length === 0
    || typeof env.ADMIN_PASSWORD !== "string"
    || env.ADMIN_PASSWORD.length === 0
  ) return false;
  const [givenUser, wantedUser, givenPassword, wantedPassword] = await Promise.all([
    digest(username),
    digest(env.ADMIN_USERNAME),
    digest(password),
    digest(env.ADMIN_PASSWORD),
  ]);
  return Boolean(Number(equalBytes(givenUser, wantedUser)) & Number(equalBytes(givenPassword, wantedPassword)));
}

export async function hashToken(value: string, secret: string) {
  return bytesToHex(await hmac(value, secret));
}

export async function getSession(request: Request, env: WorkerEnv) {
  const token = readCookie(request, COOKIE_NAME);
  const secret = sessionSecret(env);
  if (!token || !secret || !env.DB) return null;
  const tokenHash = await hashToken(token, secret);
  const stored = await findSession(env.DB, tokenHash);
  if (!stored) return null;
  if (stored.expires_at <= Date.now()) {
    await deleteSession(env.DB, tokenHash);
    return null;
  }
  return stored;
}

export async function requireAdmin(request: Request, env: WorkerEnv, { csrf = false } = {}) {
  const stored = await getSession(request, env);
  if (!stored) return privateResponse({ error: "Authentication required" }, 401);
  if (!csrf) return stored;

  const supplied = request.headers.get("x-csrf-token");
  if (!supplied) return privateResponse({ error: "CSRF validation failed" }, 403);
  const [given, expected] = await Promise.all([digest(supplied), digest(stored.csrf_token)]);
  if (!equalBytes(given, expected)) return privateResponse({ error: "CSRF validation failed" }, 403);
  return stored;
}

export async function hashClientIp(request: Request, env: WorkerEnv) {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return hashToken(ip, secret);
}

export { LOGIN_WINDOW_MS, MAX_FAILED_LOGINS, SESSION_DURATION_MS };
