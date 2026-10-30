'use strict';
// A single local batch; the archive does not make browser/API calls for dates.
const fs = require('node:fs');
const {Solar} = require('../home/assets/vendor/lunar-javascript-1.7.7.js');
const astronomy = require('../home/assets/astronomy-solar.js');
const raw = fs.readFileSync(0, 'utf8');
if (Buffer.byteLength(raw) > 160000) throw new Error('Calendar date input is too large.');
const dates = JSON.parse(raw);
if (!Array.isArray(dates) || dates.length > 10000) throw new Error('Calendar dates need a bounded array.');
const result = {};
for (const value of dates) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid calendar date.');
  const [year, month, day] = value.split('-').map(Number);
  const instant = new Date(value + 'T12:00:00+08:00');
  if (!Number.isFinite(+instant) || instant.toISOString().slice(0,10) !== value) throw new Error('Invalid calendar date.');
  try {
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    const term = lunar.getJieQi() || lunar.getPrevJieQi(false).getName();
    result[value] = {
      lunar: lunar.getYearInGanZhi() + '年' + lunar.getMonthInChinese() + '月' + lunar.getDayInChinese(),
      term, moon: astronomy.moonPhase(instant).name,
    };
  } catch (_) {
    result[value] = null;
  }
}
process.stdout.write(JSON.stringify(result));
