import { styleRules } from './browser-test-utils.mts';
import type { ThemeUniforms, ThemeUniformMapping } from '../src/scripts/theme.ts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserScript } from './read-browser-script.mts';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import vm from 'node:vm';
import * as policy from '../src/scripts/motion-policy.ts';
import {parseHTML} from 'linkedom';
import {bindThemeUniforms} from '../src/scripts/theme.ts';
function functions(file: string,names: readonly string[]){const s=readBrowserScript(new URL('../src/scripts/'+file,import.meta.url));return parse(s,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='FunctionDeclaration'&&n.id && names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');}
test('Apple scroll policy includes Chrome iPhone and iPad, excludes Android and desktop',()=>{
 assert.equal(typeof policy.appleHeroScrollMode,'function');
 for(const [ua,touch,expected] of [['iPhone CriOS/140',5,'native'],['iPad',5,'native'],['Macintosh',5,'native'],['Android Redmi',5,'standard'],['Macintosh',0,'standard']] as const) {
  assert.equal(policy.appleHeroScrollMode({navigator:{userAgent:ua,maxTouchPoints:touch},CSS:{supports:()=>true}}),expected);
 }
 assert.equal(policy.appleHeroScrollMode({navigator:{userAgent:'iPhone',maxTouchPoints:5},CSS:{supports:()=>false}}),'normalized');
});
test('Apple homepage has one scroll owner: native timeline or normalizer, never Lenis too',()=>{
 for(const mode of ['native','normalized','standard']) {
  let lenisStarts=0,normalized=0;
  const context={window:{},document:{querySelector:()=>({})},prefersReducedMotion:()=>false,appleHeroScrollMode:()=>mode,usesTouchLayout:()=>true,lenis:null,
   Lenis:class{constructor(){lenisStarts++;}on(){}},gsap:{ticker:{add(){},lagSmoothing(){}}},ScrollTrigger:{normalizeScroll:()=>normalized++,update(){}}};
  vm.runInNewContext(functions('lenis-scroll.ts',['initLenisScroll'])+';initLenisScroll();',context);
  assert.equal(lenisStarts,mode==='standard'?1:0);assert.equal(normalized,mode==='normalized'?1:0);
 }
});
test('mobile menu uses the original shader rather than an empty blue background',()=>{
 let started=0;
 const {document}=parseHTML('<html><body><canvas id="menu-canvas"></canvas></body></html>'); Reflect.set(must(document.defaultView), "getComputedStyle", (element: HTMLElement)=>element.style);
 const context={atmosphereFailed:false,showAtmosphereFallback(){},usesTouchLayout:()=>true,document,window:{devicePixelRatio:3,addEventListener(){}},bindThemeUniforms:(uniforms: ThemeUniforms,mapping: ThemeUniformMapping,draw: () => void)=>bindThemeUniforms(uniforms,mapping,draw,document),matrixShader:{vertexShader:'original',fragmentShader:'TR'},
 THREE:{Scene:class{add(){}},OrthographicCamera:class{},WebGLRenderer:class{debug={};constructor(){started++;}setPixelRatio(){}render(){}},PlaneGeometry:class{},ShaderMaterial:class{uniforms: ThemeUniforms; constructor(options: {uniforms: ThemeUniforms}){this.uniforms=options.uniforms;}},Vector2:class{},Vector3:class{},Mesh:class{}},resizeAtmosphere(){},animateAtmosphere(){}};
 vm.runInNewContext(functions('menu.ts',['initAtmosphere'])+';initAtmosphere();',context);assert.equal(started,1);
});
test('touch shader allocation is capped while keeping the viewport aspect ratio',()=>{
 let allocated: [number, number] | undefined;
 vm.runInNewContext(functions('menu.ts',['resizeAtmosphere'])+';resizeAtmosphere();',{atmosphereFailed:false,usesTouchLayout:()=>true,window:{innerWidth:1180,innerHeight:820},atmosphereRenderer:{setSize:(w: number,h: number)=>allocated=[w,h]},atmosphereUniforms:{iResolution:{value:{set(){}}}}});
 assert.ok(must(allocated)[0]*must(allocated)[1]<=720*720);assert.ok(Math.abs(must(allocated)[0]/must(allocated)[1]-1180/820)<.01);
});
test('native Apple reveal delegates both layers to CSS without competing GSAP writes',()=>{
 const {document}=parseHTML('<section class="lab-hero"></section>');let tweens=0;
 const s=readBrowserScript(new URL('../src/scripts/lab.ts',import.meta.url));
 const executable=parse(s,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>s.slice(n.start,n.end)).join('\n');
 vm.runInNewContext(executable,{document,prefersReducedMotion:()=>false,lockHeroViewport(){},appleHeroScrollMode:()=> 'native',usesTouchLayout:()=>true,ScrollTrigger:{},gsap:{registerPlugin(){},to(){tweens++;},fromTo(){tweens++;}}});
 assert.equal(tweens,0);assert.ok(must(document.querySelector<HTMLElement>('.lab-hero')).classList.contains('has-native-hero-scroll'));
});
test('Apple hero geometry remains fixed when browser bars resize during reverse scroll',()=>{
 assert.equal(typeof policy.lockHeroViewport,'function');
 const {document}=parseHTML('<section></section>');const hero=document.querySelector<HTMLElement>('section');
 let height=700; let resize: (() => void) | undefined;must(hero).getBoundingClientRect=()=>rect(0,0,100,height);
 const view={innerWidth:390,addEventListener:(event: string,fn: () => void)=>{if(event==='resize')resize=fn;}};
 policy.lockHeroViewport(hero,view);
 assert.equal(must(hero).style.getPropertyValue('--hero-height'),'700px');
 height=810;must(resize)();height=730;must(resize)();
 assert.equal(must(hero).style.getPropertyValue('--hero-height'),'700px');
 assert.equal(must(hero).style.getPropertyValue('--hero-reveal-distance'),'1050px');
 view.innerWidth=844;height=390;must(resize)();
 assert.equal(must(hero).style.getPropertyValue('--hero-height'),'390px');
});
test('phone menu cap fits a small fixed overlay without extending below the viewport',()=>{
 const css=readFileSync(new URL('../src/styles/site/menu.css',import.meta.url),'utf8');
 const {document}=parseHTML(`<style>${css}</style><div class="menu-toggle-btn"></div>`);const node=document.querySelector<HTMLElement>('div');const values: Record<string, string>={};
 const rules = styleRules(must(must(document.querySelector<HTMLStyleElement>('style')).sheet).cssRules, rule => rule.conditionText?.includes('600px') || rule.media.mediaText?.includes('600px'));
 for (const rule of rules) if (rule.selectorText && !rule.selectorText.includes(':') && must(node).matches(rule.selectorText)) for (const p of ['width','height','bottom','position']) if (rule.style.getPropertyValue(p)) values[p]=rule.style.getPropertyValue(p);
 assert.equal(values.position,'fixed');assert.equal(values.bottom,'0');
 assert.ok(parseFloat(must(values.width))<=12,'phone cap should not occupy almost the full screen width');
 assert.ok(parseFloat(must(values.height))<=3.5,'cap must not extend below viewport and appear to grow');
});
test('pie orientation resize measures the CSS stage, not a smaller browser-bar viewport',()=>{
 const {document}=parseHTML('<div><section></section></div>');const container=document.querySelector<HTMLElement>('section');
 Object.defineProperty(container,'offsetHeight',{value:900});
 vm.runInNewContext(functions('pie-transition.ts',['handleResize'])+';handleResize();',{
 window:{innerWidth:844,innerHeight:800},viewport:{width:390,height:700},mobile:true,meaningfulResize:policy.meaningfulResize,
 STATE:{container},updateZoomTarget(){},ScrollTrigger:{refresh(){}},
 });
 assert.equal(must(must(container).parentElement).style.getPropertyValue('--pie-stage-height'),'900px');
});
test('touch menu shader caps frame rate without slowing its animation clock',()=>{
 let draws=0; const uniforms = { iTime: { value: 0 } }; const c=vm.createContext({atmosphereUniforms: uniforms,atmosphereFailed:false,isOpen:true,isMenuAnimating:false,document:{hidden:false},usesTouchLayout:()=>true,requestAnimationFrame(){},lastAtmosphereFrame:null,atmosphereMaterial:{uniforms:{iTime:{value:0}}},atmosphereRenderer:{render:()=>draws++},atmosphereScene:{},atmosphereCamera:{}});
 vm.runInContext(functions('menu.ts',['animateAtmosphere'])+';[0,16,34,50,68].forEach(animateAtmosphere);',c);
 assert.equal(draws,3);assert.ok(uniforms.iTime.value>=.064);
});
