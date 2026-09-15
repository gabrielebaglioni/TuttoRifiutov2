import { publicTheme } from './theme.js';

const SIDE = 256;

// One tiny transparent tile, no WebGL context, animation frame or scroll work.
// Two speck scales match the existing grain's 0.45/0.25 ink strengths.
export function grainPixels(ink) {
  const rgb = [1,3,5].map(index=>parseInt(ink.slice(index,index+2),16));
  const pixels = new Uint8ClampedArray(SIDE*SIDE*4);
  let seed=42;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<pixels.length;i+=4){
    pixels[i]=rgb[0]; pixels[i+1]=rgb[1]; pixels[i+2]=rgb[2];
    const specks=(random()>.965?.45:0)+(random()>.97?.25:0);
    pixels[i+3]=Math.round(Math.min(.7,specks+random()*.02)*255);
  }
  return pixels;
}

function initGrainBackground() {
  const root=document.documentElement;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=SIDE;
  const context=canvas.getContext('2d');
  if(!context)return;
  let previousInk;
  const unsubscribe=publicTheme().subscribe(({palette})=>{
    if(palette.foreground===previousInk)return;
    try {
      const pixels=context.createImageData(SIDE,SIDE);
      pixels.data.set(grainPixels(palette.foreground));
      context.putImageData(pixels,0,0);
      root.style.setProperty('--grain-background',`url("${canvas.toDataURL('image/png')}")`);
      previousInk=palette.foreground;
    } catch { /* A denied canvas leaves the original plain, readable surfaces. */ }
  });
  window.addEventListener('pagehide',event=>{if(!event.persisted)unsubscribe();});
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initGrainBackground,{once:true});
  else initGrainBackground();
}
