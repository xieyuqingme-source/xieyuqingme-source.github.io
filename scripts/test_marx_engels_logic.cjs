'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {beijingKey, daySeed, createDeck, filterState, filterQuery, matchesFilters, legacyDirectory, mount} = require('../home/assets/marx.js');

test('the directory combines column, branch and difficulty and carries them to a return link', () => {
  const state = filterState('?branch=economics&level=2&column=terms', ['terms', 'myths', 'passage', 'between']);
  assert.deepEqual(state, {branch:'economics', level:'2', column:'terms'});
  assert.equal(matchesFilters({branch:'philosophy economics', level:'2', column:'terms'}, state), true);
  for (const row of [{branch:'philosophy', level:'2', column:'terms'}, {branch:'economics', level:'3', column:'terms'}, {branch:'economics', level:'2', column:'myths'}]) assert.equal(matchesFilters(row, state), false);
  assert.equal(filterQuery(state), '?branch=economics&level=2&column=terms');
  assert.deepEqual(filterState(filterQuery(state), ['terms']), state);
  assert.deepEqual(filterState('?branch=other&level=4&column=private', ['terms']), {branch:'all',level:'all',column:'all'});
  assert.equal(filterQuery({branch:'all',level:'all',column:'all'}), '');
});
test('legacy filtered home links move to the full directory without dropping query or fragment', () => {
  assert.equal(legacyDirectory('/marx/', '?branch=economics&level=2', '#directory'), '/marx/cards/?branch=economics&level=2#directory');
  assert.equal(legacyDirectory('/marx/', '?column=between', ''), '/marx/cards/?column=between');
  assert.equal(legacyDirectory('/marx/', '?ref=bookmark', ''), null);
  assert.equal(legacyDirectory('/marx/cards/', '?branch=economics', ''), null);
  assert.equal(legacyDirectory('/marx/', '', '#directory'), null);
});
test('legacy navigation uses the shared visit API without touching a native read-only Location method', () => {
  const nativeLocation = {pathname:'/marx/', search:'?branch=economics&level=2', hash:'#directory'};
  Object.defineProperty(nativeLocation, 'replace', {value:() => { throw new Error('Native replacement must not run'); }, writable:false, configurable:false});
  const proxiedLocation = new Proxy(nativeLocation, {get(target, key) {
    // A wrapper around native Location.replace would violate the Proxy invariant.
    if (key === 'replace') return () => {};
    return Reflect.get(target, key);
  }});
  assert.throws(() => proxiedLocation.replace, TypeError);
  const calls = [];
  assert.doesNotThrow(() => mount({querySelector:() => ({})}, {location:proxiedLocation, SiteNavigation:{visit:(...args) => calls.push(args)}}));
  assert.deepEqual(calls, [['/marx/cards/?branch=economics&level=2#directory', {replace:true}]]);
  const fallback = {pathname:'/marx/',search:'?column=terms',hash:'',href:''};
  mount({querySelector:() => ({})}, {location:fallback});
  assert.equal(fallback.href, '/marx/cards/?column=terms');
});

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
