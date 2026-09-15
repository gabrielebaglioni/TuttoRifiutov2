export function createTouchGesture() {
  let mode='idle', x=0, y=0;
  return {
    start(nextX,nextY){x=nextX;y=nextY;mode='pending';},
    reset(){mode='idle';},
    move(nextX,nextY){
      if(mode==='active')return true;
      if(mode!=='pending')return false;
      const dx=Math.abs(nextX-x),dy=Math.abs(nextY-y);
      if(dx>=10 && dy<=dx*1.25){mode='active';return true;}
      if(dy>=10 && dy>dx*1.25)mode='rejected';
      return false;
    },
  };
}

// A bounded ~60fps pulse updates only GPU uniforms, not the particle buffers.
export function installTouchExplosion({canvas,bounds,enabled,onFrame,view=window,doc=document}) {
  if(!view.PointerEvent)return {layout(){},destroy(){}};
  const hit=doc.createElement('div');
  hit.className='particle-touch-region';hit.setAttribute('aria-hidden','true');
  canvas.after(hit);
  const gesture=createTouchGesture(),contacts=new Set();
  let owner=null,frame=0,lastDraw=-Infinity,lastMove=0,x=0,y=0,active=false;
  const motion=view.matchMedia('(prefers-reduced-motion: reduce)');
  function tick(now){
    frame=0;
    if(!active)return;
    if(!enabled() || doc.hidden){cancel();return;}
    const strength=Math.max(0,1-(now-lastMove)/650);
    if(now-lastDraw>=1000/60-1 || strength===0){lastDraw=now;onFrame(x,y,strength*strength);}
    if(strength>0)frame=view.requestAnimationFrame(tick);
    else active=false;
  }
  function cancel(){
    owner=null;gesture.reset();
    if(frame)view.cancelAnimationFrame(frame);
    frame=0;
    if(active)onFrame(x,y,0);
    active=false;
  }
  function down(event){
    if(event.pointerType!=='touch')return;
    contacts.add(event.pointerId);
    if(contacts.size!==1){cancel();return;}
    if(!enabled() || motion.matches || (view.visualViewport?.scale??1)>1.05)return;
    if(event.target!==hit || event.clientX<24 || event.clientX>view.innerWidth-24)return;
    owner=event.pointerId;gesture.start(event.clientX,event.clientY);
  }
  function move(event){
    if(event.pointerId!==owner)return;
    if(!enabled()){cancel();return;}
    if(!gesture.move(event.clientX,event.clientY))return;
    const rect=canvas.getBoundingClientRect();
    x=(event.clientX-rect.left)*canvas.width/rect.width;
    y=(event.clientY-rect.top)*canvas.height/rect.height;
    lastMove=view.performance.now();active=true;
    if(!frame)frame=view.requestAnimationFrame(tick);
  }
  function up(event){contacts.delete(event.pointerId);if(event.pointerId===owner){owner=null;gesture.reset();}}
  function pointerCancel(event){contacts.delete(event.pointerId);cancel();}
  function layout(){
    cancel();
    const rect=canvas.getBoundingClientRect(),box=bounds();
    if(!box || !rect.width || !rect.height)return;
    const sx=rect.width/canvas.width,sy=rect.height/canvas.height;
    const left=Math.max(24,box.left*sx-12),right=Math.min(rect.width-24,box.right*sx+12);
    const top=Math.max(0,box.top*sy-12),bottom=Math.min(rect.height,box.bottom*sy+12);
    Object.assign(hit.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
  }
  function visibilityChange(){
    // The OS may swallow pointerup while switching apps; discard stale contacts.
    if(doc.hidden){cancel();contacts.clear();}
  }
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',pointerCancel],['visibilitychange',visibilityChange]];
  for(const [name,handler] of listeners)doc.addEventListener(name,handler,{passive:true});
  view.addEventListener('scroll',cancel,{passive:true});
  motion.addEventListener?.('change',cancel);
  const onHide=(event)=>{cancel();contacts.clear();if(!event.persisted)destroy();};
  view.addEventListener('pagehide',onHide);
  function destroy(){
    cancel();hit.remove();contacts.clear();
    for(const [name,handler] of listeners)doc.removeEventListener(name,handler);
    view.removeEventListener('scroll',cancel);view.removeEventListener('pagehide',onHide);
    motion.removeEventListener?.('change',cancel);
  }
  layout();
  return {layout,destroy};
}
