import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { usesTouchLayout } from '../src/scripts/motion-policy.js';

function functions(file, names) {
  const source = readFileSync(new URL(`../src/scripts/${file}`, import.meta.url), 'utf8');
  const body = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body;
  return body.flatMap(node => node.type === 'FunctionDeclaration' && node.id.name === 'initSkyline' ? node.body.body : [node])
    .filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name))
    .map(n => source.slice(n.start, n.end)).join('\n');
}

function script(file) {
  const source=readFileSync(new URL(`../src/scripts/${file}`,import.meta.url),'utf8');
  return parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type!=='ImportDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
}

test('mobile hero rasterization does not allocate a nine-million-pixel readback', () => {
  let sampledPixels;
  const PV = { isMobile: true, config: { logoSize: 3000, logoPath: '/hero.webp' } };
  vm.runInNewContext(functions('particle-visual.js', ['loadImage']) + '\nloadImage();', {
    PV, showParticleFallback(){assert.fail('unexpected fallback');}, Image: class { set src(value) { this.onload(); } },
    createParticles() {}, document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData(x,y,w,h) { sampledPixels=w*h; return {data:[]}; } }) }) },
  });
  assert.ok(sampledPixels <= 800 * 800, `sampled ${sampledPixels} pixels`);
});

test('static mobile particles render once instead of repainting forever', () => {
  let scheduled=0, rendered=0;
  vm.runInNewContext(functions('particle-visual.js', ['animate']) + '\nanimate();', {
    PV: {isMobile:true,isVisible:true}, document:{hidden:false},
    requestAnimationFrame:()=>scheduled++, render:()=>rendered++,
  });
  assert.equal(rendered,1); assert.equal(scheduled,0);
});

test('closed menu does not render its full-screen WebGL atmosphere', () => {
  let draws=0;
  vm.runInNewContext(functions('menu.js', ['animateAtmosphere']) + '\nanimateAtmosphere();', {
    atmosphereFailed:false,isOpen:false,isMenuAnimating:false,document:{hidden:false},requestAnimationFrame(){},
    atmosphereMaterial:{uniforms:{iTime:{value:0}}},atmosphereRenderer:{render:()=>draws++},atmosphereScene:{},atmosphereCamera:{},
  });
  assert.equal(draws,0);
});

test('unchanged pie text progress does not rebuild identical GSAP updates', () => {
  let sets=0;
  const context=vm.createContext({
    STATE:{canvas:{draw(){}},headerSplit:{words:[{},{},{},{}]}},scaleMultiplier:7,
    pieFrame:()=>({fill:1,scale:4}),gsap:{set:()=>sets++},
  });
  vm.runInContext(functions('pie-transition.js',['renderProgress']) + '\nrenderProgress(0.8);',context);
  const first=sets;
  vm.runInContext('renderProgress(0.80001);',context);
  assert.equal(sets,first);
});

test('home and contacts settle collections without unrelated API requests', async () => {
  let requests=0;
  const {document}=parseHTML('<html><body><section class="lab-about"></section></body></html>');
  const context=vm.createContext({document,fetchJson:async()=>{requests++;return [];}});
  vm.runInContext(functions('collections-hydration.js',['hydrateEvents','hydrateArchive']),context);
  await vm.runInContext('Promise.all([hydrateEvents(),hydrateArchive()])',context);
  assert.equal(requests,0);
});

test('mobile page cover does not impose a long delay before navigation can begin', async () => {
  const jobs=[]; let now=0;
  const blocks=Array.from({length:12},()=>({element:{}}));
  const context=vm.createContext({prefersReducedMotion:()=>false,blocks,usesTouchLayout:()=>usesTouchLayout({innerWidth:390}),window:{innerWidth:390,matchMedia:()=>({matches:true})},Math,
    document:{querySelector:()=>({style:{}})},
    setTimeout:(fn,delay)=>jobs.push({fn,at:now+delay}),
    gsap:{set(){},to(target,options){jobs.push({fn:options.onComplete,at:now+1000*((options.delay||0)+options.duration*(1+(options.repeat||0)))});}},
  });
  vm.runInContext(functions('transition.js',['animateOut']),context);
  const done=vm.runInContext('animateOut()',context);
  while(jobs.length){jobs.sort((a,b)=>a.at-b.at);const job=jobs.shift();now=job.at;job.fn();}
  await done;
  assert.ok(now <= 300, `cover took ${now}ms before starting the request`);
});

