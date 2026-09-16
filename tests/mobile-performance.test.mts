import { styleRules } from './browser-test-utils.mts';
import type { TweenValues } from './browser-test-utils.mts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { usesTouchLayout } from '../src/scripts/motion-policy.ts';
import { readBrowserScript } from './read-browser-script.mts';

function functions(file: string, names: readonly string[]) {
  const source = readBrowserScript(new URL(`../src/scripts/${file}`, import.meta.url));
  const body = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body;
  return body.flatMap(node => node.type === 'FunctionDeclaration' && node.id?.name === 'initSkyline' ? node.body.body : [node])
    .filter(n => n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name))
    .map(n => source.slice(n.start, n.end)).join('\n');
}

function script(file: string) {
  const source=readBrowserScript(new URL(`../src/scripts/${file}`,import.meta.url));
  return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
}

test('mobile hero rasterization does not allocate a nine-million-pixel readback', () => {
  let sampledPixels: number | undefined;
  const PV = { isMobile: true, config: { logoSize: 3000, logoPath: '/hero.webp' } };
  vm.runInNewContext(functions('particle-visual.ts', ['loadImage']) + '\nloadImage();', {
    PV, showParticleFallback(){assert.fail('unexpected fallback');}, Image: class { onload?: () => void; set src(value: string) { must(this.onload)(); } },
    createParticles() {}, document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData(x: number,y: number,w: number,h: number) { sampledPixels=w*h; return {data:[]}; } }) }) },
  });
  assert.ok(must(sampledPixels) <= 800 * 800, `sampled ${sampledPixels} pixels`);
});

test('static mobile particles render once instead of repainting forever', () => {
  let scheduled=0, rendered=0;
  vm.runInNewContext(functions('particle-visual.ts', ['animate']) + '\nanimate();', {
    PV: {isMobile:true,isVisible:true}, document:{hidden:false},
    requestAnimationFrame:()=>scheduled++, render:()=>rendered++,
  });
  assert.equal(rendered,1); assert.equal(scheduled,0);
});

test('closed menu does not render its full-screen WebGL atmosphere', () => {
  let draws=0;
  vm.runInNewContext(functions('menu.ts', ['animateAtmosphere']) + '\nanimateAtmosphere();', {
    atmosphereFailed:false,isOpen:false,isMenuAnimating:false,document:{hidden:false},requestAnimationFrame(){},
    atmosphereUniforms:{iTime:{value:0}},atmosphereRenderer:{render:()=>draws++},atmosphereScene:{},atmosphereCamera:{},
  });
  assert.equal(draws,0);
});

test('unchanged pie text progress does not rebuild identical GSAP updates', () => {
  let sets=0;
  const context=vm.createContext({
    STATE:{canvas:{draw(){}},headerSplit:{words:[{},{},{},{}]}},scaleMultiplier:7,
    pieFrame:()=>({fill:1,scale:4}),gsap:{set:()=>sets++},
  });
  vm.runInContext(functions('pie-transition.ts',['renderProgress']) + '\nrenderProgress(0.8);',context);
  const first=sets;
  vm.runInContext('renderProgress(0.80001);',context);
  assert.equal(sets,first);
});

test('home and contacts settle collections without unrelated API requests', async () => {
  let requests=0;
  const {document}=parseHTML('<html><body><section class="lab-about"></section></body></html>');
  const context=vm.createContext({document,fetchJson:async()=>{requests++;return [];}});
  vm.runInContext(functions('collections-hydration.ts',['hydrateEvents','hydrateArchive']),context);
  await vm.runInContext('Promise.all([hydrateEvents(),hydrateArchive()])',context);
  assert.equal(requests,0);
});

test('mobile page cover does not impose a long delay before navigation can begin', async () => {
  const jobs: Array<{fn: () => void; at: number}>=[]; let now=0;
  const blocks=Array.from({length:12},()=>({element:{}}));
  const context=vm.createContext({prefersReducedMotion:()=>false,blocks,usesTouchLayout:()=>usesTouchLayout({innerWidth:390}),window:{innerWidth:390,matchMedia:()=>({matches:true})},Math,
    document:{querySelector:()=>({style:{}})},
    setTimeout:(fn: () => void,delay: number)=>jobs.push({fn,at:now+delay}),
    gsap:{set(){},to(target: unknown,options: TweenValues){jobs.push({fn:must(options.onComplete),at:now+1000*((options.delay||0)+must(options.duration)*(1+(options.repeat||0)))});}},
  });
  vm.runInContext(functions('transition.ts',['animateOut']),context);
  const done=vm.runInContext('animateOut()',context);
  while(jobs.length){jobs.sort((a,b)=>a.at-b.at);const job=must(jobs.shift());now=job.at;job.fn();}
  await done;
  assert.ok(now <= 300, `cover took ${now}ms before starting the request`);
});

