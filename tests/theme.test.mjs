import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PALETTE, validatePalette, themeCss, themeProperties } from '../src/data/theme.js';
import { validateContentValue } from '../worker/validation.js';
import { parseHTML } from 'linkedom';
import { routeRequest } from '../worker/router.js';

test('initial public HTML contains stored theme even before client content hydration', async () => {
  const env = { DB: { prepare() { return { bind() { return this; }, all: async () => ({results:[{key:'global.theme.palette', value_json:JSON.stringify({...DEFAULT_PALETTE, accent:'#112233'})}]}) }; } }, ASSETS:{fetch:async()=>new Response('<html><head><title>Old</title></head><body></body></html>', {headers:{'content-type':'text/html'}})} };
  const response = await routeRequest(new Request('https://site.test/work'), env, {});
  assert.match(await response.text(), /--accent:#112233/);
});
for (const path of ['/eventi/musica', '/archivio/parole']) test(`static detail ${path} receives theme without a collection override and preserves static SEO`, async () => {
  const html='<html style="--accent:#2444d9"><head><title>Static detail title</title><meta name="description" content="Static detail description"><meta name="theme-color" content="#000000"></head><body>Static detail</body></html>';
  const DB={prepare(){return {bind(){return this;},first:async()=>null,all:async()=>({results:[{key:'global.theme.palette',value_json:JSON.stringify({...DEFAULT_PALETTE,accent:'#112233',foreground:'#334455'})}]})};}};
  const response=await routeRequest(new Request(`https://site.test${path}`),{DB,ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html',etag:'compiled'}})}},{});
  const body=await response.text();
  assert.match(body,/--accent:#112233/);assert.match(body,/--fg:#334455/);
  assert.match(body,/<title>Static detail title<\/title>/);assert.match(body,/content="Static detail description"/);
  assert.match(body,/name="theme-color" content="#334455"/);assert.equal(response.headers.get('etag'),null);
});
test('public theme updates share one cached color read with shader subscribers and reject injections', async () => {
  const { createThemeController } = await import('../src/scripts/theme.js');
  const { document } = parseHTML('<html><head><meta name="theme-color"></head><body></body></html>');
  let reads = 0;
  const controller = createThemeController(document, () => { reads++; return {getPropertyValue:(key)=>document.documentElement.style.getPropertyValue(key)}; });
  let channels;
  controller.subscribe((theme) => { channels = theme.rgb.accent; });
  assert.equal(controller.apply({...DEFAULT_PALETTE, accent:'#ff8000'}), true);
  assert.equal(document.documentElement.style.getPropertyValue('--accent'), '#ff8000');
  assert.deepEqual(channels, [1, 128/255, 0]);
  assert.equal(reads, 2); // Initial snapshot + one complete update, never one read per subscriber/frame.
  controller.subscribe(()=>{}); controller.current(); controller.current(); assert.equal(reads, 2);
  assert.equal(controller.apply({...DEFAULT_PALETTE, accent:'red; color:blue'}), false); assert.equal(reads, 2);
});
test('grain uniforms follow palette changes and redraw subscribers without frame-time style reads', async () => {
  const { bindThemeUniforms, publicTheme } = await import('../src/scripts/theme.js');
  const { createGrainFragmentShader } = await import('../src/scripts/grain-yellow-shader.js');
  const { document } = parseHTML('<html><body></body></html>');
  document.defaultView.getComputedStyle = element => element.style;
  const uniforms = {}; let redraws=0;
  const stop = bindThemeUniforms(uniforms, {uColorBg:'background',uColorFg:'foreground'},()=>redraws++,document);
  publicTheme(document).apply({...DEFAULT_PALETTE, background:'#ff0000', foreground:'#0000ff'});
  assert.deepEqual(uniforms.uColorBg.value,[1,0,0]); assert.deepEqual(uniforms.uColorFg.value,[0,0,1]); assert.equal(redraws,2);
  stop(); publicTheme(document).apply(DEFAULT_PALETTE); assert.equal(redraws,2);
  // This source is compiled as GPU code: assert the shader's external uniform contract.
  assert.match(createGrainFragmentShader(), /uniform vec3 uColorBg/);
  assert.match(createGrainFragmentShader(), /mix\(uColorBg, uColorFg,/);
});
test('mobile pie recolors cached masks and repaints without reallocating geometry', async () => {
  const {createPieCanvas} = await import('../src/scripts/pie-canvas.js');
  const saved = Object.fromEntries(['document','window','Image','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]));
  const contexts=[]; const callbacks=[]; let sourceImage;
  const context = () => {const calls=[]; const c={calls,fillStyle:'',globalCompositeOperation:'',setTransform(){},clearRect(){},translate(){},scale(){},drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},arc(){},closePath(){},clip(){},fill(){},fillRect(){calls.push({color:this.fillStyle,composite:this.globalCompositeOperation});}}; contexts.push(c);return c;};
  try {
    globalThis.document={createElement(){const c=context();return {width:0,height:0,setAttribute(){},getContext:()=>c,remove(){}};}};
    globalThis.window={devicePixelRatio:2}; globalThis.Image=class {constructor(){sourceImage=this;this.naturalWidth=this.naturalHeight=800;}};
    globalThis.requestAnimationFrame=callback=>{callbacks.push(callback);return callbacks.length;};globalThis.cancelAnimationFrame=()=>{};
    const canvas=createPieCanvas({clientWidth:390,clientHeight:800,appendChild(){}},{imageUrl:'/mask.webp',origin:{x:400,y:400},box:{x:0,y:0,width:800,height:800},color:'#2444d9',onError(){assert.fail('unexpected canvas failure');}});
    sourceImage.onload(); callbacks.shift()(); const allocations=contexts.length;
    canvas.draw(.8,7); canvas.setColor('#123456'); assert.equal(contexts.length,allocations);
    assert.deepEqual(contexts.slice(-2).map(c=>c.calls.at(-1)),[{color:'#123456',composite:'source-in'},{color:'#123456',composite:'source-in'}]);
    assert.equal(callbacks.length,1);canvas.destroy();
  } finally {for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('palette accepts complete hex colors and rejects incomplete, injected and exotic objects', () => {
  assert.equal(validatePalette(DEFAULT_PALETTE), true);
  assert.equal(validatePalette({...DEFAULT_PALETTE, foreground:'url(https://evil.test)'}), false);
  for (const invalid of [null, [], {}, {...DEFAULT_PALETTE, extra:'#ffffff'}, {...DEFAULT_PALETTE, foreground:'#fff;--bg:red'}, Object.create(DEFAULT_PALETTE), JSON.parse('{"__proto__":{},"foreground":"#000000"}')]) assert.equal(validatePalette(invalid), false);
  const incomplete = {...DEFAULT_PALETTE}; delete incomplete.foreground;
  assert.equal(validatePalette(incomplete), false);
  const getter = {...DEFAULT_PALETTE}; Object.defineProperty(getter, 'foreground', {get(){throw new Error('getter executed');}});
  assert.equal(validatePalette(getter), false);
});
test('linked foreground and background roles derive from the same validated tokens', () => {
  const p = themeProperties({...DEFAULT_PALETTE, foreground:'#123456', background:'#abcdef'});
  assert.equal(p['--fg'], '#123456'); assert.equal(p['--menu-inverse-bg'], '#123456');
  assert.equal(p['--bg'], '#abcdef'); assert.equal(p['--menu-inverse-fg'], '#abcdef');
  assert.ok(themeCss({...DEFAULT_PALETTE, foreground:'</style><script>'}).includes('--fg:#000000'));
  assert.ok(!themeCss({...DEFAULT_PALETTE, foreground:'</style><script>'}).includes('<script>'));
});
test('CMS permits only a complete palette under its single schema key', () => {
  assert.equal(validateContentValue('global.theme.palette', {...DEFAULT_PALETTE, foreground:'#123456'}), true);
  assert.equal(validateContentValue('global.theme.palette', {foreground:'#123456'}), false);
  assert.equal(validateContentValue('global.nav.location', DEFAULT_PALETTE), false);
});
test('public updates cannot overwrite the protected admin palette', async () => {
  const {createThemeController} = await import('../src/scripts/theme.js');
  const {document} = parseHTML('<html><body class="admin-body"></body></html>');
  const theme=createThemeController(document,()=>{assert.fail('Admin must not read public colors');});
  assert.equal(theme.apply({...DEFAULT_PALETTE,foreground:'#ffff00'}),false);
  assert.equal(document.documentElement.hasAttribute('style'),false);
});
