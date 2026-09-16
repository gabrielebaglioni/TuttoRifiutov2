import type { TweenValues } from './browser-test-utils.mts';
import type { ThemeUniforms, ThemeUniformMapping } from '../src/scripts/theme.ts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {parseHTML} from 'linkedom';
import * as policy from '../src/scripts/motion-policy.ts';
import * as Three from 'three';
import {themeEditor} from '../src/scripts/admin-theme.ts';
import {DEFAULT_PALETTE} from '../src/data/theme.ts';
import {waitForInitialResources} from '../src/scripts/loading-readiness.ts';
import {readBrowserScript} from './read-browser-script.mts';

function script(file: string) {
  const source=readBrowserScript(new URL(`../src/scripts/${file}`,import.meta.url));
  return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>source.slice(n.type==='ExportNamedDeclaration' && n.declaration?n.declaration.start:n.start,n.end)).join('\n');
}
function functions(file: string,names: readonly string[]) {
 const source=readBrowserScript(new URL(`../src/scripts/${file}`,import.meta.url));
 return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='FunctionDeclaration'&&n.id && names.includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
}
function harness(html='') {
  const {document,window}=parseHTML(`<html><body>${html}</body></html>`);
  const Element = window.Element;
  const view={innerWidth:390,innerHeight:844,devicePixelRatio:1,location:{pathname:'/',href:'/'},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window),matchMedia:()=>({matches:false})};
  const set=(nodes: unknown,options: TweenValues)=>{
    const targets: unknown[] = typeof nodes==='string' ? [...document.querySelectorAll(nodes)] : Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
    for(const node of targets) if (node instanceof window.HTMLElement || node instanceof window.SVGElement) for(const [key,value] of Object.entries(options)) if(key==='opacity'||key==='display') node.style[key]=String(value);
  };
  const gsap={registerPlugin(){},set,to(nodes: unknown,options: TweenValues): unknown {set(nodes,options);options.onStart?.();options.onUpdate?.();options.onComplete?.();return {kill(){}};},fromTo(_nodes: unknown,_from: unknown,_options: TweenValues): unknown { return undefined; },getProperty(){return 1;}};
  const bindings: Record<string, unknown> = {};
  return Object.assign(bindings,{document,window:view,Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,Event:window.Event,gsap,setTimeout:(fn: () => void)=>{fn();return 1;},clearTimeout(){},requestAnimationFrame(_callback: FrameRequestCallback): number {return 1;},cancelAnimationFrame(): unknown { return undefined; },...policy,usesTouchLayout:()=>policy.usesTouchLayout(view),prefersReducedMotion:(): boolean=>false});

}
const preloader='<div class="preloader"><div class="progress-bar"><div class="progress-bar-indicator"></div><div class="progress-bar-copy"><span></span></div></div><div class="preloader-block"></div></div>';
for(const denied of ['read','write']) test(`preloader resolves and uncovers content with storage ${denied} denied`,async()=>{
 const c=harness(preloader+'<h1>Content</h1>');
 c.waitForInitialResources=waitForInitialResources;
 c.contentReady=Promise.resolve();
 c.ensureCollectionsReadiness=()=>({promise:Promise.resolve()});
 c.sessionStorage={getItem(){if(denied==='read')throw new Error('SecurityError');return null;},setItem(){throw new Error('QuotaExceededError');}};
 vm.runInNewContext(script('preloader.ts')+';globalThis.ready=preloaderReady;',c);
 assert.doesNotThrow(()=>c.document.dispatchEvent(new c.Event('DOMContentLoaded')));
 await c.ready;
 assert.equal(must(c.document.querySelector<HTMLElement>('.preloader')).style.display,'none');
 assert.equal(must(c.document.querySelector<HTMLElement>('h1')).textContent,'Content');
});
test('touch navigation paints the covered grid before starting its reveal',()=>{
 const c=harness('<div class="transition-grid"><div class="transition-block"></div></div>');
 const frames: FrameRequestCallback[]=[];let reveals=0;
 c.sessionStorage={getItem:()=> 'true',removeItem(){}};
 c.ScrollTrigger={sort(){},refresh(){}};
 c.requestAnimationFrame=fn=>frames.push(fn);
 c.gsap.to=()=>reveals++;
 vm.runInNewContext(script('transition.ts'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(must(c.document.querySelector<HTMLElement>('.transition-block')).style.opacity,'1');
 assert.equal(reveals,0);
 must(frames.shift())(0);assert.equal(reveals,0);
 must(frames.shift())(0);assert.equal(reveals,1);
});
test('denied storage still follows internal navigation and bfcache restores clickable content',async()=>{
 const c=harness('<div class="transition-grid"><div class="transition-block"></div></div><a href="/events">Eventi</a>');
 c.sessionStorage={getItem(){throw new Error('SecurityError');},setItem(){throw new Error('SecurityError');}};
 c.ScrollTrigger={sort(){},refresh(){}};c.playMenuSound=()=>{};
 vm.runInNewContext(script('transition.ts'),c);
 assert.doesNotThrow(()=>c.document.dispatchEvent(new c.Event('DOMContentLoaded')));
 const click=()=>must(c.document.querySelector<HTMLAnchorElement>('a')).dispatchEvent(new c.Event('click',{bubbles:true,cancelable:true}));
 assert.doesNotThrow(click);await Promise.resolve();
 assert.equal(c.window.location.href,'/events');
 const show=new c.Event('pageshow');Object.assign(show, { persisted: true });must(c.document.defaultView).dispatchEvent(show);
 assert.equal(must(c.document.querySelector<HTMLElement>('.transition-block')).style.opacity,'0');
 assert.equal(must(c.document.querySelector<HTMLElement>('.transition-grid')).style.pointerEvents,'none');
 c.window.location.href='/';click();await Promise.resolve();assert.equal(c.window.location.href,'/events');
});
test('missing WebGL2 leaves themed skyline fallback and does not abort home modules',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas><h1>Tutto Rifiuto</h1></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={WebGLRenderer:class{constructor(){throw new Error('WebGL2 unavailable');}}};
 assert.doesNotThrow(()=>vm.runInNewContext(script('skyline.ts'),c));
 assert.ok(must(c.document.querySelector<HTMLElement>('.lab-hero')).classList.contains('has-grain-fallback'));
 assert.equal(must(c.document.querySelector<HTMLElement>('h1')).textContent,'Tutto Rifiuto');
});
test('missing WebGL wordmark remains visible as the original branded asset',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 must(c.document.querySelector<HTMLCanvasElement>('canvas')).getContext=()=>null;
 vm.runInNewContext(script('particle-visual.ts'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 const fallback=c.document.querySelector<HTMLElement>('.particle-fallback');
 assert.ok(fallback,'branding must survive a denied context');
 assert.equal(fallback.getAttribute('src'),'/lab/hero-visual3.webp');
 assert.equal(fallback.getAttribute('alt'),'Tutto Rifiuto');
});
test('reduced motion leaves copy visible without waiting for fonts or preloader',()=>{
 const c=harness('<h1 data-animate-variant="diffuse">Leggibile</h1>');
 c.prefersReducedMotion=()=>true;c.SplitText={};c.ScrollTrigger={};
 Object.assign(c.document, { fonts: { ready: new Promise(()=>{}) } });c.contentReady=new Promise(()=>{});c.preloaderReady=new Promise(()=>{});
 c.ensureCollectionsReadiness=()=>({promise:new Promise(()=>{})});
 vm.runInNewContext(script('animated-copy.ts'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.notEqual(must(c.document.querySelector<HTMLElement>('h1')).style.opacity,'0');
});

function menuHarness(reduced=false) {
 const c=harness('<main><a href="/events">Content</a></main><button class="menu-toggle-btn"></button><div class="menu-overlay"><canvas id="menu-canvas"></canvas><div class="menu-overlay-nav"><button class="close-btn"></button><div class="menu-overlay-items"><a href="https://example.org">Instagram</a></div></div><div class="menu-overlay-footer"><a href="/contact">Contatti</a></div><div class="circular-menu"><div class="joystick"></div></div></div>');
 for(const node of c.document.querySelectorAll<HTMLElement>('button,a'))node.focus=()=>{Object.assign(c.document, { activeElement: node });};
 Object.assign(c.document, { activeElement: c.document.querySelector<HTMLElement>('.menu-toggle-btn') });
 Object.assign(c,{prefersReducedMotion:()=>reduced,THREE:{Scene:class{},WebGLRenderer:class{constructor(){throw new Error('No GPU');}}},SplitText:{create(){}},SITE_CONTENT:{'global.menu.items':[['Home','/'],['Eventi','/events']]},getIconSvg:()=>'<svg></svg>',isAllowedLink:()=>true,playMenuSound(){},resizeMenuRingGrain(){},initMenuRingGrain(){}});
 c.loadMenuLibrary=async()=>c.THREE;
 vm.runInNewContext(script('menu.ts'),c);
 c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 return c;
}
test('menu closes keyboard access, traps focus while open and restores it with Escape',()=>{
 const c=menuHarness();const overlay=c.document.querySelector<HTMLElement>('.menu-overlay');const toggle=c.document.querySelector<HTMLElement>('.menu-toggle-btn');
 assert.equal(must(overlay).inert,true);
 must(toggle).click();
 assert.equal(must(overlay).inert,false);assert.equal(must(toggle).getAttribute('aria-expanded'),'true');
 assert.equal(c.document.activeElement,c.document.querySelector<HTMLElement>('.close-btn'));
 assert.equal(must(c.document.querySelector<HTMLElement>('main')).inert,true);
 const last=[...must(overlay).querySelectorAll<HTMLAnchorElement>('a')].at(-1);must(last).focus=()=>{Object.assign(c.document, { activeElement: last });};must(last).focus();
 const tab=new c.Event('keydown',{bubbles:true,cancelable:true});Object.assign(tab, { key: 'Tab' });c.document.dispatchEvent(tab);
 assert.equal(c.document.activeElement,c.document.querySelector<HTMLElement>('.close-btn'));
 const escape=new c.Event('keydown',{bubbles:true,cancelable:true});Object.assign(escape, { key: 'Escape' });c.document.dispatchEvent(escape);
 assert.equal(must(overlay).inert,true);assert.equal(must(c.document.querySelector<HTMLElement>('main')).inert,false);
 assert.equal(c.document.activeElement,toggle);assert.equal(must(toggle).getAttribute('aria-expanded'),'false');
});
test('reduced motion menu exposes all links immediately and retains TR fallback without GPU',()=>{
 const c=menuHarness(true);must(c.document.querySelector<HTMLElement>('.menu-toggle-btn')).click();
 assert.equal(must(c.document.querySelector<HTMLElement>('.menu-overlay')).style.opacity,'1');
 assert.equal(must(c.document.querySelector<HTMLElement>('.menu-overlay-nav')).style.opacity,'1');
 for(const node of c.document.querySelectorAll<HTMLElement>('.menu-segment'))assert.equal(node.style.opacity,'1');
 assert.ok(must(c.document.querySelector<HTMLElement>('.menu-overlay')).classList.contains('has-atmosphere-fallback'));
});
test('menu markup provides native keyboard buttons and initially hides dialog links',()=>{
 const markup=readFileSync(new URL('../src/components/MenuOverlay.astro',import.meta.url),'utf8').split('---').slice(2).join('---');
 const {document}=parseHTML(markup);
 assert.equal(must(document.querySelector<HTMLElement>('.menu-toggle-btn')).tagName,'BUTTON');
 assert.equal(must(document.querySelector<HTMLElement>('.close-btn')).tagName,'BUTTON');
 assert.ok(must(document.querySelector<HTMLElement>('.menu-toggle-btn')).getAttribute('aria-label'));
 assert.equal(must(document.querySelector<HTMLElement>('.menu-overlay')).getAttribute('aria-hidden'),'true');
 assert.ok(must(document.querySelector<HTMLElement>('.menu-overlay')).hasAttribute('inert'));
});
test('lost skyline context reveals branded grain and stops scheduling GPU work',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section>');
 let scheduled=0;c.requestAnimationFrame=()=>++scheduled;
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{debug={};setSize(){}setPixelRatio(){}render(){}dispose(){}}};
 c.bindThemeUniforms=()=>()=>{};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 vm.runInNewContext(script('skyline.ts'),c);
 must(c.document.querySelector<HTMLCanvasElement>('canvas')).dispatchEvent(new c.Event('webglcontextlost'));
 assert.ok(must(c.document.querySelector<HTMLElement>('.lab-hero')).classList.contains('has-grain-fallback'));
 assert.equal(must(c.document.querySelector<HTMLCanvasElement>('canvas')).style.display,'none');assert.equal(scheduled,1);
});
test('back-forward cache keeps skyline resources alive and the next frame can render',()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section>');
 let nextFrame: FrameRequestCallback | undefined; let draws=0,disposed=false;c.requestAnimationFrame=fn=>{nextFrame=fn;return 1;};
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{debug={};setSize(){}setPixelRatio(){}render(){draws++;}dispose(){disposed=true;}}};
 c.bindThemeUniforms=()=>()=>{};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 vm.runInNewContext(script('skyline.ts'),c);
 must(c.document.defaultView).dispatchEvent(new c.Event('beforeunload'));
 const hide=new c.Event('pagehide');Object.assign(hide, { persisted: true });must(c.document.defaultView).dispatchEvent(hide);
 assert.equal(disposed,false);
 must(nextFrame)(300);assert.equal(draws,1);
});
test('lost particle context restores the wordmark after successful WebGL startup',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 Reflect.set(must(c.document.querySelector<HTMLCanvasElement>('canvas')), 'getContext', ()=>new Proxy({}, {get:()=>()=>true}));
 c.publicTheme=()=>({subscribe:()=>()=>{}});c.Image=class{};
 vm.runInNewContext(script('particle-visual.ts'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelector<HTMLElement>('.particle-fallback'),null);
 must(c.document.querySelector<HTMLCanvasElement>('canvas')).dispatchEvent(new c.Event('webglcontextlost'));
 assert.equal(must(c.document.querySelector<HTMLElement>('.particle-fallback')).getAttribute('src'),'/lab/hero-visual3.webp');
});
test('failed particle shader compilation restores the wordmark before starting animation',()=>{
 const c=harness('<section class="lab-hero"><canvas id="particle-canvas"></canvas></section>');
 c.IntersectionObserver=class{observe(){}disconnect(){}};c.innerWidth=390;c.innerHeight=844;c.devicePixelRatio=1;
 Reflect.set(must(c.document.querySelector<HTMLCanvasElement>('canvas')), 'getContext', ()=>new Proxy({}, {get:(_target,key)=>key==='getShaderParameter'?()=>false:()=>true}));
 c.publicTheme=()=>({subscribe:()=>()=>{}});c.Image=class{};
 vm.runInNewContext(script('particle-visual.ts'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelector<HTMLElement>('.particle-fallback')?.getAttribute('src'),'/lab/hero-visual3.webp');
});
test('reduced motion keeps native scrolling, a static hero and readable client rows',()=>{
 const c=harness('<section class="lab-hero"></section><div class="client-row"><p>A</p><p>B</p></div>');
 c.prefersReducedMotion=()=>true;c.appleHeroScrollMode=()=> 'standard';c.lenis=null;
 c.Lenis=class{constructor(){assert.fail('smooth scroll should not start');}};
 vm.runInNewContext(functions('lenis-scroll.ts',['initLenisScroll'])+';initLenisScroll();',c);
 c.ScrollTrigger={};c.gsap.fromTo=()=>assert.fail('hero should not animate');c.gsap.to=()=>assert.fail('hero should not animate');
 vm.runInNewContext(script('lab.ts'),c);
 c.clientTriggers=[];
 vm.runInNewContext(functions('clients.ts',['initClientsAnimation'])+';initClientsAnimation();',c);
 for(const p of c.document.querySelectorAll<HTMLElement>('p'))assert.equal(p.style.opacity,'1');
});
test('reduced motion pie keeps its heading visible without a pinned animation',()=>{
 const c=harness('<section class="pie-transition"><h3>Il collettivo</h3></section>');
 c.prefersReducedMotion=()=>true;c.STATE={};c.mobile=false;c.buildSvg=()=>assert.fail('no animated layers');
 vm.runInNewContext(functions('pie-transition.ts',['init'])+';init();',c);
 assert.equal(must(c.document.querySelector<HTMLElement>('h3')).textContent,'Il collettivo');
 assert.ok(must(c.document.querySelector<HTMLElement>('.pie-transition')).classList.contains('is-static-pie'));
});
test('theme contrast warns for actual menu label colors as well as pie text',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const editor=themeEditor(document,{...DEFAULT_PALETTE,accent:'#ffff00'},()=>{});
 const warning=must(editor.querySelector<HTMLElement>('[role="status"]')).textContent;
 assert.match(warning,/Link menu \/ accento: 1\.00:1 — contrasto insufficiente/);
 assert.match(warning,/Testo sagoma \/ accento: 19\.56:1/);
 assert.match(warning,/Link menu \/ inchiostro: 19\.56:1/);
});
test('reduced motion contact keeps one finite set of readable rows without waiting for Lenis',()=>{
 const c=harness('<div class="contact-visual"><div class="contact-visual-icon"><img></div></div><section class="contact-info"><div class="contact-info-row"><p>Scrivici</p><p>info@example.org</p></div></section>');
 c.prefersReducedMotion=()=>true;c.ScrollTrigger={};const intervals: number[]=[];c.setInterval=(_fn: () => void,time: number)=>intervals.push(time);
 vm.runInNewContext(script('contact.ts'),c);c.document.dispatchEvent(new c.Event('DOMContentLoaded'));
 assert.equal(c.document.querySelectorAll<HTMLElement>('.contact-info').length,1);
 assert.deepEqual(intervals,[1000]);
});
test('reduced motion footer and gallery retain native content without distortion or parallax',()=>{
 const c=harness('<footer><div class="footer-container">Links</div></footer>');
 c.prefersReducedMotion=()=>true;c.ScrollTrigger={create:()=>assert.fail('parallax should not start')};
 vm.runInNewContext(functions('footer.ts',['initFooterParallax'])+';initFooterParallax();',c);
 Object.assign(c.window, { requestAnimationFrame: () => {} });
 vm.runInNewContext(functions('project.ts',['canStartProjectEffect'])+';globalThis.canStart=canStartProjectEffect(window,document);',c);
 assert.equal(c.canStart,false);
});
test('denied ring renderer retains the themed ring behind working menu links',()=>{
 const c=harness('<div class="circular-menu"><a href="/events">Eventi</a></div>');
 c.navigator={userAgent:'Desktop'};c.THREE={Vector3:Three.Vector3,WebGLRenderer:class{constructor(){throw new Error('No GPU');}}};
 c.createGrainFragmentShader=()=>'';
 vm.runInNewContext(script('menu-ring-grain.ts'),c);
 assert.doesNotThrow(()=>vm.runInNewContext('initMenuRingGrain(document.querySelector(".circular-menu"),700);',c));
 assert.ok(must(c.document.querySelector<HTMLElement>('.circular-menu')).classList.contains('has-ring-fallback'));
 assert.equal(must(c.document.querySelector<HTMLAnchorElement>('a')).textContent,'Eventi');
});

