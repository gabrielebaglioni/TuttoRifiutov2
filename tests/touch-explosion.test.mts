import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchGesture, installTouchExplosion } from '../src/scripts/touch-explosion.ts';
import {parseHTML} from 'linkedom';

test('only horizontal intent activates; vertical starts stay rejected',()=>{
 const g=createTouchGesture();
 g.start(100,100);
 assert.equal(g.move(104,104),false);
 assert.equal(g.move(102,113),false);
 assert.equal(g.move(200,113),false);
 g.start(100,100);
 assert.equal(g.move(116,103),true);
 assert.equal(g.move(125,104),true);
 g.reset();
 assert.equal(g.move(200,100),false);
 g.start(100,100);
 assert.equal(g.move(84,102),true);
});
test('diagonal drags activate but initial vertical intent and taps stay reserved',()=>{
 const g=createTouchGesture();
 g.start(100,100);assert.equal(g.move(114,112),true);
 assert.equal(g.move(180,112),true);
 g.start(100,100);assert.equal(g.move(102,112),false);
 assert.equal(g.move(160,115),false);
 g.start(100,100);g.reset();assert.equal(g.move(120,100),false);
});

function interaction(){
 const {document:doc,window:dom}=parseHTML('<html><body><section><canvas></canvas></section><button>Menu</button></body></html>');
 const canvas=doc.querySelector<HTMLCanvasElement>('canvas');must(canvas).width=780;must(canvas).height=1688;
 must(canvas).getBoundingClientRect=()=>rect(0,0,390,844);
 let now=0,sequence=0;const queue=new Map<number, FrameRequestCallback>(),draws: number[][]=[];
 const view=Object.assign({}, dom, {PointerEvent:class{},innerWidth:390,performance:{now:()=>now},matchMedia:()=>({matches:false}),
  requestAnimationFrame:(fn: FrameRequestCallback)=>{queue.set(++sequence,fn);return sequence;},cancelAnimationFrame:(id: number)=>queue.delete(id),
  addEventListener:doc.addEventListener.bind(doc),removeEventListener:doc.removeEventListener.bind(doc)});
 const controller=installTouchExplosion({canvas: must(canvas),bounds:()=>({left:80,top:400,right:700,bottom:1000}),enabled:()=>true,onFrame:(...args)=>draws.push(args),view,doc});
 const hit=doc.querySelector<HTMLElement>('.particle-touch-region');
 const send=(name: string,x: number,y: number,id=1,target: EventTarget | null=hit)=>{const event=new dom.Event(name,{bubbles:true,cancelable:true});Object.assign(event,{pointerType:'touch',pointerId:id,clientX:x,clientY:y});must(target).dispatchEvent(event);assert.equal(event.defaultPrevented,false);};
 const frame=(time: number)=>{now=time;const jobs=[...queue.values()];queue.clear();jobs.forEach(fn=>fn(time));};
 const touchMove=(x: number,y: number,count=1)=>{const e=new dom.Event('touchmove',{bubbles:true,cancelable:true});Object.assign(e, { touches: Array.from({length:count},()=>({clientX:x,clientY:y})) });must(hit).dispatchEvent(e);return e.defaultPrevented;};
 return{doc,hit,send,frame,draws,queue,controller,touchMove};
}
test('activated drag owns moves outside the title until release, not the next vertical swipe',()=>{
 const t=interaction();
 t.send('pointerdown',100,300);
 assert.equal(t.touchMove(125,303),true);
 assert.equal(t.touchMove(250,650),true);
 t.frame(0);assert.deepEqual(t.draws.at(-1),[500,1300,1]);
 t.send('pointerup',250,650);
 t.send('pointerdown',100,300);
 assert.equal(t.touchMove(102,325),false);
 t.send('pointerup',102,325);
 t.send('pointerdown',100,300);
 assert.equal(t.touchMove(125,303,2),false);
 t.controller.destroy();
});
test('touch pulse stays idle for taps/vertical scroll and stops completely after horizontal decay',()=>{
 const t=interaction();
 assert.equal(t.queue.size,0);
 t.send('pointerdown',100,300);t.send('pointermove',102,325);t.send('pointerup',102,325);
 assert.equal(t.queue.size,0);assert.equal(t.draws.length,0);
 t.send('pointerdown',100,300);t.send('pointermove',140,304);t.frame(0);
 assert.deepEqual(t.draws.at(-1),[280,608,1]);
 for(let time=16;time<=672;time+=16)t.frame(time);
 assert.equal(must(t.draws.at(-1))[2],0);assert.equal(t.queue.size,0);
 assert.ok(t.draws.length>=35 && t.draws.length<=44,'smooth frames remain bounded and stop at rest');
 t.controller.destroy();assert.equal(t.doc.querySelector<HTMLElement>('.particle-touch-region'),null);
});
test('returning from a background interruption accepts a fresh touch',()=>{
 const t=interaction();
 t.send('pointerdown',100,300);t.send('pointermove',140,300);t.frame(0);
 Object.defineProperty(t.doc,'hidden',{value:true,configurable:true});
 t.send('visibilitychange',0,0,0,t.doc);
 assert.equal(t.queue.size,0);
 Object.defineProperty(t.doc,'hidden',{value:false,configurable:true});
 t.send('visibilitychange',0,0,0,t.doc);
 t.send('pointerdown',100,300,9);t.send('pointermove',140,300,9);
 assert.equal(t.queue.size,1);
 t.controller.destroy();
});
test('second contact, cancellation and outside starts never hijack navigation',()=>{
 const t=interaction();
 t.send('pointerdown',100,300);t.send('pointermove',140,300);t.frame(0);
 t.send('pointerdown',200,300,2,t.doc.querySelector<HTMLElement>('button'));
 assert.equal(must(t.draws.at(-1))[2],0);assert.equal(t.queue.size,0);
 t.send('pointerup',200,300,2);t.send('pointermove',180,300);assert.equal(t.queue.size,0);
 t.send('pointerup',180,300);
 t.send('pointerdown',10,300);t.send('pointermove',100,300);assert.equal(t.queue.size,0);
 t.send('pointercancel',100,300);
 t.send('pointerdown',100,300,3,t.doc.querySelector<HTMLElement>('button'));t.send('pointermove',140,300,3);assert.equal(t.queue.size,0);
 t.controller.destroy();
});
