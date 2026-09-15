import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import vm from 'node:vm';
import * as policy from '../src/scripts/motion-policy.js';
import {parseHTML} from 'linkedom';
function functions(file,names){const s=readFileSync(new URL('../src/scripts/'+file,import.meta.url),'utf8');return parse(s,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');}
test('Apple scroll policy includes Chrome iPhone and iPad, excludes Android and desktop',()=>{
 assert.equal(typeof policy.appleHeroScrollMode,'function');
 for(const [ua,touch,expected] of [['iPhone CriOS/140',5,'native'],['iPad',5,'native'],['Macintosh',5,'native'],['Android Redmi',5,'standard'],['Macintosh',0,'standard']]) {
  assert.equal(policy.appleHeroScrollMode({navigator:{userAgent:ua,maxTouchPoints:touch},CSS:{supports:()=>true}}),expected);
 }
 assert.equal(policy.appleHeroScrollMode({navigator:{userAgent:'iPhone',maxTouchPoints:5},CSS:{supports:()=>false}}),'normalized');
});
test('Apple homepage has one scroll owner: native timeline or normalizer, never Lenis too',()=>{
 for(const mode of ['native','normalized','standard']) {
  let lenisStarts=0,normalized=0;
  const context={window:{},document:{querySelector:()=>({})},appleHeroScrollMode:()=>mode,usesTouchLayout:()=>true,lenis:null,
   Lenis:class{constructor(){lenisStarts++;}on(){}},gsap:{ticker:{add(){},lagSmoothing(){}}},ScrollTrigger:{normalizeScroll:()=>normalized++,update(){}}};
  vm.runInNewContext(functions('lenis-scroll.js',['initLenisScroll'])+';initLenisScroll();',context);
  assert.equal(lenisStarts,mode==='standard'?1:0);assert.equal(normalized,mode==='normalized'?1:0);
 }
});
test('mobile menu uses the original shader rather than an empty blue background',()=>{
 let started=0;
 const context={usesTouchLayout:()=>true,document:{getElementById:()=>({})},window:{devicePixelRatio:3},CONFIG:{colors:{bg:'#2444D9',fg:'#000000'}},hexToRgb:()=>({r:0,g:0,b:0}),matrixShader:{vertexShader:'original',fragmentShader:'TR'},
 THREE:{Scene:class{add(){}},OrthographicCamera:class{},WebGLRenderer:class{constructor(){started++;}setPixelRatio(){}},PlaneGeometry:class{},ShaderMaterial:class{},Vector2:class{},Vector3:class{},Mesh:class{}},resizeAtmosphere(){},animateAtmosphere(){}};
 vm.runInNewContext(functions('menu.js',['initAtmosphere'])+';initAtmosphere();',context);assert.equal(started,1);
});
test('touch shader allocation is capped while keeping the viewport aspect ratio',()=>{
 let allocated;
 vm.runInNewContext(functions('menu.js',['resizeAtmosphere'])+';resizeAtmosphere();',{usesTouchLayout:()=>true,window:{innerWidth:1180,innerHeight:820},atmosphereRenderer:{setSize:(w,h)=>allocated=[w,h]},atmosphereMaterial:{uniforms:{iResolution:{value:{set(){}}}}}});
 assert.ok(allocated[0]*allocated[1]<=720*720);assert.ok(Math.abs(allocated[0]/allocated[1]-1180/820)<.01);
});
test('native Apple reveal delegates both layers to CSS without competing GSAP writes',()=>{
 const {document}=parseHTML('<section class="lab-hero"></section>');let tweens=0;
 const s=readFileSync(new URL('../src/scripts/lab.js',import.meta.url),'utf8');
 const executable=parse(s,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>s.slice(n.start,n.end)).join('\n');
 vm.runInNewContext(executable,{document,lockHeroViewport(){},appleHeroScrollMode:()=> 'native',usesTouchLayout:()=>true,ScrollTrigger:{},gsap:{registerPlugin(){},to(){tweens++;},fromTo(){tweens++;}}});
 assert.equal(tweens,0);assert.ok(document.querySelector('.lab-hero').classList.contains('has-native-hero-scroll'));
});
test('Apple hero geometry remains fixed when browser bars resize during reverse scroll',()=>{
 assert.equal(typeof policy.lockHeroViewport,'function');
 const {document}=parseHTML('<section></section>');const hero=document.querySelector('section');
 let height=700,resize;hero.getBoundingClientRect=()=>({height});
 const view={innerWidth:390,addEventListener:(event,fn)=>{if(event==='resize')resize=fn;}};
 policy.lockHeroViewport(hero,view);
 assert.equal(hero.style.getPropertyValue('--hero-height'),'700px');
 height=810;resize();height=730;resize();
 assert.equal(hero.style.getPropertyValue('--hero-height'),'700px');
 assert.equal(hero.style.getPropertyValue('--hero-reveal-distance'),'1050px');
 view.innerWidth=844;height=390;resize();
 assert.equal(hero.style.getPropertyValue('--hero-height'),'390px');
});
test('phone menu cap fits a small fixed overlay without extending below the viewport',()=>{
 const css=readFileSync(new URL('../src/styles/site/menu.css',import.meta.url),'utf8');
 const {document}=parseHTML(`<style>${css}</style><div class="menu-toggle-btn"></div>`);const node=document.querySelector('div');const values={};
 function read(rules){for(const rule of rules){if(rule.media){if(rule.conditionText?.includes('600px')||rule.media.mediaText?.includes('600px'))read(rule.cssRules);}else if(rule.selectorText&&!rule.selectorText.includes('::')&&node.matches(rule.selectorText))for(const p of ['width','height','bottom','position'])if(rule.style.getPropertyValue(p))values[p]=rule.style.getPropertyValue(p);}}
 read(document.querySelector('style').sheet.cssRules);
 assert.equal(values.position,'fixed');assert.equal(values.bottom,'0');
 assert.ok(parseFloat(values.width)<=12,'phone cap should not occupy almost the full screen width');
 assert.ok(parseFloat(values.height)<=3.5,'cap must not extend below viewport and appear to grow');
});
test('pie orientation resize measures the CSS stage, not a smaller browser-bar viewport',()=>{
 const {document}=parseHTML('<div><section></section></div>');const container=document.querySelector('section');
 Object.defineProperty(container,'offsetHeight',{value:900});
 vm.runInNewContext(functions('pie-transition.js',['handleResize'])+';handleResize();',{
 window:{innerWidth:844,innerHeight:800},viewport:{width:390,height:700},mobile:true,meaningfulResize:policy.meaningfulResize,
 STATE:{container},updateZoomTarget(){},ScrollTrigger:{refresh(){}},
 });
 assert.equal(container.parentElement.style.getPropertyValue('--pie-stage-height'),'900px');
});
test('touch menu shader caps frame rate without slowing its animation clock',()=>{
 let draws=0;const c=vm.createContext({isOpen:true,isMenuAnimating:false,document:{hidden:false},usesTouchLayout:()=>true,requestAnimationFrame(){},lastAtmosphereFrame:null,atmosphereMaterial:{uniforms:{iTime:{value:0}}},atmosphereRenderer:{render:()=>draws++},atmosphereScene:{},atmosphereCamera:{}});
 vm.runInContext(functions('menu.js',['animateAtmosphere'])+';[0,16,34,50,68].forEach(animateAtmosphere);',c);
 assert.equal(draws,3);assert.ok(c.atmosphereMaterial.uniforms.iTime.value>=.064);
});
