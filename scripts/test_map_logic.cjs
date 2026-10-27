'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../home/assets/map-model.js');
const record = overrides => ({ id: 'first-beijing', start: '2020-09', end: '', city: '北京', region: '北京', country: '中国', lat: 39.9, lon: 116.41, title: '第一次停留', description: '完整说明。', album: '', certainty: 'approximate', ...overrides });
const doc = records => ({ version: 1, title: '测试地图', records });
const tests = [];
function test(name, action) { tests.push([name, action]); }
test('JSON and Markdown round trips preserve date precision and certainty', () => {
  const source = doc([record(), record({ id: 'return-beijing', start: '2023', end: '2024-02', certainty: 'confirmed' })]);
  assert.deepEqual(M.parse(M.json(source)), source);
  assert.deepEqual(M.parse(M.markdown(source)), source);
  assert.equal(M.range(source.records[0]), '2020-09 — 结束未知');
  assert.equal(M.range(record({ start: '', end: '' })), '日期待确认');
  assert(!M.range(source.records[0]).includes('至今'));
});
test('private maintenance document imports with strict export allowlist', () => {
  const source = { ...doc([record({ approved: false, sources: ['D:/private/note.md'], privateNote: 'PRIVATE-SENTINEL' }), { certainty: 'pending', approved: false, title: '未确认推断' }]), preview: true, notice: 'PRIVATE-NOTICE', sourceIndex: 'PRIVATE-INDEX' };
  const parsed = M.parse('来源与注释留在围栏之外。\n\n```footprints\n' + JSON.stringify(source) + '\n```\n');
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(Object.keys(parsed), ['version', 'title', 'records']);
  assert.deepEqual(Object.keys(parsed.records[0]), ['id', 'start', 'end', 'city', 'region', 'country', 'lat', 'lon', 'title', 'description', 'album', 'certainty']);
  for (const output of [M.json(parsed), M.markdown(parsed)]) for (const marker of ['PRIVATE', 'approved', 'sources', 'pending', 'sourceIndex']) assert(!output.includes(marker));
  assert.throws(() => M.validate(doc([record({ approved: 'false' })])), /approved/);
  assert.throws(() => M.validate(doc([{ certainty: 'pending', approved: true }])), /待确认/);
});
test('same-city returns remain distinct and reimport is idempotent', () => {
  const source = doc([record(), record({ id: 'return-beijing', start: '2023', title: '再次到访' })]);
  assert.equal(M.cityKey(source.records[0]), M.cityKey(source.records[1]));
  const result = M.merge(doc([]), source);
  assert.equal(result.added, 2);
  const duplicate = M.merge(result.document, M.parse(M.markdown(source)));
  assert.equal(duplicate.added, 0); assert.equal(duplicate.skipped, 2);
  assert.deepEqual(duplicate.document, source);
});
test('conflicts and invalid later records leave both inputs unchanged', () => {
  const before = doc([record()]), snapshot = JSON.stringify(before);
  const incoming = doc([record({ id: 'new-record' }), record({ title: '冲突内容' })]), incomingSnapshot = JSON.stringify(incoming);
  assert.throws(() => M.merge(before, incoming), /冲突/);
  assert.equal(JSON.stringify(before), snapshot); assert.equal(JSON.stringify(incoming), incomingSnapshot);
  assert.throws(() => M.merge(before, doc([record({ id: 'valid-first' }), record({ id: 'bad-last', lat: null })])));
  assert.equal(JSON.stringify(before), snapshot);
  assert.throws(() => M.parse(JSON.stringify(doc([record(), record()]))), /重复/);
});
test('calendar dates and partial interval bounds are validated', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001', '9999-12-31', '2020-12']) assert(M.dateBounds(date));
  for (const date of ['2023-02-29', '1900-02-29', '2024-04-31', '0000', '2024-13', '2024-00', '2024-1', '2024-01-00']) assert.throws(() => M.dateBounds(date));
  assert.doesNotThrow(() => M.validate(doc([record({ start: '2020-12-20', end: '2020' })])));
  assert.throws(() => M.validate(doc([record({ start: '2021-01', end: '2020' })])), /结束日期/);
  assert.deepEqual(M.sorted([record({ id: 'unknown', start: '' }), record({ id: 'later', start: '2024' }), record({ id: 'earlier', start: '2020' })]).map(item => item.id), ['earlier', 'later', 'unknown']);
});
test('coordinate types, unsafe albums and identifiers cannot enter records', () => {
  for (const lat of [null, '39.9', NaN, Infinity, 91]) assert.throws(() => M.validate(doc([record({ lat })])));
  for (const lon of [null, '-10', -181, Infinity]) assert.throws(() => M.validate(doc([record({ lon })])));
  for (const album of ['https://example.com/', '//example.com/', '/photos/../private/', '/photos/2invalid/', 'javascript:alert(1)', '/photos/test/?x=1']) assert.throws(() => M.validate(doc([record({ album })])));
  assert.doesNotThrow(() => M.validate(doc([record({ album: '/photos/beijing-memory/' })])));
  for (const id of ['__proto__', 'bad/id', 'a'.repeat(81), '']) assert.throws(() => M.validate(doc([record({ id })])));
});
test('plain text containing markup is preserved without interpreting it', () => {
  const attack = '<script>alert(1)</script> & <img src=x onerror=alert(1)>\n```footprints';
  const source = doc([record({ description: attack, title: '<svg onload=alert(1)>' })]);
  assert.deepEqual(M.parse(M.markdown(source)), source);
});
test('malformed Markdown and JSON fail before mutation', () => {
  for (const input of ['', '{}', '{', '```json\n{}\n```', '```footprints\n{}\n```\n```footprints\n{}\n```', JSON.stringify({ version: 2, title: 'x', records: [] })]) assert.throws(() => M.parse(input));
  assert.throws(() => M.validate(doc([null])));
});
test('document limits match builder and count UTF-8 bytes', () => {
  assert.equal(M.MAX_RECORDS, 500); assert.equal(M.MAX_BYTES, 1024 * 1024);
  assert.doesNotThrow(() => M.validate({ version: 1, title: 't'.repeat(120), records: [record({ city: 'c'.repeat(160), region: 'r'.repeat(200), country: 'c'.repeat(160), title: 't'.repeat(160), description: 'd'.repeat(12000) })] }));
  assert.throws(() => M.validate({ ...doc([]), title: 't'.repeat(121) }));
  assert.throws(() => M.validate(doc([record({ title: 't'.repeat(161) })])));
  assert.throws(() => M.validate(doc([record({ description: 'd'.repeat(12001) })])));
  assert.doesNotThrow(() => M.validate(doc(Array.from({ length: 500 }, (_, i) => record({ id: 'r-' + i })))));
  assert.throws(() => M.validate(doc(Array.from({ length: 501 }, (_, i) => record({ id: 'r-' + i })))));
  assert.throws(() => M.parse('中'.repeat(Math.ceil(M.MAX_BYTES / 3) + 1)), /1 MiB/);
});
test('bundled same-format example can be imported by visitors', () => {
  const example = fs.readFileSync(path.join(__dirname, '../map/example.md'), 'utf8');
  const parsed = M.parse(example); assert.equal(parsed.records.length, 1); assert.equal(parsed.records[0].certainty, 'approximate'); assert(!M.json(parsed).includes('approved'));
});
test('optional journey semantics round trip without changing legacy records', () => {
  const source = doc([
    record({ id: 'base', start: '2026-04-29', stayType: 'base', groupId: 'base-1', sequence: 499, ongoing: true, privateNote: 'PRIVATE-BASE', sources: ['D:/private.md'], approved: false }),
    record({ id: 'visit', start: '2026-01-01', end: '2026-01-02', stayType: 'visit', groupId: 'trip-1', sequence: 0, ongoing: false }),
    record({ id: 'legacy' })
  ]);
  const parsed = M.validate(source);
  const { privateNote, sources, approved, ...publicBase } = source.records[0];
  assert.deepEqual(parsed.records[0], publicBase);
  assert.deepEqual(parsed.records[1], source.records[1]);
  assert.deepEqual(parsed.records[2], source.records[2]);
  assert.deepEqual(M.parse(M.json(parsed)), parsed);
  assert.deepEqual(M.parse(M.markdown(parsed)), parsed);
  for (const output of [M.json(parsed), M.markdown(parsed)]) for (const marker of ['PRIVATE', 'approved', 'sources', 'privateNote']) assert(!output.includes(marker));
  assert.equal(M.range(parsed.records[0]), '2026-04-29 — 至今');
  assert.equal(M.range(parsed.records[2]), '2020-09 — 结束未知');
  const duplicate = M.merge(parsed, M.parse(M.markdown(parsed)));
  assert.equal(duplicate.added, 0); assert.equal(duplicate.skipped, 3);
});
test('optional journey semantics reject invalid values atomically', () => {
  for (const stayType of ['', 'long', 'BASE', false, null]) assert.throws(() => M.validate(doc([record({ stayType })])), /stayType/);
  for (const groupId of ['', 'bad/id', '__proto__', 'a'.repeat(81), 1, null]) assert.throws(() => M.validate(doc([record({ groupId })])), /groupId/);
  for (const sequence of [-1, 500, 1.5, '1', null, NaN, Infinity]) assert.throws(() => M.validate(doc([record({ sequence })])), /sequence/);
  for (const ongoing of [1, 'true', null]) assert.throws(() => M.validate(doc([record({ ongoing })])), /ongoing/);
  assert.throws(() => M.validate(doc([record({ ongoing: true, start: '' })])), /ongoing/);
  assert.throws(() => M.validate(doc([record({ ongoing: true, end: '2021' })])), /ongoing/);
  const before = doc([record()]), snapshot = JSON.stringify(before);
  assert.throws(() => M.merge(before, doc([record({ id: 'valid', stayType: 'visit' }), record({ id: 'invalid', sequence: 500 })])), /sequence/);
  assert.equal(JSON.stringify(before), snapshot);
});
test('same-date multi-city journeys retain supplied sequence ahead of identifiers', () => {
  const source = [record({ id: 'a-last', sequence: 2, groupId: 'trip' }), record({ id: 'z-first', sequence: 0, groupId: 'trip' }), record({ id: 'm-middle', sequence: 1, groupId: 'trip' })];
  const before = JSON.stringify(source);
  assert.deepEqual(M.sorted(source).map(item => item.id), ['z-first', 'm-middle', 'a-last']);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(M.sorted([record({ id: 'a-later', start: '2022', sequence: 0 }), record({ id: 'z-earlier', start: '2021', sequence: 499 })]).map(item => item.id), ['z-earlier', 'a-later']);
});
test('authoritative timeline table cannot silently import a stale JSON block', () => {
  const stale = M.markdown(doc([record({ description: 'OLD-JSON-SENTINEL' })]));
  const table = '| 时间 | 城市层级地点 | 描述 | 备注 |\n| --- | --- | --- | --- |\n| 2026-04-29至今 | 吉隆坡 | 读研 | 长期 |\n';
  for (const input of [table, table + '\n' + stale, stale + '\n' + table, table.replace(/^\|/gm, '').replace(/\|$/gm, '') + '\n' + stale]) {
    assert.throws(() => M.parse(input), /本地更新器.*确认城市.*过时/);
  }
  // A quoted example is not an authoritative table in the document body.
  assert.deepEqual(M.parse('~~~markdown\n' + table + '~~~\n\n' + stale), M.parse(stale));
  const description = '| 时间 | 城市层级地点 | 描述 | 备注 |\n用户原文';
  assert.equal(M.parse(M.markdown(doc([record({ description })]))).records[0].description, description);
});
test('confirmed base and trip return flags preserve only safe public semantics', () => {
  const source = doc([
    record({ id: 'confirmed-base', stayType: 'base', groupId: 'bay-area', baseReturn: true, confirmationNotes: 'PRIVATE-CONFIRMATION', approved: false }),
    record({ id: 'other-base', stayType: 'base', groupId: 'bay-area', baseReturn: false }),
    record({ id: 'visit-needs-return', stayType: 'visit', groupId: 'trip', returnAfter: true }),
    record({ id: 'visit-no-return', stayType: 'visit', returnAfter: false }),
    record({ id: 'legacy-unchanged' })
  ]);
  const validated = M.validate(source);
  const { confirmationNotes, approved, ...publicBase } = source.records[0];
  assert.deepEqual(validated.records[0], publicBase);
  assert.equal(validated.records[1].baseReturn, false);
  assert.equal(validated.records[2].returnAfter, true);
  assert.equal(validated.records[3].returnAfter, false);
  assert.deepEqual(validated.records[4], source.records[4]);
  for (const output of [M.json(validated), M.markdown(validated)]) {
    assert.deepEqual(M.parse(output), validated);
    for (const marker of ['PRIVATE', 'confirmationNotes', 'approved']) assert(!output.includes(marker));
  }
  assert.equal(M.merge(validated, M.parse(M.markdown(validated))).skipped, 5);
});
test('confirmed return flags require booleans and explicit matching stay type', () => {
  for (const key of ['baseReturn', 'returnAfter']) {
    for (const value of ['true', 'false', 1, 0, null, [], {}]) assert.throws(() => M.validate(doc([record({ [key]: value })])), new RegExp(key));
    assert.throws(() => M.validate(doc([record({ [key]: true })])), new RegExp(key));
    assert.doesNotThrow(() => M.validate(doc([record({ [key]: false })])));
  }
  assert.throws(() => M.validate(doc([record({ stayType: 'visit', baseReturn: true })])), /baseReturn/);
  assert.throws(() => M.validate(doc([record({ stayType: 'base', returnAfter: true })])), /returnAfter/);
  const before = doc([record()]), snapshot = JSON.stringify(before);
  assert.throws(() => M.merge(before, doc([record({ id: 'valid', stayType: 'base', baseReturn: true }), record({ id: 'bad', stayType: 'base', returnAfter: true })])), /returnAfter/);
  assert.equal(JSON.stringify(before), snapshot);
});
test('public references survive JSON, Markdown and atomic merge without entering video text', () => {
  const references = [{label:'公开人物年谱 · Biography',url:'https://www.example.org/biography?edition=1#timeline'}];
  const source = doc([record({references, sources:['D:/private/research.md'], privateNote:'PRIVATE-SOURCE'})]);
  const expected = M.validate(source), before = JSON.stringify(source);
  assert.deepEqual(expected.records[0].references,references);
  for (const output of [M.json(source),M.markdown(source)]) {
    assert.deepEqual(M.parse(output),expected);
    assert(!output.includes('PRIVATE-SOURCE')); assert(!output.includes('private/research'));
  }
  const merged = M.merge(doc([record({id:'existing'})]),source);
  assert.equal(merged.added,1); assert.deepEqual(merged.document.records[1].references,references);
  assert.equal(M.merge(merged.document,source).skipped,1);
  assert.equal(JSON.stringify(source),before);
  const journey = require('../home/assets/map-journey.js').plan(expected.records);
  assert(journey.segments.some(segment=>segment.pageText.includes(source.records[0].description)));
  for (const segment of journey.segments) for (const reference of references) {
    assert(!segment.pageText.includes(reference.label)); assert(!segment.pageText.includes(reference.url));
  }
  assert.equal(expected.records[0].description,source.records[0].description);
});