for (const surface of ['skyline','ring','atmosphere']) for (const immediateTheme of [false,true]) test(`failed Three shader preserves ${surface} fallback and stops drawing (initial theme: ${immediateTheme})`,async()=>{
 const c=harness('<section class="lab-hero"><canvas id="skyline"></canvas></section><div class="menu-overlay"><canvas id="menu-canvas"></canvas><div class="circular-menu"><a href="/events">Eventi</a></div></div>');
 let nextFrame: FrameRequestCallback | undefined; let draws=0,cancelled=0;
 c.requestAnimationFrame=fn=>{nextFrame=fn;return 1;};c.cancelAnimationFrame=()=>cancelled++;
 c.IntersectionObserver=class{observe(){}disconnect(){}};
 c.THREE={...Three,WebGLRenderer:class{
   debug: { onShaderError?: () => void }={}; setSize(){} setPixelRatio(){} setClearColor(){} dispose(){}
   render(){draws++;this.debug.onShaderError?.();}
 }};
 c.bindThemeUniforms=(_uniforms: ThemeUniforms,_mapping: ThemeUniformMapping,draw?: () => void)=>{if(immediateTheme)draw?.();return ()=>{};};c.GRAIN_VERTEX_SHADER='';c.GRAIN_FRAGMENT_SHADER='';
 c.createGrainFragmentShader=()=>'';c.navigator={userAgent:'Desktop'};
 if(surface==='skyline') vm.runInNewContext(script('skyline.ts'),c);
 if(surface==='ring') vm.runInNewContext(script('menu-ring-grain.ts')+';initMenuRingGrain(document.querySelector(".circular-menu"),700);',c);
 if(surface==='atmosphere') {
   c.loadMenuLibrary=async()=>c.THREE;
   Object.assign(c,{atmosphereFailed:false,atmosphereAttempted:false,atmosphereRenderer:null,atmosphereScene:null,atmosphereCamera:null,atmosphereMaterial:null,atmosphereMesh:null,atmosphereFrame:null,lastAtmosphereFrame:null,isOpen:true,isMenuAnimating:false,matrixShader:{vertexShader:'',fragmentShader:''}});
   vm.runInNewContext(functions('menu.ts',['ensureAtmosphere','showAtmosphereFallback','initAtmosphere','resizeAtmosphere','animateAtmosphere'])+';ensureAtmosphere();',c);
   await new Promise(resolve=>setImmediate(resolve));
 } else if(nextFrame) nextFrame(300);
 const selector=surface==='skyline'?'.lab-hero':surface==='ring'?'.circular-menu':'.menu-overlay';
 const fallbackClass=surface==='skyline'?'has-grain-fallback':surface==='ring'?'has-ring-fallback':'has-atmosphere-fallback';
 assert.ok(must(c.document.querySelector(selector)).classList.contains(fallbackClass),'shader diagnostics must select the visible CSS fallback');
 assert.ok(cancelled>0,'pending GPU frame must be cancelled');
 if(nextFrame)nextFrame(600);assert.equal(draws,1,'no repeated draws after shader failure');
 assert.equal(must(c.document.querySelector<HTMLAnchorElement>('a')).textContent,'Eventi');
});

