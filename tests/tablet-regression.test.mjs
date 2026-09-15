import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as motion from '../src/scripts/motion-policy.js';
function source(file, names) {
 const text=readFileSync(new URL(`../src/scripts/${file}`,import.meta.url),'utf8');
 return parse(text,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>names?n.type==='FunctionDeclaration'&&names.includes(n.id.name):n.type!=='ImportDeclaration').map(n=>text.slice(n.start,n.end)).join('\n');
}
test('landscape tablet menu fits between navigation and footer links',()=>{
 for(const [width,height] of [[1024,600],[1180,720],[768,1024]]) {
  const context=vm.createContext({window:{innerWidth:width,innerHeight:height},document:{querySelector:()=>null},usesTouchLayout:()=>true});
  const size=vm.runInContext(source('menu.js',['getResponsiveConfig'])+';getResponsiveConfig().menuSize',context);
  assert.ok(size<=height-160,`${width}x${height}: ${size} menu overlaps chrome`);
 }
});
test('wide touch tablet gets transform-based homepage reveal; desktop keeps its polygon',()=>{
 for(const touch of [true,false]) {
  let animation;
  vm.runInNewContext(source('lab.js'),{prefersReducedMotion:()=>false,window:{innerWidth:1180},appleHeroScrollMode:()=> 'standard',usesTouchLayout:()=>touch,ScrollTrigger:{},gsap:{registerPlugin(){},to(t,v){if(t==='.lab-about-revealer')animation=v;},fromTo(t,f,v){if(t==='.lab-about-revealer')animation=v;}}});
  assert.equal(animation.scaleY===1,touch);
 }
});
test('page hero starts while collection API is pending without accelerating its tween',async()=>{
 const {document}=parseHTML('<html><body><section class="work-hero"><h1 data-animate-variant="diffuse" data-animate-on-scroll="false">Eventi</h1></section></body></html>');
 document.fonts={ready:Promise.resolve()};
 let ready;const collections=new Promise(r=>ready=r);let starts=0,duration;
 vm.runInNewContext(source('animated-copy.js'),{prefersReducedMotion:()=>false,document,window:{},contentReady:Promise.resolve(),preloaderReady:Promise.resolve(),ensureCollectionsReadiness:()=>({promise:collections}),ScrollTrigger:{sort(){},refresh(){}},SplitText:{create:(e,o)=>o.onSplit({words:[e]})},gsap:{registerPlugin(){},set(){},to(t,o){duration=o.duration;return {play(){starts++;}};}}});
 document.dispatchEvent(new document.defaultView.Event('DOMContentLoaded'));
 await new Promise(r=>setImmediate(r));
 assert.equal(starts,1);assert.equal(duration,2);
 ready();await new Promise(r=>setImmediate(r));assert.equal(starts,1,'hero must not restart when collection arrives');
});
test('touch menu defers GPU allocation until open and survives a failed GPU without repeated allocations',()=>{
 let attempted=0;
 const c=vm.createContext({prefersReducedMotion:()=>false,showAtmosphereFallback(){},usesTouchLayout:()=>true,isOpen:false,atmosphereAttempted:false,atmosphereRenderer:null,initAtmosphere(){attempted++;throw new Error('GPU unavailable');}});
 vm.runInContext(source('menu.js',['ensureAtmosphere'])+';ensureAtmosphere();',c);
 assert.equal(attempted,0);
 c.isOpen=true;vm.runInContext('ensureAtmosphere();ensureAtmosphere();',c);
 assert.equal(attempted,1);
});
test('sparse touch logo has enough point coverage while desktop retains its original points',()=>{
 for(const touch of [true,false]) {
  let pointSize;
  const gl=new Proxy({getUniformLocation:(p,n)=>n,uniform1f:(n,v)=>{if(n==='u_pointSize')pointSize=v;}},{get:(o,k)=>k in o?o[k]:()=>{}});
  vm.runInNewContext(source('particle-visual.js',['render'])+';render();',{particleScale:motion.particleScale,innerWidth:1180,PV:{isMobile:touch,touchPoint:{x:0,y:0},touchStrength:0,rasterSize:640,config:{logoSize:3000,particleSpacing:2},gl,canvas:{width:2360,height:1640,clientWidth:1180},geometry:{count:4000}}});
  if(touch)assert.ok(pointSize>=5,'sparse sampling must not make the wordmark disappear');else assert.equal(pointSize,3);
 }
});
test('menu contrast uses the area behind its visible cap, including the black homepage sections',()=>{
 const {document}=parseHTML('<html><body><section class="lab-about"></section><footer><div class="footer-container"></div></footer><div class="menu-toggle-btn"></div></body></html>');
 let top=500;const menu=document.querySelector('.menu-toggle-btn');
 menu.getBoundingClientRect=()=>({top:736,bottom:900});
 document.querySelector('footer').getBoundingClientRect=()=>({top:2000,bottom:2600});
 document.querySelector('.lab-about').getBoundingClientRect=()=>({top,bottom:1300});
 const listeners={};
 vm.runInNewContext(source('footer.js',['initFooterParallax'])+';initFooterParallax();',{prefersReducedMotion:()=>false,document,window:{innerHeight:800,addEventListener:(n,f)=>listeners[n]=f},requestAnimationFrame:f=>f(),ScrollTrigger:{create(){}},gsap:{set(){}}});
 assert.equal(menu.classList.contains('is-over-footer'),true);
 top=790;listeners.scroll();assert.equal(menu.classList.contains('is-over-footer'),false,'footer entering viewport below the button must not invert it early');
});
test('touch wordmark fits its canvas in portrait and landscape without changing desktop scale',()=>{
 assert.equal(typeof motion.particleScale,'function');
 for(const [width,height] of [[820,1180],[1180,820],[720,1480]]) {
  const scale=motion.particleScale({width,height},640,3000,true,1180);
  assert.ok(scale*640<=width*.95+0.01);
  assert.ok(scale*640<=height*.75+0.01);
 }
 assert.equal(motion.particleScale({width:1440,height:900},3000,3000,false,1440),0.75);
});