test('references reject unsafe URLs, local paths, controls and malformed arrays', () => {
  const valid = {label:'Museum timeline',url:'https://museum.example.org/timeline'};
  for (const url of ['http://museum.example.org','https://user:pass@museum.example.org','https://@museum.example.org','https://localhost/a','https://host/a','https://host.local/a','https://host.internal/a','https://host.lan/a','https://host.home/a','https://host.test/a','https://host.invalid/a','https://host.onion/a','https://127.0.0.1/a','https://192.168.1.1/a','https://[::1]/a','https://2130706433/a','https://0177.0.0.1/a','https://museum.example.org:8080/a','https://museum.example.org/a%0Ab','https://museum.example.org/a\nb','https://museum.example.org/hello world','https://museum.example.org\\@localhost/a','https:////museum.example.org/a','file:///C:/research.md','javascript:alert(1)']) {
    assert.equal(M.publicReferenceUrl(url),false,url);
    assert.throws(()=>M.validate(doc([record({references:[{...valid,url}]})])),/来源/);
  }
  for (const references of [null,{},[],Array(7).fill(valid),[null],[{...valid,privateNote:'x'}],[{url:valid.url}],[{...valid,label:''}],[{...valid,label:'a'.repeat(121)}],[{...valid,label:'<b>source</b>'}],[{...valid,label:'Line\nbreak'}],[{...valid,label:'\tlabel'}],[{...valid,label:'C:\\private\\note.md'}],[{...valid,label:'/home/private/note.md'}],[{...valid,label:'/mnt/private/note.md'}]]) {
    assert.throws(()=>M.validate(doc([record({references})])),/来源|label/);
  }
  assert.doesNotThrow(()=>M.validate(doc([record({references:Array(6).fill(valid)})])));
  assert(M.publicReferenceUrl('https://museum.example.org:443/文献?part=一'));
  const source=doc([record()]), before=JSON.stringify(source);
  assert.throws(()=>M.merge(source,doc([record({id:'valid'}),record({id:'unsafe',references:[{...valid,url:'https://localhost/a'}]})])));
  assert.equal(JSON.stringify(source),before);
});