test('ring renderer observes the same uniforms updated by layout, frames and resize', () => {
  const c = harness('<div class="circular-menu"></div>');
  const menu = must(c.document.querySelector<HTMLElement>('.circular-menu'));
  Object.defineProperties(menu, { offsetWidth: { value: 500, configurable: true }, offsetHeight: { value: 500, configurable: true } });
  let nextFrame: FrameRequestCallback | undefined;
  let material: Three.ShaderMaterial | undefined;
  c.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  c.navigator = { userAgent: 'Desktop' };
  c.bindThemeUniforms = () => () => {};
  c.createGrainFragmentShader = () => '';
  c.GRAIN_VERTEX_SHADER = '';
  c.THREE = { ...Three, WebGLRenderer: class {
    debug = {};
    setSize() {} setPixelRatio() {} setClearColor() {} dispose() {}
    render(scene: Three.Scene) {
      const mesh = scene.children[0];
      assert.ok(mesh instanceof Three.Mesh);
      assert.ok(mesh.material instanceof Three.ShaderMaterial);
      material = mesh.material;
    }
  } };
  vm.runInNewContext(script('menu-ring-grain.ts') + ';initMenuRingGrain(document.querySelector(".circular-menu"),700);', c);
  must(nextFrame)(250);
  const uniforms = must(material).uniforms;
  assert.equal(must(uniforms.iTime).value, 0.25);
  assert.equal(must(uniforms.uOuterPx).value, 210);
  const resolution: unknown = must(uniforms.iResolution).value;
  assert.ok(resolution instanceof Three.Vector3);
  assert.deepEqual(resolution.toArray(), [500, 500, 1]);
  Object.defineProperties(menu, { offsetWidth: { value: 600, configurable: true }, offsetHeight: { value: 600, configurable: true } });
  vm.runInNewContext('resizeMenuRingGrain(document.querySelector(".circular-menu"),600);', c);
  must(nextFrame)(500);
  assert.equal(must(material).uniforms, uniforms);
  assert.equal(must(uniforms.iTime).value, 0.5);
  assert.equal(must(uniforms.uOuterPx).value, 252);
  assert.deepEqual(resolution.toArray(), [600, 600, 1]);
});
