import assert from "node:assert/strict";
import test from "node:test";
import {
  getSession,
  hashToken,
  requireAdmin,
  verifyCredentials,
} from "../worker/auth.js";
import { login, logout, session } from "../worker/handlers/auth.js";
import { routeRequest } from "../worker/router.js";

function createDb() {
  const sessions = new Map();
  const attempts = [];
  let nextAttemptId = 1;

  return {
    sessions,
    attempts,
    prepare(sql) {
      return {
        bind: (...args) => ({
          async run() {
            if (sql.includes("INSERT INTO sessions")) {
              sessions.set(args[0], {
                token_hash: args[0],
                csrf_token: args[1],
                expires_at: args[2],
                created_at: args[3],
              });
            } else if (sql.includes("DELETE FROM sessions")) {
              sessions.delete(args[0]);
            } else if (sql.includes("DELETE FROM login_attempts WHERE attempted_at <")) {
              const kept = attempts.filter((attempt) => attempt.attempted_at >= args[0]);
              attempts.splice(0, attempts.length, ...kept);
            } else if (sql.includes("DELETE FROM login_attempts WHERE id =")) {
              const index = attempts.findIndex((attempt) => attempt.id === args[0]);
              if (index !== -1) attempts.splice(index, 1);
            } else if (sql.includes("INSERT INTO login_attempts")) {
              attempts.push({ id: nextAttemptId++, ip_hash: args[0], attempted_at: args[1] });
            }
            return { success: true };
          },
          async first() {
            if (sql.includes("FROM sessions")) return sessions.get(args[0]) ?? null;
            if (sql.includes("INSERT INTO login_attempts")) {
              const [ipHash, attemptedAt, countedIpHash, since, limit] = args;
              const count = attempts.filter((attempt) => attempt.ip_hash === countedIpHash && attempt.attempted_at >= since).length;
              if (count >= limit) return null;
              const attempt = { id: nextAttemptId++, ip_hash: ipHash, attempted_at: attemptedAt };
              attempts.push(attempt);
              return { id: attempt.id };
            }
            if (sql.includes("COUNT(*) AS count")) {
              return { count: attempts.filter((attempt) => attempt.ip_hash === args[0] && attempt.attempted_at >= args[1]).length };
            }
            return null;
          },
        }),
      };
    },
  };
}

function environment() {
  return {
    ADMIN_USERNAME: "Frank",
    ADMIN_PASSWORD: globalThis.crypto.randomUUID(),
    SESSION_SECRET: globalThis.crypto.randomUUID(),
    DB: createDb(),
  };
}

function loginRequest(username, password, ip = "203.0.113.10") {
  return new Request("https://site.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ username, password }),
  });
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("only the configured credentials authenticate", async () => {
  const env = environment();
  assert.equal(await verifyCredentials(env, "Frank", env.ADMIN_PASSWORD), true);
  assert.equal(await verifyCredentials(env, "frank", env.ADMIN_PASSWORD), false);
  assert.equal(await verifyCredentials(env, "Frank", "wrong"), false);
});

test("login creates a hashed eight-hour server session and strict cookie", async () => {
  const env = environment();
  const response = await login(loginRequest("Frank", env.ADMIN_PASSWORD), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.csrfToken, "string");
  assert.equal(body.csrfToken.length, 64);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^tr_admin=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);
  const token = cookieFrom(response).slice("tr_admin=".length);
  assert.equal(env.DB.sessions.has(token), false);
  assert.equal(env.DB.sessions.size, 1);
  const stored = [...env.DB.sessions.values()][0];
  assert.equal(stored.expires_at - stored.created_at, 8 * 60 * 60 * 1000);
});

test("failed and throttled logins return the same generic response", async () => {
  const env = environment();
  let firstFailure;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await login(loginRequest("Frank", "wrong"), env);
    assert.equal(response.status, 401);
    const body = await response.json();
    firstFailure ??= body;
    assert.deepEqual(body, firstFailure);
  }
  assert.equal(env.DB.attempts.length, 5);
  assert.equal(env.DB.attempts[0].ip_hash.includes("203.0.113.10"), false);
});

test("expired sessions are rejected and removed", async () => {
  const env = environment();
  const token = "a".repeat(64);
  const tokenHash = await hashToken(token, env.SESSION_SECRET);
  env.DB.sessions.set(tokenHash, {
    token_hash: tokenHash,
    csrf_token: "b".repeat(64),
    expires_at: Date.now() - 1,
    created_at: Date.now() - 8 * 60 * 60 * 1000,
  });

  assert.equal(await getSession(new Request("https://site.test", { headers: { cookie: `tr_admin=${token}` } }), env), null);
  assert.equal(env.DB.sessions.size, 0);
});

