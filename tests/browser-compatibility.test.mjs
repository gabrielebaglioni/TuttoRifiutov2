import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {parseHTML} from 'linkedom';
import * as policy from '../src/scripts/motion-policy.js';
import * as Three from 'three';
import {themeEditor} from '../src/scripts/admin-theme.js';
import {DEFAULT_PALETTE} from '../src/data/theme.js';
import {waitForInitialResources} from '../src/scripts/loading-readiness.js';

function script(file) {
  const source=readFileSync(new URL(`../src/scripts/${file}`,import.meta.url),'utf8');
  return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>source.slice(n.type==='ExportNamedDeclaration'?n.declaration.start:n.start,n.end)).join('\n');
}
function functions(file,names) {
 const source=readFileSync(new URL(`../src/scripts/${file}`,import.meta.url),'utf8');
 return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
}
function harness(html='') {
  const {document,window}=parseHTML(`<html><body>${html}</body></html>`);
  const view={innerWidth:390,innerHeight:844,devicePixelRatio:1,location:{pathname:'/',href:'/'},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window),matchMedia:()=>({matches:false})};
  const set=(nodes,options)=>{for(const node of typeof nodes==='string'?document.querySelectorAll(nodes):nodes?.nodeType?[nodes]:nodes||[]) for(const [key,value] of Object.entries(options)) if(key==='opacity'||key==='display') node.style[key]=String(value);};
  const gsap={registerPlugin(){},set,to(nodes,options){set(nodes,options);options.onStart?.();options.onUpdate?.();options.onComplete?.();return {kill(){}};},getProperty(){return 1;}};
  return {document,window:view,Event:window.Event,gsap,setTimeout:fn=>{fn();return 1;},clearTimeout(){},requestAnimationFrame(){return 1;},cancelAnimationFrame(){},...policy,usesTouchLayout:()=>policy.usesTouchLayout(view),prefersReducedMotion:()=>false};
}
const preloader='<div class="preloader"><div class="progress-bar"><div class="progress-bar-indicator"></div><div class="progress-bar-copy"><span></span></div></div><div class="preloader-block"></div></div>';
for(const denied of ['read','write']) test(`preloader resolves and uncovers content with storage ${denied} denied`,async()=>{
 const c=harness(preloader+'<h1>Content</h1>');
 c.waitForInitialResources=waitForInitialResources;
 c.contentReady=Promise.resolve();
 c.ensureCollectionsReadiness=()=>({promise:Promise.resolve()});
 c.sessionStorage={getItem(){if(denied==='read')throw new Error('SecurityError');return null;},setItem(){throw new Error('QuotaExceededError');}};
 vm.runInNewContext(script('preloader.js')+';globalThis.ready=preloaderReady;',c);
 assert.doesNotThrow(()=>c.document.dispatchEvent(new c.Event('DOMContentLoaded')));
 await c.ready;
 assert.equal(c.document.querySelector('.preloader').style.display,'none');
 assert.equal(c.document.querySelector('h1').textContent,'Content');
});
test('denied storage still follows internal navigation and bfcache restores clickable content',async()=>{
 const c=harness('<div class="transition-grid"><div class="transition-block"></div></div><a href="/events">Eventi</a>');
 c.sessionStorage={getItem(){throw new Error('SecurityError');},setItem(){throw new Error('SecurityError');}};
 c.ScrollTrigger={sort(){},refresh(){}};c.playMenuSound=()=>{};
 vm.runInNewContext(script('transition.js'),c);
 assert.doesNotThrow(()=>c.document.dispatchEvent(new c.Event('DOMContentLoaded')));
 const click=()=>c.document.querySelector('a').dispatchEvent(new c.Event('click',{bubbles:true,cancelable:true}));
 assert.doesNotThrow(click);await Promise.resolve();
 assert.equal(c.window.location.href,'/events');
 const show=new c.Event('pageshow');show.persisted=true;c.document.defaultView.dispatchEvent(show);
 assert.equal(c.document.querySelector('.transition-block').style.opacity,'0');
 assert.equal(c.document.querySelector('.transition-grid').style.pointerEvents,'none');
 c.window.location.href='/';click();await Promise.resolve();assert.equal(c.window.location.href,'/events');
});
test('missing WebGL2 leaves themed skyline fallback and does not abort home modules',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas><h1>Tutto Rifiuto</h1></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={WebGLRenderer:class{constructor(){throw new Error('WebGL2 unavailable');}}};
 assert.doesNotThrow(()=>vm.runInNewContext(script('skyline.js'),c));
 assert.ok(c.document.querySelector('.lab-hero').classList.contains('has-grain-fallback'));
 assert.equal(c.document.querySelector('h1').textContent,'Tutto Rifiuto');
});
test('missing WebGL wordmark remains visible as the original branded asset',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 c.document.querySelector('canvas').getContext=()=>null;
 vm.runInNewContext(script('particle-visual.js'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 const fallback=c.document.querySelector('.particle-fallback');
 assert.ok(fallback,'branding must survive a denied context');
 assert.equal(fallback.getAttribute('src'),'/lab/hero-visual3.webp');
 assert.equal(fallback.getAttribute('alt'),'Tutto Rifiuto');
});
test('reduced motion leaves copy visible without waiting for fonts or preloader',()=>{
 const c=harness('<h1 data-animate-variant="diffuse">Leggibile</h1>');
 c.prefersReducedMotion=()=>true;c.SplitText={};c.ScrollTrigger={};
 c.document.fonts={ready:new Promise(()=>{})};c.contentReady=new Promise(()=>{});c.preloaderReady=new Promise(()=>{});
 c.ensureCollectionsReadiness=()=>({promise:new Promise(()=>{})});
 vm.runInNewContext(script('animated-copy.js'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.notEqual(c.document.querySelector('h1').style.opacity,'0');
});

function menuHarness(reduced=false) {
 const c=harness('<main><a href="/events">Content</a></main><button class="menu-toggle-btn"></button><div class="menu-overlay"><canvas id="menu-canvas"></canvas><div class="menu-overlay-nav"><button class="close-btn"></button><div class="menu-overlay-items"><a href="https://example.org">Instagram</a></div></div><div class="menu-overlay-footer"><a href="/contact">Contatti</a></div><div class="circular-menu"><div class="joystick"></div></div></div>');
 for(const node of c.document.querySelectorAll('button,a'))node.focus=()=>{c.document.activeElement=node;};
 c.document.activeElement=c.document.querySelector('.menu-toggle-btn');
 Object.assign(c,{prefersReducedMotion:()=>reduced,THREE:{Scene:class{},WebGLRenderer:class{constructor(){throw new Error('No GPU');}}},SplitText:{create(){}},SITE_CONTENT:{'global.menu.items':[['Home','/'],['Eventi','/events']]},getIconSvg:()=>'<svg></svg>',isAllowedLink:()=>true,playMenuSound(){},resizeMenuRingGrain(){},initMenuRingGrain(){}});
 vm.runInNewContext(script('menu.js'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 return c;
}
test('menu closes keyboard access, traps focus while open and restores it with Escape',()=>{
 const c=menuHarness();const overlay=c.document.querySelector('.menu-overlay');const toggle=c.document.querySelector('.menu-toggle-btn');
 assert.equal(overlay.inert,true);
 toggle.click();
 assert.equal(overlay.inert,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 assert.equal(c.document.activeElement,c.document.querySelector('.close-btn'));
 assert.equal(c.document.querySelector('main').inert,true);
 const last=[...overlay.querySelectorAll('a')].at(-1);last.focus=()=>{c.document.activeElement=last;};last.focus();
 const tab=new c.Event('keydown',{bubbles:true,cancelable:true});tab.key='Tab';c.document.dispatchEvent(tab);
 assert.equal(c.document.activeElement,c.document.querySelector('.close-btn'));
 const escape=new c.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';c.document.dispatchEvent(escape);
 assert.equal(overlay.inert,true);assert.equal(c.document.querySelector('main').inert,false);
 assert.equal(c.document.activeElement,toggle);assert.equal(toggle.getAttribute('aria-expanded'),'false');
});
test('reduced motion menu exposes all links immediately and retains TR fallback without GPU',()=>{
 const c=menuHarness(true);c.document.querySelector('.menu-toggle-btn').click();
 assert.equal(c.document.querySelector('.menu-overlay').style.opacity,'1');
 assert.equal(c.document.querySelector('.menu-overlay-nav').style.opacity,'1');
 for(const node of c.document.querySelectorAll('.menu-segment'))assert.equal(node.style.opacity,'1');
 assert.ok(c.document.querySelector('.menu-overlay').classList.contains('has-atmosphere-fallback'));
});
test('menu markup provides native keyboard buttons and initially hides dialog links',()=>{
 const markup=readFileSync(new URL('../src/components/MenuOverlay.astro',import.meta.url),'utf8').split('---').slice(2).join('---');
 const {document}=parseHTML(markup);
 assert.equal(document.querySelector('.menu-toggle-btn').tagName,'BUTTON');
 assert.equal(document.querySelector('.close-btn').tagName,'BUTTON');
 assert.ok(document.querySelector('.menu-toggle-btn').getAttribute('aria-label'));
 assert.equal(document.querySelector('.menu-overlay').getAttribute('aria-hidden'),'true');
 assert.ok(document.querySelector('.menu-overlay').hasAttribute('inert'));
});
test('lost skyline context reveals branded grain and stops scheduling GPU work',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section>');
 let scheduled=0;c.requestAnimationFrame=()=>++scheduled;
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{debug={};setSize(){}setPixelRatio(){}render(){}dispose(){}}};
 c.bindThemeUniforms=()=>()=>{};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 vm.runInNewContext(script('skyline.js'),c);
 c.document.querySelector('canvas').dispatchEvent(new c.Event('webglcontextlost'));
 assert.ok(c.document.querySelector('.lab-hero').classList.contains('has-grain-fallback'));
 assert.equal(c.document.querySelector('canvas').style.display,'none');assert.equal(scheduled,1);
});
test('back-forward cache keeps skyline resources alive and the next frame can render',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section>');
 let nextFrame,draws=0,disposed=false;c.requestAnimationFrame=fn=>{nextFrame=fn;return 1;};
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{debug={};setSize(){}setPixelRatio(){}render(){draws++;}dispose(){disposed=true;}}};
 c.bindThemeUniforms=()=>()=>{};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 vm.runInNewContext(script('skyline.js'),c);
 c.document.defaultView.dispatchEvent(new c.Event('beforeunload'));
 const hide=new c.Event('pagehide');hide.persisted=true;c.document.defaultView.dispatchEvent(hide);
 assert.equal(disposed,false);
 nextFrame(300);assert.equal(draws,1);
});
test('lost particle context restores the wordmark after successful WebGL startup',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 c.document.querySelector('canvas').getContext=()=>new Proxy({}, {get:()=>()=>true});
 c.publicTheme=()=>({subscribe:()=>()=>{}});c.Image=class{};
 vm.runInNewContext(script('particle-visual.js'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelector('.particle-fallback'),null);
 c.document.querySelector('canvas').dispatchEvent(new c.Event('webglcontextlost'));
 assert.equal(c.document.querySelector('.particle-fallback').getAttribute('src'),'/lab/hero-visual3.webp');
});
test('failed particle shader compilation restores the wordmark before starting animation',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 c.document.querySelector('canvas').getContext=()=>new Proxy({}, {get:(_target,key)=>key==='getShaderParameter'?()=>false:()=>true});
 c.publicTheme=()=>({subscribe:()=>()=>{}});c.Image=class{};
 vm.runInNewContext(script('particle-visual.js'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelector('.particle-fallback')?.getAttribute('src'),'/lab/hero-visual3.webp');
});
test('reduced motion keeps native scrolling, a static hero and readable client rows',()=>{
 const c=harness('<section class="lab-hero"></section><div class="client-row"><p>A</p><p>B</p></div>');
 c.prefersReducedMotion=()=>true;c.appleHeroScrollMode=()=> 'standard';c.lenis=null;
 c.Lenis=class{constructor(){assert.fail('smooth scroll should not start');}};
 vm.runInNewContext(functions('lenis-scroll.js',['initLenisScroll'])+';initLenisScroll();',c);
 c.ScrollTrigger={};c.gsap.fromTo=()=>assert.fail('hero should not animate');c.gsap.to=()=>assert.fail('hero should not animate');
 vm.runInNewContext(script('lab.js'),c);
 c.clientTriggers=[];
 vm.runInNewContext(functions('clients.js',['initClientsAnimation'])+';initClientsAnimation();',c);
 for(const p of c.document.querySelectorAll('p'))assert.equal(p.style.opacity,'1');
});
test('reduced motion pie keeps its heading visible without a pinned animation',()=>{
 const c=harness('<section class="pie-transition"><h3>Il collettivo</h3></section>');
 c.prefersReducedMotion=()=>true;c.STATE={};c.mobile=false;c.buildSvg=()=>assert.fail('no animated layers');
 vm.runInNewContext(functions('pie-transition.js',['init'])+';init();',c);
 assert.equal(c.document.querySelector('h3').textContent,'Il collettivo');
 assert.ok(c.document.querySelector('.pie-transition').classList.contains('is-static-pie'));
});
test('theme contrast warns for actual menu label colors as well as pie text',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const editor=themeEditor(document,{...DEFAULT_PALETTE,accent:'#ffff00'},()=>{});
 const warning=editor.querySelector('[role="status"]').textContent;
 assert.match(warning,/Link menu \/ accento: 1\.00:1 — contrasto insufficiente/);
 assert.match(warning,/Testo sagoma \/ accento: 19\.56:1/);
 assert.match(warning,/Link menu \/ inchiostro: 19\.56:1/);
});
test('reduced motion contact keeps one finite set of readable rows without waiting for Lenis',()=>{
 const c=harness('<div class="contact-visual"><div class="contact-visual-icon"><img></div></div><section class="contact-info"><div class="contact-info-row"><p>Scrivici</p><p>info@example.org</p></div></section>');
 c.prefersReducedMotion=()=>true;c.ScrollTrigger={};const intervals=[];c.setInterval=(_fn,time)=>intervals.push(time);
 vm.runInNewContext(script('contact.js'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelectorAll('.contact-info').length,1);
 assert.deepEqual(intervals,[1000]);
});
test('reduced motion footer and gallery retain native content without distortion or parallax',()=>{
 const c=harness('<footer><div class="footer-container">Links</div></footer>');
 c.prefersReducedMotion=()=>true;c.ScrollTrigger={create:()=>assert.fail('parallax should not start')};
 vm.runInNewContext(functions('footer.js',['initFooterParallax'])+';initFooterParallax();',c);
 c.window.requestAnimationFrame=()=>{};
 vm.runInNewContext(functions('project.js',['canStartProjectEffect'])+';globalThis.canStart=canStartProjectEffect(window,document);',c);
 assert.equal(c.canStart,false);
});
test('denied ring renderer retains the themed ring behind working menu links',()=>{
 const c=harness('<div class="circular-menu"><a href="/events">Eventi</a></div>');
 c.navigator={userAgent:'Desktop'};c.THREE={WebGLRenderer:class{constructor(){throw new Error('No GPU');}}};
 c.createGrainFragmentShader=()=>'';
 vm.runInNewContext(script('menu-ring-grain.js'),c);
 assert.doesNotThrow(()=>vm.runInNewContext('initMenuRingGrain(document.querySelector(".circular-menu"),700);',c));
 assert.ok(c.document.querySelector('.circular-menu').classList.contains('has-ring-fallback'));
 assert.equal(c.document.querySelector('a').textContent,'Eventi');
});

for (const surface of ['skyline','ring','atmosphere']) for (const immediateTheme of [false,true]) test(`failed Three shader preserves ${surface} fallback and stops drawing (initial theme: ${immediateTheme})`,()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section><div class="menu-overlay"><canvas id="menu-canvas"></canvas><div class="circular-menu"><a href="/events">Eventi</a></div></div>');
 let nextFrame,draws=0,cancelled=0;
 c.requestAnimationFrame=fn=>{nextFrame=fn;return 1;};c.cancelAnimationFrame=()=>cancelled++;
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{
   debug={}; setSize(){} setPixelRatio(){} setClearColor(){} dispose(){}
   render(){draws++;this.debug.onShaderError?.();}
 }};
 c.bindThemeUniforms=(_uniforms,_mapping,draw)=>{if(immediateTheme)draw?.();return ()=>{};};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 c.createGrainFragmentShader=()=>'';c.navigator={userAgent:'Desktop'};
 if(surface==='skyline') vm.runInNewContext(script('skyline.js'),c);
 if(surface==='ring') vm.runInNewContext(script('menu-ring-grain.js')+';initMenuRingGrain(document.querySelector(".circular-menu"),700);',c);
 if(surface==='atmosphere') {
   Object.assign(c,{atmosphereFailed:false,atmosphereAttempted:false,atmosphereRenderer:null,atmosphereScene:null,atmosphereCamera:null,atmosphereMaterial:null,atmosphereMesh:null,atmosphereFrame:null,lastAtmosphereFrame:null,isOpen:true,isMenuAnimating:false,matrixShader:{vertexShader:'',fragmentShader:''}});
   vm.runInNewContext(functions('menu.js',['ensureAtmosphere','showAtmosphereFallback','initAtmosphere','resizeAtmosphere','animateAtmosphere'])+';ensureAtmosphere();',c);
 } else if(nextFrame) nextFrame(300);
 const selector=surface==='skyline'?'.lab-hero':surface==='ring'?'.circular-menu':'.menu-overlay';
 const fallbackClass=surface==='skyline'?'has-grain-fallback':surface==='ring'?'has-ring-fallback':'has-atmosphere-fallback';
 assert.ok(c.document.querySelector(selector).classList.contains(fallbackClass),'shader diagnostics must select the visible CSS fallback');
 assert.ok(cancelled>0,'pending GPU frame must be cancelled');
 if(nextFrame)nextFrame(600);assert.equal(draws,1,'no repeated draws after shader failure');
 assert.equal(c.document.querySelector('a').textContent,'Eventi');
});
