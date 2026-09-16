import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hashToken } from "../worker/auth.js";
import { mergeContent } from "../worker/handlers/content.js";
import { routeRequest } from "../worker/router.js";
import { SITE_CONTENT } from "../src/data/site-content.ts";
import { validateContentValue } from "../worker/validation.js";
import { THEME_KEY, DEFAULT_PALETTE } from '../src/data/theme.ts';

test('palette content writes reject invalid and CSRF-less values before persistence and save one complete object', async () => {
  const env = await environmentWithSession();
  const put = (value, csrf=true) => routeRequest(new Request(`https://site.test/api/admin/content/${THEME_KEY}`, {
    method:'PUT', headers:{'content-type':'application/json',cookie:env.cookie,origin:'https://site.test',...(csrf?{'x-csrf-token':env.csrfToken}:{})}, body:JSON.stringify({value}),
  }),env,{});
  assert.equal((await put(DEFAULT_PALETTE,false)).status,403); assert.equal(env.DB.content.size,0);
  for (const invalid of [{foreground:'#123456'}, {...DEFAULT_PALETTE,accent:'url(https://evil.test)'}, {...DEFAULT_PALETTE, extra:'#000000'}]) {
    assert.equal((await put(invalid)).status,400); assert.equal(env.DB.content.size,0);
  }
  const next = {...DEFAULT_PALETTE,accent:'#abcdef'};
  assert.equal((await put(next)).status,200); assert.equal(env.DB.content.size,1);
  assert.deepEqual(JSON.parse(env.DB.content.get(THEME_KEY)),next);
  const reload=await routeRequest(new Request('https://site.test/api/content'),env,{});
  assert.deepEqual((await reload.json())[THEME_KEY],next);
});

test("stored overrides replace only matching default keys", () => {
  const defaults = {
    "home.hero.title": "Nessuna spiegazione",
    "home.hero.subtitle": "Nessun rimpianto.",
  };
  const result = mergeContent(defaults, [{ key: "home.hero.title", value_json: '"Altro titolo"' }]);
  assert.deepEqual(result, {
    "home.hero.title": "Altro titolo",
    "home.hero.subtitle": "Nessun rimpianto.",
  });
});

test("malformed, unknown, and wrong-type stored overrides leave the fallback intact", () => {
  const defaults = { "home.hero.title": "Nessuna spiegazione" };
  const result = mergeContent(defaults, [
    { key: "missing.key", value_json: '"Non visibile"' },
    { key: "home.hero.title", value_json: "{" },
    { key: "home.hero.title", value_json: "[\"Non una stringa\"]" },
  ]);
  assert.deepEqual(result, defaults);
});

test("array overrides match list element schemas and nested tuple arity", () => {
  assert.equal(validateContentValue("home.about.paragraphs", ["Uno", "Due", "Tre"]), true);
  assert.equal(validateContentValue("home.how_it_works.items", [
    ["06", "Un nuovo punto", "Nuovo"],
    ["07", "Un altro punto", "Altro"],
  ]), true);
  assert.equal(validateContentValue("contact.info.rows", [["Etichetta", "Valore"]]), true);
  assert.equal(validateContentValue("home.how_it_works.items", [["06", "Manca etichetta"]]), false);
  assert.equal(validateContentValue("contact.info.rows", [["Etichetta", "Valore", "In più"]]), false);
  assert.equal(validateContentValue("home.how_it_works.items", [[["06"], "Testo", "Etichetta"]]), false);
  assert.equal(validateContentValue("home.about.paragraphs", [["Nidificato"]]), false);

  const defaults = { "contact.info.rows": [["Etichetta iniziale", "Valore iniziale"]] };
  assert.deepEqual(mergeContent(defaults, [
    { key: "contact.info.rows", value_json: '[["Etichetta modificata"]]' },
  ]), defaults);
});

test("client-generated menu and client-list copy use editable content schemas", () => {
  const menu = readFileSync("src/scripts/menu.js", "utf8");
  const clients = readFileSync("src/scripts/clients.js", "utf8");
  const logo = readFileSync("src/components/SiteLogo.astro", "utf8");

  assert.deepEqual(SITE_CONTENT["global.menu.items"], [
    ["Archivio", "/work"],
    ["Eventi", "/events"],
    ["Contatti", "/contact"],
    ["Manifesto", "/"],
  ]);
  assert.equal(SITE_CONTENT["home.clients.rows"].length, 18);
  assert.equal(validateContentValue("global.menu.items", [["Nuova voce", "/nuovo"]]), true);
  assert.equal(validateContentValue("global.menu.items", [
    ["Uno", "/uno"],
    ["Due", "/due"],
    ["Tre", "/tre"],
    ["Quattro", "/quattro"],
    ["Cinque", "/cinque"],
  ]), true);
  assert.equal(validateContentValue("global.menu.items", [["Nuova voce"]]), false);
  assert.equal(validateContentValue("global.menu.items", [["Nuova voce", "javascript:alert(1)"]]), false);
  assert.match(menu, /SITE_CONTENT\["global\.menu\.items"\]/);
  assert.match(menu, /MENU_ICONS\[index % MENU_ICONS\.length\]/);
  assert.match(clients, /SITE_CONTENT\["home\.clients\.rows"\]/);
  assert.doesNotMatch(menu, /label: "Archivio"/);
  assert.doesNotMatch(clients, /name: "Parole Rotte"/);
  assert.match(logo, /SITE_CONTENT\["site\.name"\]/);
});

