import test from 'node:test';
import assert from 'node:assert/strict';

test('grain tile is bounded, repeatable and follows foreground ink without opaque paint', async () => {
  const {grainPixels}=await import('../src/scripts/grain-background.js');
  const a=grainPixels('#123456');
  assert.equal(a.length,256*256*4);
  assert.deepEqual(a,grainPixels('#123456'));
  let painted=0;
  for(let i=0;i<a.length;i+=4){
    assert.deepEqual([...a.slice(i,i+3)],[18,52,86]);
    assert.ok(a[i+3]<=179);
    if(a[i+3]>10)painted++;
  }
  assert.ok(painted>2000 && painted<9000);
  const b=grainPixels('#abcdef');
  assert.deepEqual([...b.slice(0,3)],[171,205,239]);
});
