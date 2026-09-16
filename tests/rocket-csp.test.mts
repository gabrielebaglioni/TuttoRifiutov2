import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCompiledWorker } from './compiled-worker.mts';
import {parseHTML} from 'linkedom';

test('packaged CSP allows validated runtime palette attributes without allowing inline scripts',async()=>{
  const worker = await loadCompiledWorker();
  for(const path of ['/','/admin','/events']) {
    const response=await worker.fetch(new Request(`https://site.test${path}`),{ASSETS:{fetch:async()=>new Response('',{status:404})}},{});
    const {document}=parseHTML(await response.text());
    const policy=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
    assert.ok(policy);
    const directives=new Map(policy.split(';').map(part=>part.trim().split(/\s+/)).map(([key,...values])=>[key,values]));
    const styles=directives.get('style-src-attr')??directives.get('style-src')??directives.get('default-src');
    assert.ok(styles);
    assert.ok(styles.includes("'unsafe-inline'"),`${path}: runtime palette attributes are blocked`);
    const scripts=directives.get('script-src')??directives.get('default-src');
    assert.ok(scripts);
    assert.ok(!scripts.includes("'unsafe-inline'")&&!scripts.includes("'unsafe-eval'"));
  }
});
