// Warm immutable code, not HTML/content: admin changes must remain immediately fresh.
export function installNavigationWarmup({doc=document,view=window,fetchPage=fetch}={}) {
  const pages=new Set(),assets=new Set();
  const base=new URL(view.location.href);
  const routes=['/','/work','/events','/contact'];
  async function warm(path){
    const connection=view.navigator?.connection;
    if(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType||''))return;
    if(!routes.includes(path) || path===base.pathname || pages.has(path))return;
    pages.add(path);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),3000);
    try {
      const response=await fetchPage(new URL(path,base).href,{signal:controller.signal,credentials:'same-origin'});
      if(!response.ok)return;
      const html=await response.text();
      if(html.length>500000)return;
      const parsed=new view.DOMParser().parseFromString(html,'text/html');
      for(const node of parsed.querySelectorAll('script[type="module"][src],link[rel="stylesheet"][href]')){
        const url=new URL(node.getAttribute('src')||node.getAttribute('href'),base);
        if(url.origin!==base.origin || !/^\/_astro\/[\w.-]+\.(js|css)$/.test(url.pathname) || assets.has(url.href) || assets.size>=12)continue;
        assets.add(url.href);
        const link=doc.createElement('link');
        link.rel=url.pathname.endsWith('.js')?'modulepreload':'preload';
        if(link.rel==='preload')link.as='style';
        link.href=url.href;
        doc.head.append(link);
      }
    } catch { /* Speculation never blocks a real navigation. */ }
    finally {clearTimeout(timeout);}
  }
  function intent(event){
    if(event.target.closest?.('.menu-toggle-btn')?.getAttribute('aria-expanded')!=='true' && event.target.closest?.('.menu-toggle-btn')){
      routes.forEach(warm);return;
    }
    const link=event.target.closest?.('a[href]');
    if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self'))return;
    try {const url=new URL(link.getAttribute('href'),base);if(url.origin===base.origin&&!url.search)warm(url.pathname);}catch{}
  }
  for(const name of ['pointerdown','pointerover','focusin'])doc.addEventListener(name,intent,{passive:true});
}
if(typeof document!=='undefined')installNavigationWarmup();
