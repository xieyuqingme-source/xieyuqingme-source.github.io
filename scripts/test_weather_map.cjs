'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../home/assets/weather-map.js');
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('weather map covers the whole world without hidden coordinate offsets', () => {
  assert.deepEqual(M.project({lon:0,lat:0},600,300),[300,150]);
  assert.deepEqual(M.unproject([0,0],600,300),{lon:-180,lat:90});
  assert.deepEqual(M.unproject([600,300],600,300),{lon:-180,lat:-90});
  assert.equal(M.unproject([0,0],0,300),null);
  assert.equal(M.unproject([Infinity,0],600,300),null);
});
test('map projection inverts accurately for zoomed observers and across the date line', () => {
  for (const view of [{zoom:1},{zoom:4,lon:116.4,lat:39.9},{zoom:16,lon:179,lat:70}]) {
    for (const point of [{lon:116.4,lat:39.9},{lon:179.9,lat:-20},{lon:-179.9,lat:20}]) {
      const actual=M.unproject(M.project(point,1024,512,view),1024,512,view);
      near(actual.lat,point.lat); near(actual.lon,point.lon);
    }
  }
});
test('view clamps zoom and latitude while wrapping longitude', () => {
  assert.deepEqual(M.viewState({zoom:0,lon:361,lat:90}),{zoom:1,lon:1,lat:0});
  assert.deepEqual(M.viewState({zoom:100,lon:-181,lat:90}),{zoom:16,lon:179,lat:84.375});
  assert.deepEqual(M.viewState({zoom:NaN,lon:Infinity,lat:NaN}),{zoom:1,lon:0,lat:0});
});
test('coordinates label hemispheres explicitly in both languages', () => {
  assert.equal(M.coordinateLabel({lat:-10.5,lon:30},true),'10.50° S · 30.00° E');
  assert.equal(M.coordinateLabel({lat:39.9,lon:-74},false),'39.90° 北纬 · 74.00° 西经');
});