test('mobile page reveal remains visible long enough and releases navigation', () => {
 const jobs=[], grid={style:{pointerEvents:'auto'}};
 const blocks=Array.from({length:12},()=>({element:{}}));
 const context={blocks,prefersReducedMotion:()=>false,usesTouchLayout:()=>true,Math,
 document:{querySelector:()=>grid},ScrollTrigger:{sort(){},refresh(){}},
 gsap:{set(){},to(target,options){jobs.push(options);}}};
 vm.runInNewContext(functions('transition.js',['reveal'])+';reveal();',context);
 const duration=Math.max(...jobs.map(o=>1000*((o.delay||0)+o.duration*(1+(o.repeat||0)))));
 assert.ok(duration>=450 && duration<=1000,`reveal duration ${duration}ms`);
 jobs.forEach(o=>o.onComplete());
 assert.equal(grid.style.pointerEvents,'none');
});

test('grain only redraws when its five-Hz shader changes appearance', () => {
  let draws=0;
  const context=vm.createContext({stopped:false,requestAnimationFrame(){},isVisible:true,document:{hidden:false},lastNoiseFrame:-1,
    material:{uniforms:{iTime:{value:0}}},renderer:{render:()=>draws++},scene:{},camera:{}});
  vm.runInContext(functions('skyline.js',['animate'])+'\n[0,10,30,199,200,201].forEach(animate);',context);
  assert.equal(draws,2);
});

test('Safari address-bar height changes do not reallocate the hero canvas', () => {
  let allocations=0;
  vm.runInNewContext(functions('skyline.js',['handleResize'])+'\nhandleResize();',{
    stopped:false,skylineViewport:{width:390,height:844},isMobile:true,window:{innerWidth:390,innerHeight:740,devicePixelRatio:3},
    resizeTimeout:0,clearTimeout(){},setTimeout:fn=>fn(),pixelRatioLimit:1,lastNoiseFrame:-1,
    meaningfulResize:(old,next,touch)=>old.width!==next.width||(!touch&&old.height!==next.height),
    renderer:{setSize:()=>allocations++,setPixelRatio(){}},material:{uniforms:{iResolution:{value:{set(){}}}}},
  });
  assert.equal(allocations,0);
});

test('mobile pie reserves its sticky scroll track before JavaScript starts', () => {
  const css=readFileSync(new URL('../src/styles/site/lab.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<style>${css}</style><div class="pie-scroll-track"><section class="pie-transition"></section></div>`);
  const rules=[...document.querySelector('style').sheet.cssRules].filter(r=>!r.media?.mediaText?.includes('prefers-reduced-motion')).flatMap(r=>r.cssRules?[...r.cssRules]:[r]);
  const styleFor=selector=>{
    const node=document.querySelector(selector), values={};
    for(const rule of rules) if(rule.selectorText&&node.matches(rule.selectorText)) {
      for(const key of ['height','position']) if(rule.style.getPropertyValue(key)) values[key]=rule.style.getPropertyValue(key);
    }
    return values;
  };
  assert.equal(styleFor('.pie-transition').position,'sticky');
  assert.ok(styleFor('.pie-scroll-track').height,'track must not expand from zero when JS arrives');
});

test('mobile about reveal animates a composited transform rather than repainting its polygon', () => {
  let animation;
  const context={prefersReducedMotion:()=>false,appleHeroScrollMode:()=> 'standard',usesTouchLayout:()=>usesTouchLayout({innerWidth:390}),window:{innerWidth:390},ScrollTrigger:{},gsap:{registerPlugin(){},
    to(target,options){if(target==='.lab-about-revealer')animation=options;},
    fromTo(target,from,options){if(target==='.lab-about-revealer')animation=options;},
  }};
  vm.runInNewContext(script('lab.js'),context);
  assert.equal(animation.scaleY,1);
  assert.equal(animation.clipPath,undefined);
});

test('footer initialization requests a scroll-safe refresh, not a forced refresh during a swipe', () => {
  let safe;
  vm.runInNewContext(script('footer.js'),{
    gsap:{registerPlugin(){}},ScrollTrigger:{refresh:value=>safe=value},
    document:{addEventListener:(event,fn)=>fn(),querySelector:()=>null},setTimeout:fn=>fn(),
  });
  assert.equal(safe,true);
});
