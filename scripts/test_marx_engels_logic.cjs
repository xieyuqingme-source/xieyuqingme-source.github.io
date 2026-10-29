'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {beijingKey, daySeed, createDeck} = require('../home/assets/marx.js');

test('Beijing day changes at UTC16:00, including year and leap-day boundaries', () => {
  for (const [before, after, expectedBefore, expectedAfter] of [
    ['2026-10-28T15:59:59.999Z','2026-10-28T16:00:00.000Z','2026-10-28','2026-10-29'],
    ['2026-12-31T15:59:59.999Z','2026-12-31T16:00:00.000Z','2026-12-31','2027-01-01'],
    ['2028-02-28T15:59:59.999Z','2028-02-28T16:00:00.000Z','2028-02-28','2028-02-29']
  ]) {
    assert.equal(beijingKey(Date.parse(before)),expectedBefore);
    assert.equal(beijingKey(Date.parse(after)),expectedAfter);
  }
});
test('the daily opener is stable and independent of the shuffle', () => {
  const cards = Array.from({length:28},(_,i)=>({slug:'card-'+i}));
  const a=createDeck(cards,'2026-10-29',()=>0), b=createDeck(cards,'2026-10-29',()=>0.999);
  assert.equal(a.next(),b.next());
  assert.ok(Number.isInteger(daySeed('2026-10-29')));
  assert.ok(daySeed('2026-10-29')>=0);
  assert.notEqual(daySeed('2026-10-29'),daySeed('2026-10-30'));
});
test('every round visits the whole pool exactly once and never immediately repeats', () => {
  const cards = Array.from({length:28},(_,i)=>'card-'+i), snapshot=cards.slice();
  for (const random of [()=>0,()=>0.5,()=>0.999,Math.random]) {
    const deck=createDeck(cards,'2026-10-29',random);
    let previous;
    for(let round=0;round<80;round++) {
      const values=[];
      for(let i=0;i<cards.length;i++) {
        const value=deck.next();
        assert.notEqual(value,previous);
        previous=value;values.push(value);
      }
      assert.deepEqual(new Set(values),new Set(cards));
    }
  }
  assert.deepEqual(cards,snapshot);
});
test('one-card pools work and empty pools fail explicitly', () => {
  assert.throws(()=>createDeck([],'2026-10-29'));
  const deck=createDeck(['only'],'2026-10-29');
  assert.equal(deck.next(),'only');assert.equal(deck.next(),'only');
});
test('today cards need neither a request nor browser storage', () => {
  const fs=require('node:fs');
  const source=fs.readFileSync(require.resolve('../home/assets/marx.js'),'utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB)\b/);
});
