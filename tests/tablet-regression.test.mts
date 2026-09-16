import type { TweenValues } from './browser-test-utils.mts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as motion from '../src/scripts/motion-policy.ts';
import { readBrowserScript } from './read-browser-script.mts';
function source(file: string, names?: readonly string[]) {
 const text=readBrowserScript(new URL(`../src/scripts/${file}`,import.meta.url));
 return parse(text,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>names?n.type==='FunctionDeclaration'&&n.id && names.includes(n.id.name):n.type!=='ImportDeclaration').map(n=>text.slice(n.start,n.end)).join('\n');
}
test('landscape tablet menu fits between navigation and footer links',()=>{
 for(const [width,height] of [[1024,600],[1180,720],[768,1024]]) {
  const context=vm.createContext({window:{innerWidth:width,innerHeight:height},document:{querySelector:()=>null},usesTouchLayout:()=>true});
  const size=vm.runInContext(source('menu.ts',['getResponsiveConfig'])+';getResponsiveConfig().menuSize',context);
  assert.ok(size<=must(height)-160,`${width}x${height}: ${size} menu overlaps chrome`);
 }
});
test('wide touch tablet gets transform-based homepage reveal; desktop keeps its polygon',()=>{
 for(const touch of [true,false]) {
  let animation: TweenValues | undefined;
  vm.runInNewContext(source('lab.ts'),{prefersReducedMotion:()=>false,window:{innerWidth:1180},appleHeroScrollMode:()=> 'standard',usesTouchLayout:()=>touch,ScrollTrigger:{},gsap:{registerPlugin(){},to(t: unknown,v: TweenValues){if(t==='.lab-about-revealer')animation=v;},fromTo(t: unknown,f: unknown,v: TweenValues){if(t==='.lab-about-revealer')animation=v;}}});
  assert.equal(must(animation).scaleY===1,touch);
 }
});
test('page hero starts while collection API is pending without accelerating its tween',async()=>{
 const {document}=parseHTML('<html><body><section class="work-hero"><h1 data-animate-variant="diffuse" data-animate-on-scroll="false">Eventi</h1></section></body></html>');
 Object.assign(document, { fonts: { ready: Promise.resolve() } });
 const readiness=deferredValue<void>(); const ready=()=>readiness.resolve(); const collections=readiness.promise;let starts=0,duration: number | undefined;
 vm.runInNewContext(source('animated-copy.ts'),{prefersReducedMotion:()=>false,document,window:{},contentReady:Promise.resolve(),preloaderReady:Promise.resolve(),ensureCollectionsReadiness:()=>({promise:collections}),ScrollTrigger:{sort(){},refresh(){}},SplitText:{create:(e: HTMLElement,o: {onSplit(self: {words: HTMLElement[]}): unknown})=>o.onSplit({words:[e]})},gsap:{registerPlugin(){},set(){},to(t: unknown,o: TweenValues){duration=o.duration;return {play(){starts++;}};}}});
 document.dispatchEvent(new (must(document.defaultView).Event)('DOMContentLoaded'));
 await new Promise(r=>setImmediate(r));
 assert.equal(starts,1);assert.equal(duration,2);
 must(ready)();await new Promise(r=>setImmediate(r));assert.equal(starts,1,'hero must not restart when collection arrives');
});
test('touch menu defers GPU allocation until open and survives a failed GPU without repeated allocations',async()=>{
 let attempted=0;
 const c=vm.createContext({loadMenuLibrary:async()=>({}),prefersReducedMotion:()=>false,showAtmosphereFallback(){},usesTouchLayout:()=>true,isOpen:false,atmosphereAttempted:false,atmosphereRenderer:null,initAtmosphere(){attempted++;throw new Error('GPU unavailable');}});
 vm.runInContext(source('menu.ts',['ensureAtmosphere'])+';ensureAtmosphere();',c);
 assert.equal(attempted,0);
 c.isOpen=true;vm.runInContext('ensureAtmosphere();ensureAtmosphere();',c);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(attempted,1);
});
test('sparse touch logo has enough point coverage while desktop retains its original points',()=>{
 for(const touch of [true,false]) {
  let pointSize: number | undefined;
  const gl=new Proxy({getUniformLocation:(p: unknown,n: string)=>n,uniform1f:(n: string,v: number)=>{if(n==='u_pointSize')pointSize=v;}},{get:(o,k)=>k in o?Reflect.get(o,k):()=>{}});
  vm.runInNewContext(source('particle-visual.ts',['render'])+';render();',{particleScale:motion.particleScale,innerWidth:1180,PV:{program: {}, isMobile:touch,touchPoint:{x:0,y:0},touchStrength:0,rasterSize:640,config:{logoSize:3000,particleSpacing:2},gl,canvas:{width:2360,height:1640,clientWidth:1180},geometry:{count:4000}}});
  if(touch)assert.ok(must(pointSize)>=5,'sparse sampling must not make the wordmark disappear');else assert.equal(pointSize,3);
 }
});
test('menu contrast uses the area behind its visible cap, including the black homepage sections',()=>{
 const {document}=parseHTML('<html><body><section class="lab-about"></section><footer><div class="footer-container"></div></footer><div class="menu-toggle-btn"></div></body></html>');
 let top=500;const menu=document.querySelector<HTMLElement>('.menu-toggle-btn');
 must(menu).getBoundingClientRect=()=>rect(0,736,100,164);
 must(document.querySelector<HTMLElement>('footer')).getBoundingClientRect=()=>rect(0,2000,100,600);
 must(document.querySelector<HTMLElement>('.lab-about')).getBoundingClientRect=()=>rect(0,top,100,1300-top);
 const listeners: Record<string, () => void>={};
 vm.runInNewContext(source('footer.ts',['initFooterParallax'])+';initFooterParallax();',{prefersReducedMotion:()=>false,document,window:{innerHeight:800,addEventListener:(n: string,f: () => void)=>listeners[n]=f},requestAnimationFrame:(f: () => void)=>f(),ScrollTrigger:{create(){}},gsap:{set(){}}});
 assert.equal(must(menu).classList.contains('is-over-footer'),true);
 top=790;must(listeners.scroll)();assert.equal(must(menu).classList.contains('is-over-footer'),false,'footer entering viewport below the button must not invert it early');
});
test('touch wordmark fits its canvas in portrait and landscape without changing desktop scale',()=>{
 assert.equal(typeof motion.particleScale,'function');
 for(const [width,height] of [[820,1180],[1180,820],[720,1480]] as const) {
  const scale=motion.particleScale({width,height},640,3000,true,1180);
  assert.ok(scale*640<=must(width)*.95+0.01);
  assert.ok(scale*640<=must(height)*.75+0.01);
 }
 assert.equal(motion.particleScale({width:1440,height:900},3000,3000,false,1440),0.75);
});