function createDb() {
  const content = new Map();
  const sessions = new Map();
  return {
    content,
    sessions,
    prepare(sql) {
      return {
        async all() {
          if (sql.includes("FROM content_entries")) {
            return [...content.entries()].map(([key, value_json]) => ({ key, value_json }));
          }
          return [];
        },
        bind: (...args) => ({
          async first() {
            if (sql.includes("FROM sessions")) return sessions.get(args[0]) ?? null;
            return null;
          },
          async run() {
            if (sql.includes("INSERT INTO content_entries")) content.set(args[0], args[1]);
            if (sql.includes("DELETE FROM content_entries")) content.delete(args[0]);
            if (sql.includes("DELETE FROM sessions")) sessions.delete(args[0]);
            return { success: true };
          },
        }),
      };
    },
  };
}

async function environmentWithSession() {
  const DB = createDb();
  const SESSION_SECRET = globalThis.crypto.randomUUID();
  const csrfToken = globalThis.crypto.randomUUID();
  const token = globalThis.crypto.randomUUID();
  DB.sessions.set(await hashToken(token, SESSION_SECRET), {
    token_hash: await hashToken(token, SESSION_SECRET),
    csrf_token: csrfToken,
    expires_at: Date.now() + 60_000,
  });
  return { DB, SESSION_SECRET, csrfToken, cookie: `tr_admin=${token}` };
}

test("public content reads merge published overrides with fallbacks", async () => {
  const env = await environmentWithSession();
  env.DB.content.set("home.hero.title", '"Titolo pubblicato"');
  const response = await routeRequest(new Request("https://site.test/api/content"), env, {});

  assert.equal(response.status, 200);
  const content = await response.json();
  assert.equal(content["home.hero.title"], "Titolo pubblicato");
  assert.equal(content["home.hero.subtitle"], "Nessun rimpianto.");
});

test("content writes require a valid session and CSRF token", async () => {
  const env = await environmentWithSession();
  const body = JSON.stringify({ value: "Titolo pubblicato" });
  const unauthenticated = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  }), env, {});
  assert.equal(unauthenticated.status, 401);

  const noCsrf = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PUT",
    headers: { cookie: env.cookie, "content-type": "application/json" },
    body,
  }), env, {});
  assert.equal(noCsrf.status, 403);
});

test("valid writes merge into public content and delete restores the fallback", async () => {
  const env = await environmentWithSession();
  const headers = {
    cookie: env.cookie,
    "content-type": "application/json",
    "x-csrf-token": env.csrfToken,
  };
  const write = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PUT",
    headers,
    body: JSON.stringify({ value: "Titolo pubblicato" }),
  }), env, {});
  assert.equal(write.status, 200);
  assert.deepEqual(await write.json(), { key: "home.hero.title", value: "Titolo pubblicato" });

  const published = await routeRequest(new Request("https://site.test/api/content"), env, {});
  assert.equal((await published.json())["home.hero.title"], "Titolo pubblicato");

  const remove = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "DELETE",
    headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken },
  }), env, {});
  assert.equal(remove.status, 200);
  assert.deepEqual(await remove.json(), { key: "home.hero.title", value: "Nessuna spiegazione" });
});

test("content writes reject unknown keys, invalid types, oversize strings, and unsafe links", async () => {
  const env = await environmentWithSession();
  const headers = {
    cookie: env.cookie,
    "content-type": "application/json",
    "x-csrf-token": env.csrfToken,
  };
  const invalidWrites = [
    ["missing.key", "No"],
    ["home.hero.title", ["Non una stringa"]],
    ["home.hero.title", "x".repeat(20_001)],
    ["global.footer.instagram_href", "javascript:alert(1)"],
  ];
  for (const [key, value] of invalidWrites) {
    const response = await routeRequest(new Request(`https://site.test/api/admin/content/${key}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value }),
    }), env, {});
    assert.equal(response.status, 400, key);
  }
});

test("content writes allow same-origin, HTTPS, and mailto links", async () => {
  const env = await environmentWithSession();
  const headers = {
    cookie: env.cookie,
    "content-type": "application/json",
    "x-csrf-token": env.csrfToken,
  };
  for (const value of ["/nuovo-percorso", "https://example.test/nuovo", "mailto:ciao@example.test"]) {
    const response = await routeRequest(new Request("https://site.test/api/admin/content/global.footer.instagram_href", {
      method: "PUT",
      headers,
      body: JSON.stringify({ value }),
    }), env, {});
    assert.equal(response.status, 200, value);
  }
});

test("content routes reject malformed and declared-oversize bodies without caching", async () => {
  const env = await environmentWithSession();
  const headers = {
    cookie: env.cookie,
    "content-type": "application/json",
    "x-csrf-token": env.csrfToken,
  };
  const malformed = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PUT",
    headers,
    body: "{",
  }), env, {});
  assert.equal(malformed.status, 400);
  assert.equal(malformed.headers.get("cache-control"), "no-store");

  const declaredOversize = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PUT",
    headers: { ...headers, "content-length": "1000001" },
    body: JSON.stringify({ value: "Valore breve" }),
  }), env, {});
  assert.equal(declaredOversize.status, 400);

  const publicMethod = await routeRequest(new Request("https://site.test/api/content", { method: "PUT" }), env, {});
  assert.equal(publicMethod.status, 405);
  assert.equal(publicMethod.headers.get("allow"), "GET");
  assert.equal(publicMethod.headers.get("cache-control"), "no-store");

  const adminMethod = await routeRequest(new Request("https://site.test/api/admin/content/home.hero.title", {
    method: "PATCH",
    headers: { cookie: env.cookie },
  }), env, {});
  assert.equal(adminMethod.status, 405);
  assert.equal(adminMethod.headers.get("allow"), "PUT, DELETE");
  assert.equal(adminMethod.headers.get("cache-control"), "no-store");
});
