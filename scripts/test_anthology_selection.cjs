'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { searchUrl, copyText } = require('../home/assets/anthology-selection.js');
for (const text of ['舛', '经纶世务者', 'a & b? #c / d', '“词句” <tag> "quoted"', 'first\nsecond']) {
  const url = new URL(searchUrl(text));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/search');
  assert.deepEqual([...url.searchParams.keys()], ['q']);
  assert.equal(url.searchParams.get('q'), text);
  assert.equal(url.hash, '');
}
const source = fs.readFileSync(path.join(__dirname, '../home/assets/anthology-selection.js'),'utf8');
assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);
assert.match(source, /window\.open\(searchUrl\(selectedText\), '_blank', 'noopener,noreferrer'\)/);
assert.doesNotMatch(source, /AI|anthology-lookup|contextFor/);
(async () => {
  let handler, removed = false, fallback = 0;
  const values = new Map();
  const document = {
    addEventListener(name, fn) { assert.equal(name, 'copy'); handler = fn; },
    removeEventListener(name, fn) { assert.equal(handler, fn); removed = true; },
    execCommand(name) { assert.equal(name, 'copy'); handler({ clipboardData:{setData:(type,text)=>values.set(type,text)}, preventDefault(){} }); return true; }
  };
  const navigator = { clipboard:{writeText:async value=>{fallback++; values.set('fallback',value);}} };
  await copyText('披绣闼，', document, navigator);
  assert.deepEqual([...values], [['text/plain','披绣闼，']]);
  assert.equal(fallback, 0); assert.equal(removed, true);
  document.execCommand = () => false;
  await copyText('fallback & text', document, navigator);
  assert.equal(values.get('fallback'), 'fallback & text'); assert.equal(fallback, 1);
  console.log('PASS: exact search encoding, explicit new-tab privacy, plaintext copy and clipboard fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