test('mobile page reveal remains visible long enough and releases navigation', () => {
 const jobs: TweenValues[]=[], grid={style:{pointerEvents:'auto'}};
 const blocks=Array.from({length:12},()=>({element:{}}));
 const context={blocks,prefersReducedMotion:()=>false,usesTouchLayout:()=>true,Math,
 document:{querySelector:()=>grid},ScrollTrigger:{sort(){},refresh(){}},
 gsap:{set(){},to(target: unknown,options: TweenValues){jobs.push(options);}}};
 vm.runInNewContext(functions('transition.ts',['reveal'])+';reveal();',context);
 const duration=Math.max(...jobs.map(o=>1000*((o.delay||0)+must(o.duration)*(1+(o.repeat||0)))));
 assert.ok(duration>=450 && duration<=1000,`reveal duration ${duration}ms`);
 jobs.forEach(o=>must(o.onComplete)());
 assert.equal(grid.style.pointerEvents,'none');
});

test('grain only redraws when its five-Hz shader changes appearance', () => {
  let draws=0;
  const context=vm.createContext({stopped:false,requestAnimationFrame(){},isVisible:true,document:{hidden:false},lastNoiseFrame:-1,
    uniforms:{iTime:{value:0}},renderer:{render:()=>draws++},scene:{},camera:{}});
  vm.runInContext(functions('skyline.ts',['animate'])+'\n[0,10,30,199,200,201].forEach(animate);',context);
  assert.equal(draws,2);
});

test('Safari address-bar height changes do not reallocate the hero canvas', () => {
  let allocations=0;
  vm.runInNewContext(functions('skyline.ts',['handleResize'])+'\nhandleResize();',{
    stopped:false,skylineViewport:{width:390,height:844},isMobile:true,window:{innerWidth:390,innerHeight:740,devicePixelRatio:3},
    resizeTimeout:0,clearTimeout(){},setTimeout:(fn: () => void)=>fn(),pixelRatioLimit:1,lastNoiseFrame:-1,
    meaningfulResize:(old: {width: number; height: number},next: {width: number; height: number},touch: boolean)=>old.width!==next.width||(!touch&&old.height!==next.height),
    renderer:{setSize:()=>allocations++,setPixelRatio(){}},uniforms:{iResolution:{value:{set(){}}}},
  });
  assert.equal(allocations,0);
});

test('mobile pie reserves its sticky scroll track before JavaScript starts', () => {
  const css=readFileSync(new URL('../src/styles/site/lab.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<style>${css}</style><div class="pie-scroll-track"><section class="pie-transition"></section></div>`);
  const rules=styleRules(must(must(document.querySelector<HTMLStyleElement>('style')).sheet).cssRules, r=>!r.media.mediaText.includes('prefers-reduced-motion'));
  const styleFor=(selector: string)=>{
    const node=must(document.querySelector(selector)), values: Record<string, string>={};
    for(const rule of rules) if(rule.selectorText&&node.matches(rule.selectorText)) {
      for(const key of ['height','position']) if(rule.style.getPropertyValue(key)) values[key]=rule.style.getPropertyValue(key);
    }
    return values;
  };
  assert.equal(styleFor('.pie-transition').position,'sticky');
  assert.ok(styleFor('.pie-scroll-track').height,'track must not expand from zero when JS arrives');
});

test('mobile about reveal animates a composited transform rather than repainting its polygon', () => {
  let animation: TweenValues | undefined;
  const context={prefersReducedMotion:()=>false,appleHeroScrollMode:()=> 'standard',usesTouchLayout:()=>usesTouchLayout({innerWidth:390}),window:{innerWidth:390},ScrollTrigger:{},gsap:{registerPlugin(){},
    to(target: unknown,options: TweenValues){if(target==='.lab-about-revealer')animation=options;},
    fromTo(target: unknown,from: unknown,options: TweenValues){if(target==='.lab-about-revealer')animation=options;},
  }};
  vm.runInNewContext(script('lab.ts'),context);
  assert.equal(must(animation).scaleY,1);
  assert.equal(must(animation).clipPath,undefined);
});

test('footer initialization requests a scroll-safe refresh, not a forced refresh during a swipe', () => {
  let safe;
  vm.runInNewContext(script('footer.ts'),{
    gsap:{registerPlugin(){}},ScrollTrigger:{refresh:(value: boolean)=>safe=value},
    document:{addEventListener:(event: string,fn: () => void)=>fn(),querySelector:()=>null},setTimeout:(fn: () => void)=>fn(),
  });
  assert.equal(safe,true);
});
