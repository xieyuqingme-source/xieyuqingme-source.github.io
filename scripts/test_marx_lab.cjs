'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {workingDay, reproduction, valueFormStep} = require('../home/assets/marx-lab.js');
test('the original working-day examples retain six necessary hours', () => {
  for (const [total, surplus, rate] of [[7,1,100/6],[9,3,50],[12,6,100]]) {
    const value=workingDay(total,6); assert.equal(value.valid,true); assert.equal(value.surplus,surplus); assert.ok(Math.abs(value.rate-rate)<1e-10);
  }
  assert.equal(workingDay(6,6).rate,0);
});
test('invalid working-day inputs never produce a rate or Infinity',()=>{
  for(const args of [[0,0],[7,0],[7,8],[-1,1],[25,6],[NaN,6],[Infinity,6],[1e100,6],['12',6]]) assert.equal(workingDay(...args).valid,false);
});
test('the original reproduction scheme balances and totals 9000',()=>{
  const value=reproduction([4000,1000,1000,2000,500,500]);
  assert.equal(value.valid,true); assert.equal(value.first,6000); assert.equal(value.second,3000); assert.equal(value.total,9000); assert.equal(value.balanced,true); assert.equal(value.firstRate,100);
  assert.equal(reproduction([4000,1000,1001,2000,500,500]).balanced,false);
  assert.equal(reproduction([0,0,0,0,0,0]).firstRate,null);
  assert.equal(reproduction([0,0.1,0.2,0.3,0,0]).balanced,true);
});
test('reproduction refuses bad dimensions, negatives, nonnumbers and extreme values',()=>{
  for(const value of [null,[],[1,2,3],[-1,1,1,1,1,1],[NaN,1,1,1,1,1],[Infinity,1,1,1,1,1],[1e13,1,1,1,1,1],['1',1,1,1,1,1]]) assert.equal(reproduction(value).valid,false);
});
test('value-form navigation has four bounded steps',()=>{
  for(let i=0;i<4;i++)assert.equal(valueFormStep(i),i);
  for(const value of [-1,4,1.5,NaN,Infinity,'1',null])assert.equal(valueFormStep(value),null);
});

test('positive subnormal denominators fail explicitly instead of overflowing',()=>{assert.equal(workingDay(24,Number.MIN_VALUE).valid,false);assert.equal(reproduction([1,Number.MIN_VALUE,1,1,1,1]).valid,false);assert.equal(reproduction([1,1,1,1,Number.MIN_VALUE,1]).valid,false);});