const personEntry = (id='sample-person',count=1) => ({id,label:{'zh-CN':'示例人物',en:'Sample person'},coverage:{'zh-CN':'仅收录已核对的城市。',en:'Verified cities only.'},record_count:count,document_url:'/assets/footprints-people/'+id+'.json',markdown:'/assets/footprints-people/'+id+'.md'});
const personBundle = (id='sample-person') => ({version:1,id,documents:{'zh-CN':doc([record({id:'person-sample-001',sequence:0,references:[{label:'人物年谱',url:'https://museum.example.org/biography'}]})]),en:{version:1,title:'Sample footprints',records:[record({id:'person-sample-001',city:'Beijing',region:'Beijing',country:'China',title:'A verified stay',description:'English biography.',sequence:0,references:[{label:'Biography',url:'https://museum.example.org/biography'}]})]}},sources:[{label:'Institutional biography',url:'https://museum.example.org/biography'}]});
test('person catalogue accepts generic local assets and rejects ambiguous or remote destinations', () => {
  const original={version:1,people:[personEntry(),personEntry('another-person',0)]},snapshot=JSON.stringify(original);
  const catalogue=M.peopleManifest(original);
  assert.deepEqual(catalogue,original); assert.notEqual(catalogue.people[0],original.people[0]);
  assert.equal(JSON.stringify(original),snapshot);
  for (const patch of [{id:'../sample-person'},{id:'__proto__'},{document_url:'https://example.org/sample-person.json'},{document_url:'/assets/footprints-people/another-person.json'},{markdown:'/assets/footprints-people/../sample-person.md'},{record_count:-1},{record_count:501},{record_count:'1'},{label:{'zh-CN':'缺失英文'}},{coverage:{'zh-CN':'<script>',en:'Text'}}]) assert.throws(()=>M.peopleManifest({version:1,people:[{...personEntry(),...patch}]}));
  assert.throws(()=>M.peopleManifest({version:1,people:[personEntry(),personEntry()]}));
  assert.throws(()=>M.peopleManifest({version:2,people:[]}));
});

