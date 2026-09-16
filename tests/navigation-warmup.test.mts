import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import { required } from './worker-fixtures.mts';
class DOMParser {
 parseFromString(source: string, mime: DOMParserSupportedType): Document {
  assert.equal(mime, 'text/html');
  return parseHTML(source).document;
 }
}

test('menu intent warms only public page code once, never admin content or external assets',async()=>{
 const {installNavigationWarmup}=await import('../src/scripts/navigation-warmup.ts');
 const {document,window}=parseHTML('<html><head></head><body><button class="menu-toggle-btn"></button><a href="/admin">Admin</a></body></html>');
 const requests: (RequestInfo | URL)[]=[];
 const view={location:{href:'https://example.test/'},navigator:{connection:{}},DOMParser};
 const fetchPage: typeof fetch=async url=>{requests.push(url);return new Response('<script type="module" src="/_astro/page.hash.js"></script><link rel="stylesheet" href="/_astro/page.hash.css"><script src="https://evil.test/a.js"></script><img src="/media/private">');};
 installNavigationWarmup({doc:document,view,fetchPage});
 required(document.querySelector('button')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,0));
 required(document.querySelector('button')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 required(document.querySelector('a')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(requests.length,3);
 const links=[...document.head.querySelectorAll('link')];
 assert.equal(links.length,2);
 assert.deepEqual(links.map(l=>l.getAttribute('rel')).sort(),['modulepreload','preload']);
 assert.ok(links.every(l=>l.href.startsWith('https://example.test/_astro/')));
});

test('data saver avoids speculative requests',async()=>{
 const {installNavigationWarmup}=await import('../src/scripts/navigation-warmup.ts');
 const {document,window}=parseHTML('<button class="menu-toggle-btn"></button>');
 let requests=0;
 installNavigationWarmup({doc:document,view:{location:{href:'https://example.test/'},navigator:{connection:{saveData:true}},DOMParser},fetchPage:async()=>{requests++;return new Response();}});
 required(document.querySelector('button')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(requests,0);
});

test('disposed navigation warmup ignores pending responses and releases intent listeners',async()=>{
 const {installNavigationWarmup}=await import('../src/scripts/navigation-warmup.ts');
 const {document,window}=parseHTML('<html><head></head><body><a href="/events">Events</a></body></html>');
 let resolve: ((response: Response) => void) | undefined, requests=0;
 const dispose=installNavigationWarmup({doc:document,view:{location:{href:'https://example.test/'},navigator:{},DOMParser},fetchPage:async()=>{requests++;return new Promise<Response>(done=>{resolve=done;});}});
 required(document.querySelector('a')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(typeof dispose,'function');
 dispose();
 required(resolve)(new Response('<script type="module" src="/_astro/late.hash.js"></script>'));
 await new Promise(done=>setTimeout(done,0));
 required(document.querySelector('a')).dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(requests,1);
 assert.equal(document.head.querySelectorAll('link').length,0);
});
