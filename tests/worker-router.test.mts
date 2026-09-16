import assert from "node:assert/strict";
import test from "node:test";
import { jsonResponse } from "../worker/response.ts";
import { routeRequest } from "../worker/router.ts";
import {DEFAULT_PALETTE} from '../src/data/theme.ts';
import { d1Double, required } from './worker-fixtures.mts';

test('static detail theme refresh strips old representation validators for both collection families', async () => {
  for(const path of ['/eventi/musica','/archivio/parole']) {
    let received: Headers | undefined;
    const DB=d1Double({prepare(){return {bind(){return this;},first:async()=>null,all:async()=>({results:[{key:'global.theme.palette',value_json:JSON.stringify({...DEFAULT_PALETTE,accent:'#123456'})}]})};}});
    const response=await routeRequest(new Request(`https://site.test${path}`,{headers:{'if-none-match':'compiled',range:'bytes=0-3'}}),{DB,ASSETS:{fetch:async request=>{assert.ok(request instanceof Request);received=request.headers;return new Response('<html><head><title>Original</title></head></html>',{headers:{'content-type':'text/html',etag:'compiled'}});}}},{});
    assert.equal(required(received).has('if-none-match'),false);assert.equal(required(received).has('range'),false);
    assert.match(await response.text(),/--accent:#123456/);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test("jsonResponse returns a JSON response", async () => {
  const response = jsonResponse({ ok: true });
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true });
});

test("unknown non-API requests fall through to static assets", async () => {
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } };
  const response = await routeRequest(new Request("https://site.test/work"), env, {});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset");
});

test("all successful static HTML responses receive one framing policy for GET and HEAD without changing APIs", async () => {
  const env = {
    ASSETS: {
      async fetch(request: Request | string | URL) {
        assert.ok(request instanceof Request);
        return new Response(request.method === "HEAD" ? null : "<!doctype html><main>Page</main>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src *" },
        });
      },
    },
  };
  for (const path of ["/admin", "/work"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await routeRequest(new Request(`https://site.test${path}`, { method }), env, {});
      assert.equal(response.status, 200);
      const csp = required(response.headers.get("content-security-policy"));
      assert.match(csp, /(?:^|;)\s*frame-ancestors 'none'(?:;|$)/);
      assert.equal((csp.match(/frame-ancestors/g) ?? []).length, 1);
      assert.doesNotMatch(csp, /default-src \*/);
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      if (method === "HEAD") assert.equal(await response.text(), "");
    }
  }
  const api = await routeRequest(new Request("https://site.test/api/health"), env, {});
  assert.equal(api.headers.get("content-security-policy"), null);
  assert.equal(api.headers.get("x-frame-options"), null);
});