test("session access and writing CSRF checks are enforced", async () => {
  const env = environment();
  const loginResponse = await login(loginRequest("Frank", env.ADMIN_PASSWORD), env);
  const cookie = cookieFrom(loginResponse);
  const { csrfToken } = await loginResponse.json();

  const sessionResponse = await session(new Request("https://site.test/api/admin/session", { headers: { cookie } }), env);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), { authenticated: true, csrfToken });

  const missingCsrf = await requireAdmin(new Request("https://site.test/api/admin/content/a", {
    method: "PUT",
    headers: { cookie },
  }), env, { csrf: true });
  assert.equal(missingCsrf.status, 403);
  assert.equal(missingCsrf.headers.get("cache-control"), "no-store");
  assert.deepEqual(await missingCsrf.json(), { error: "CSRF validation failed" });

  const authorized = await requireAdmin(new Request("https://site.test/api/admin/content/a", {
    method: "PUT",
    headers: { cookie, "x-csrf-token": csrfToken },
  }), env, { csrf: true });
  assert.equal(authorized.csrf_token, csrfToken);
});

test("logout deletes the session and clears the strict cookie", async () => {
  const env = environment();
  const loginResponse = await login(loginRequest("Frank", env.ADMIN_PASSWORD), env);
  const cookie = cookieFrom(loginResponse);
  const { csrfToken } = await loginResponse.json();
  const rejected = await logout(new Request("https://site.test/api/admin/logout", {
    method: "POST",
    headers: { cookie },
  }), env);
  assert.equal(rejected.status, 403);

  const response = await logout(new Request("https://site.test/api/admin/logout", {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrfToken },
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(env.DB.sessions.size, 0);
  assert.equal(response.headers.get("set-cookie"), "tr_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
});

test("router preserves health and assets while exposing auth routes", async () => {
  const env = environment();
  env.ASSETS = { fetch: async () => new Response("asset") };
  const health = await routeRequest(new Request("https://site.test/api/health"), env, {});
  assert.deepEqual(await health.json(), { ok: true });

  const auth = await routeRequest(loginRequest("Frank", env.ADMIN_PASSWORD), env, {});
  assert.equal(auth.status, 200);
  const asset = await routeRequest(new Request("https://site.test/work"), env, {});
  assert.equal(await asset.text(), "asset");
});

test("a correct sixth login is throttled before credentials are verified", async () => {
  const env = environment();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(loginRequest("Frank", "wrong"), env);
  }

  const response = await login(loginRequest("Frank", env.ADMIN_PASSWORD), env);
  assert.equal(response.status, 401);
  assert.equal(env.DB.sessions.size, 0);
  assert.equal(env.DB.attempts.length, 5);
});

test("parallel failed logins consume at most five throttle slots", async () => {
  const env = environment();
  const responses = await Promise.all(Array.from({ length: 6 }, () => login(loginRequest("Frank", "wrong"), env)));

  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401, 401]);
  assert.equal(env.DB.attempts.length, 5);
});

test("login removes expired throttle rows before reserving a slot", async () => {
  const env = environment();
  env.DB.attempts.push({ id: 0, ip_hash: "expired", attempted_at: Date.now() - (16 * 60 * 1000) });

  const response = await login(loginRequest("Frank", "wrong"), env);
  assert.equal(response.status, 401);
  assert.equal(env.DB.attempts.some((attempt) => attempt.id === 0), false);
});

test("empty runtime credentials and oversized credentials fail closed before hashing", async () => {
  const missingCredentials = environment();
  missingCredentials.ADMIN_USERNAME = "";
  missingCredentials.ADMIN_PASSWORD = "";
  const missingResponse = await login(loginRequest("", ""), missingCredentials);
  assert.equal(missingResponse.status, 401);
  assert.equal(missingCredentials.DB.sessions.size, 0);

  const oversized = environment();
  const oversizedResponse = await login(loginRequest("x".repeat(257), "wrong"), oversized);
  assert.equal(oversizedResponse.status, 401);
  assert.equal(oversized.DB.attempts.length, 0);

  const oversizedBody = environment();
  const bodyResponse = await login(new Request("https://site.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: "x".repeat(1025),
  }), oversizedBody);
  assert.equal(bodyResponse.status, 401);
  assert.equal(oversizedBody.DB.attempts.length, 0);
});

test("auth responses do not cache and reject unsupported methods", async () => {
  const env = environment();
  env.ASSETS = { fetch: async () => new Response("asset") };
  const loginResponse = await login(loginRequest("Frank", env.ADMIN_PASSWORD), env);
  const cookie = cookieFrom(loginResponse);
  const sessionResponse = await routeRequest(new Request("https://site.test/api/admin/session", { headers: { cookie } }), env, {});
  assert.equal(loginResponse.headers.get("cache-control"), "no-store");
  assert.equal(sessionResponse.headers.get("cache-control"), "no-store");

  const methodMismatch = await routeRequest(new Request("https://site.test/api/admin/login", { method: "GET" }), env, {});
  assert.equal(methodMismatch.status, 405);
  assert.equal(methodMismatch.headers.get("allow"), "POST");
  assert.deepEqual(await methodMismatch.json(), { error: "Method not allowed" });
});
