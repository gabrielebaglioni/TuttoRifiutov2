// Warm immutable code, not HTML/content: admin changes must remain immediately fresh.
type WarmupView = {
  location: { href: string };
  navigator?: { connection?: { saveData?: boolean; effectiveType?: string } };
  DOMParser: typeof DOMParser;
};
type WarmupOptions = { doc?: Document; view?: WarmupView; fetchPage?: typeof fetch };
export function installNavigationWarmup({doc=document,view=window as unknown as WarmupView,fetchPage=fetch}: WarmupOptions = {}): () => void {
  const pages=new Set(),assets=new Set();
  const controllers = new Set<AbortController>();
  let disposed = false;
  const base=new URL(view.location.href);
  const routes=['/','/work','/events','/contact'];
  async function warm(path: string){
    if (disposed) return;
    const connection=view.navigator?.connection;
    if(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType||''))return;
    if(!routes.includes(path) || path===base.pathname || pages.has(path))return;
    pages.add(path);
    const controller=new AbortController();
    controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),3000);
    try {
      const response=await fetchPage(new URL(path,base).href,{signal:controller.signal,credentials:'same-origin'});
      if(!response.ok)return;
      const html=await response.text();
      if(disposed || html.length>500000)return;
      const parsed=new view.DOMParser().parseFromString(html,'text/html');
      for(const node of parsed.querySelectorAll('script[type="module"][src],link[rel="stylesheet"][href]')){
        const url=new URL(node.getAttribute('src')||node.getAttribute('href')||'',base);
        if(url.origin!==base.origin || !/^\/_astro\/[\w.-]+\.(js|css)$/.test(url.pathname) || assets.has(url.href) || assets.size>=12)continue;
        assets.add(url.href);
        const link=doc.createElement('link');
        link.rel=url.pathname.endsWith('.js')?'modulepreload':'preload';
        if(link.rel==='preload')link.as='style';
        link.href=url.href;
        doc.head.append(link);
      }
    } catch { /* Speculation never blocks a real navigation. */ }
    finally {clearTimeout(timeout);controllers.delete(controller);}
  }
  function intent(event: Event){
    const target = event.target as Element | null;
    if(target?.closest?.('.menu-toggle-btn')?.getAttribute('aria-expanded')!=='true' && target?.closest?.('.menu-toggle-btn')){
      routes.forEach(warm);return;
    }
    const link=target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self'))return;
    try {const url=new URL(link.getAttribute('href')||'',base);if(url.origin===base.origin&&!url.search)warm(url.pathname);}catch{}
  }
  for(const name of ['pointerdown','pointerover','focusin'])doc.addEventListener(name,intent,{passive:true});
  return () => {
    disposed = true;
    for (const name of ['pointerdown','pointerover','focusin']) doc.removeEventListener(name, intent);
    for (const controller of controllers) controller.abort();
    controllers.clear();
  };
}
if(typeof document!=='undefined') {
  const dispose = installNavigationWarmup();
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
}
