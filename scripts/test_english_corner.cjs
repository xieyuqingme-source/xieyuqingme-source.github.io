'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {READ_KEY,parseRead,chooseUnread,createReadStore}=require('../home/assets/english-corner.js');
function memory(initial={}) {
 const values=new Map(Object.entries(initial));
 return {values,failRead:false,failWrite:false,failRemove:false,
  getItem(key){if(this.failRead)throw Error('Unavailable');return values.get(key)??null;},
  setItem(key,value){if(this.failWrite)throw Error('Quota');values.set(key,String(value));},
  removeItem(key){if(this.failRemove)throw Error('Unavailable');values.delete(key);}};
}
test('read records contain only versioned valid slugs and deduplicate visits',()=>{
 assert.deepEqual([...parseRead(JSON.stringify({version:1,read:['ketchup','ketchup','tea-and-cha']}))],['ketchup','tea-and-cha']);
 for(const raw of [null,'','{','null','[]','{}','{"version":"1","read":[]}','{"version":1,"read":["../../private"]}','{"version":1,"read":["https://example.com"]}','{"version":1,"read":[3]}','{"version":1,"read":[],"extra":1}'])assert.equal(parseRead(raw).size,0,String(raw));
 assert.equal(parseRead(JSON.stringify({version:1,read:Array.from({length:513},(_,i)=>'card-'+i)})).size,0);
});
test('random choice always prefers unread cards when any remain',()=>{
 const cards=['ketchup','tea-and-cha','ok'],read=new Set(['ketchup','ok']);
 for(let i=0;i<=100;i++)assert.equal(chooseUnread(cards,read,()=>i/100),'tea-and-cha');
});
test('all-read pool remains usable; empty filters have no random target',()=>{
 const cards=['ketchup','tea-and-cha'];
 assert.equal(chooseUnread(cards,new Set(cards),()=>0),'ketchup');
 assert.equal(chooseUnread(cards,new Set(cards),()=>.99),'tea-and-cha');
 assert.equal(chooseUnread([],new Set()),null);
});
test('injected random boundary values cannot produce an invalid target',()=>{
 const cards=['ketchup','tea-and-cha'];
 for(const n of [-1,0,.999,1,2,NaN,Infinity])assert(cards.includes(chooseUnread(cards,new Set(),()=>n)));
});
test('visit writes only its own key and preserves previous read cards',()=>{
 const db=memory({'site-theme':'dark',[READ_KEY]:JSON.stringify({version:1,read:['ketchup']})}),store=createReadStore(db);
 assert.equal(store.available,true);assert.equal(store.add('tea-and-cha'),true);assert.equal(store.add('tea-and-cha'),true);
 assert.deepEqual([...store.reload()],['ketchup','tea-and-cha']);assert.equal(db.values.get('site-theme'),'dark');
 assert.deepEqual([...db.values.keys()].sort(),[READ_KEY,'site-theme'].sort());
});
test('clear removes the read key without touching other site preferences',()=>{
 const db=memory({'site-theme':'dark',[READ_KEY]:JSON.stringify({version:1,read:['ketchup']})}),store=createReadStore(db);
 assert(store.clear());assert.equal(store.reload().size,0);assert.equal(db.values.has(READ_KEY),false);assert.equal(db.values.get('site-theme'),'dark');
});
test('unavailable storage and a blocked write probe are graceful',()=>{
 assert.equal(createReadStore(undefined).available,false);
 const read=memory();read.failRead=true;assert.equal(createReadStore(read).available,false);
 const write=memory();write.failWrite=true;const store=createReadStore(write);assert.equal(store.available,false);assert.equal(store.add('ketchup'),false);
});
test('quota on a later visit preserves the old saved record and disables marks',()=>{
 const original=JSON.stringify({version:1,read:['ketchup']}),db=memory({[READ_KEY]:original}),store=createReadStore(db);
 db.failWrite=true;assert.equal(store.add('tea-and-cha'),false);assert.equal(store.available,false);assert.equal(db.values.get(READ_KEY),original);
});
test('blocked clear or later read does not throw or erase the old record',()=>{
 const original=JSON.stringify({version:1,read:['ketchup']}),db=memory({[READ_KEY]:original}),store=createReadStore(db);
 db.failRemove=true;assert.equal(store.clear(),false);assert.equal(store.available,false);assert.equal(db.values.get(READ_KEY),original);
 const other=memory({[READ_KEY]:original}),second=createReadStore(other);other.failRead=true;assert.equal(second.reload().size,0);assert.equal(second.available,false);
});
test('invalid visit slugs cannot change saved records',()=>{
 const db=memory(),store=createReadStore(db);
 for(const slug of ['../outside','a','/english/ketchup/','<script>',null,3])assert.equal(store.add(slug),false);
 assert.equal(db.values.has(READ_KEY),false);
});
test('another tab record is reloaded and large valid histories remain bounded',()=>{
 const db=memory(),store=createReadStore(db);db.values.set(READ_KEY,JSON.stringify({version:1,read:['tea-and-cha']}));
 assert.deepEqual([...store.reload()],['tea-and-cha']);
 db.values.set(READ_KEY,JSON.stringify({version:1,read:Array.from({length:512},(_,i)=>'card-'+i)}));
 assert(store.add('new-card'));assert.equal(store.reload().size,512);assert(store.reload().has('new-card'));
});