test('person bundles validate both language documents before import and preserve source order and unknown dates', () => {
  const entry=M.peopleManifest({version:1,people:[personEntry()]}).people[0],source=personBundle(),before=JSON.stringify(source);
  for (const language of ['zh-CN','en']) {source.documents[language].records[0].start='';source.documents[language].records[0].end='';source.documents[language].records[0].certainty='approximate';}
  const bundle=M.personBundle(source,entry);
  assert.equal(bundle.documents.en.records[0].description,'English biography.');
  assert.equal(bundle.documents.en.records[0].start,''); assert.equal(bundle.documents.en.records[0].sequence,0);
  assert.deepEqual(bundle.sources,source.sources);
  assert.notEqual(bundle.documents.en,source.documents.en);
  const snapshot=JSON.stringify(source);
  for (const alter of [value=>value.id='another-person',value=>delete value.documents.en,value=>value.documents.en.records=[],value=>value.documents.en.records[0].lat=40,value=>value.documents.en.records[0].start='2024',value=>value.documents.en.records[0].sequence=1,value=>value.documents.en.records[0].references[0].url='http://example.org',value=>value.sources=[{label:'Unsafe',url:'https://localhost/'}]]) {
    const invalid=JSON.parse(snapshot);alter(invalid);assert.throws(()=>M.personBundle(invalid,entry));
  }
  assert.equal(JSON.stringify(source),snapshot); assert.notEqual(before,snapshot);
});

let failed = 0;
for (const [name, action] of tests) { try { action(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name); console.error(error.stack); } }
console.log(`${tests.length - failed}/${tests.length} map logic checks passed.`);
process.exitCode = failed ? 1 : 0;
