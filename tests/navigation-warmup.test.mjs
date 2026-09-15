import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML,DOMParser} from 'linkedom';

test('menu intent warms only public page code once, never admin content or external assets',async()=>{
 const {installNavigationWarmup}=await import('../src/scripts/navigation-warmup.ts');
 const {document,window}=parseHTML('<html><head></head><body><button class="menu-toggle-btn"></button><a href="/admin">Admin</a></body></html>');
 const requests=[];
 const view={location:{href:'https://example.test/'},navigator:{connection:{}},DOMParser};
 const fetchPage=async url=>{requests.push(url);return {ok:true,text:async()=>'<script type="module" src="/_astro/page.hash.js"></script><link rel="stylesheet" href="/_astro/page.hash.css"><script src="https://evil.test/a.js"></script><img src="/media/private">'};};
 installNavigationWarmup({doc:document,view,fetchPage});
 document.querySelector('button').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,0));
 document.querySelector('button').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 document.querySelector('a').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
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
 installNavigationWarmup({doc:document,view:{location:{href:'https://example.test/'},navigator:{connection:{saveData:true}},DOMParser},fetchPage:async()=>{requests++;}});
 document.querySelector('button').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(requests,0);
});

test('disposed navigation warmup ignores pending responses and releases intent listeners',async()=>{
 const {installNavigationWarmup}=await import('../src/scripts/navigation-warmup.ts');
 const {document,window}=parseHTML('<html><head></head><body><a href="/events">Events</a></body></html>');
 let resolve, requests=0;
 const dispose=installNavigationWarmup({doc:document,view:{location:{href:'https://example.test/'},navigator:{},DOMParser},fetchPage:async()=>{requests++;return new Promise(done=>{resolve=done;});}});
 document.querySelector('a').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(typeof dispose,'function');
 dispose();
 resolve({ok:true,text:async()=>'<script type="module" src="/_astro/late.hash.js"></script>'});
 await new Promise(done=>setTimeout(done,0));
 document.querySelector('a').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
 assert.equal(requests,1);
 assert.equal(document.head.querySelectorAll('link').length,0);
});
