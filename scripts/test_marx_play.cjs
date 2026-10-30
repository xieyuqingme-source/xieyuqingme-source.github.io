const test=require('node:test'),assert=require('node:assert/strict');
const {makeRound,gradeAnswer,roundSummary}=require('../home/assets/marx-play.js');
const {createDeck}=require('../home/assets/marx.js');
test('ten-question rounds have no repeats, preserve answers and leave inputs intact',()=>{const pool=Array.from({length:16},(_,i)=>({id:'q-'+i,choices:['a','b','c'],answer:'b'}));const before=JSON.stringify(pool);const round=makeRound(pool,()=>0.371);assert.equal(round.length,10);assert.equal(new Set(round.map(q=>q.id)).size,10);assert.ok(round.every(q=>q.choices.includes(q.answer)));assert.equal(JSON.stringify(pool),before);assert.deepEqual(round,makeRound(pool,()=>0.371));});
test('duplicate IDs and invalid random sources fail',()=>{assert.throws(()=>makeRound([{id:'a'},{id:'a'}]));for(const bad of [-1,1,NaN,Infinity,'x'])assert.throws(()=>makeRound([{id:'a',choices:['a','b']},{id:'b',choices:['a','b']}],()=>bad));});
test('quotation decks reuse the common complete-pool cycle',()=>{const deck=createDeck([1,2,3,4],'2026-10-29',()=>0.371);let last;for(let cycle=0;cycle<5;cycle++){const items=Array.from({length:4},()=>deck.next());assert.equal(new Set(items).size,4);if(last!==undefined)assert.notEqual(items[0],last);last=items[3];}});
test('every quiz type reports correct and incorrect answers with textual option marks',()=>{
  for(const mode of ['source','author','myth']){
    const question={mode,choices:['马克思','恩格斯','马恩'],answer:'马恩'};
    const right=gradeAnswer(question,'马恩');assert.equal(right.correct,true);assert.equal(right.message,'答对了。');
    assert.deepEqual(right.labels.filter(row=>row.selected),[{choice:'马恩',selected:true,correct:true,text:'马恩 ✓ 你的答案（正确）'}]);
    assert.equal(right.labels.filter(row=>row.correct).length,1);assert.equal(right.labels.some(row=>row.text.includes('✗')),false);
    const wrong=gradeAnswer(question,'恩格斯');assert.equal(wrong.correct,false);assert.equal(wrong.message,'答错了。你选的是恩格斯，正确答案是马恩。');
    assert.equal(wrong.labels.find(row=>row.selected).text,'恩格斯 ✗ 你的答案');assert.equal(wrong.labels.find(row=>row.correct).text,'马恩 ✓ 正确答案');
    assert.deepEqual(question.choices,['马克思','恩格斯','马恩']);
  }
});
test('round scoring is transient and counts mixed, perfect and all-wrong ten-question rounds',()=>{
  const question={choices:['真','假','存疑','部分正确','张冠李戴'],answer:'存疑'};
  for(const expected of [0,1,6,10]){
    const grades=Array.from({length:10},(_,i)=>gradeAnswer(question,i<expected?'存疑':'假'));
    const correct=grades.filter(grade=>grade.correct).length;
    assert.equal(roundSummary(correct,grades.length),`本轮答对 ${expected} / 10`);
    const review=grades.filter(grade=>!grade.correct);assert.equal(review.length,10-expected);
    assert.ok(review.every(grade=>grade.chosen==='假'&&grade.answer==='存疑'));
  }
});
test('invalid choices and impossible scores cannot be graded',()=>{
  assert.throws(()=>gradeAnswer({choices:['a','b'],answer:'a'},'c'));
  assert.throws(()=>gradeAnswer({choices:['a','b'],answer:'c'},'a'));
  for(const args of [[-1,10],[11,10],[1.5,10],[0,0],[1,'10']])assert.throws(()=>roundSummary(...args));
});
