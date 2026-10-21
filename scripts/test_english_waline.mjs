// Local API/client mocks: English pages must reuse the original Chinese identity.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'blog/waline-integration.js'), 'utf8');
const { startWaline } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
async function setup(preview = false, list = false) {
  const original = '/articles/%E4%B8%AD%E6%96%87/test%20%26%20title.html';
  const node = () => ({ hidden: true, dataset: {} });
  const stats = node(); stats.dataset.statsPath = original;
  const counters = {};
  for (const kind of ['views', 'comments']) { const counter = node(), value = { textContent: '' }; counter.querySelector = () => value; counters[kind] = counter; }
  stats.querySelector = selector => counters[selector.includes('views') ? 'views' : 'comments'];
  const comments = list ? null : node();
  if (comments) comments.dataset.articlePath = original;
  const settings = { enabled: true, backendVerified: true, serverURL: 'https://comments.test', hostingProvider: 'Test host', databaseProvider: 'Test database', siteOrigin: 'https://site.test', clientJS: '/articles/assets/waline/waline.js', clientCSS: '/articles/assets/waline/waline.css' };
  const document = { documentElement: { lang: 'en' }, querySelector: selector => selector === '#waline-settings' ? { textContent: JSON.stringify(settings) } : selector === '#article-comments' ? comments : null, querySelectorAll: () => [stats] };
  const calls = [], mounted = [];
  await startWaline({ document, location: new URL((preview ? 'http://127.0.0.1:8767' : 'https://site.test') + '/en/articles/test%20%26%20title.html?tracking=1#section'),
    fetch: async (address, request) => {
      const url = new URL(address); calls.push({ url, ...request });
      const data = url.pathname.endsWith('/article') ? [{ time: 7 }] : url.searchParams.get('type') === 'count' ? [2] : { data: [], count: 0 };
      return { ok: true, json: async () => ({ errno: 0, data }) };
    }, loadClient: async () => ({ init: config => mounted.push(config) }), loadStyles: async () => {} });
  return { calls, mounted, comments };
}
const article = await setup();
const posts = article.calls.filter(call => call.method === 'POST');
assert.equal(posts.length, 1);
assert.equal(JSON.parse(posts[0].body).path, '/articles/中文/test %26 title.html');
assert(article.calls.every(call => call.url.searchParams.get('lang') === 'en'));
assert(article.calls.every(call => !call.url.href.includes('/en/articles/')));
assert.equal(article.mounted[0].lang, 'en');
assert.equal(article.mounted[0].path, '/articles/中文/test %26 title.html');
assert.equal(article.mounted[0].pageview, false);
assert.equal(article.mounted[0].comment, false);
assert(article.mounted[0].locale.placeholder.startsWith('Leave a comment.'));
assert.equal(article.comments.hidden, false);
const preview = await setup(true);
assert(preview.calls.every(call => call.method === 'GET'));
const directory = await setup(false, true);
assert(directory.calls.every(call => call.method === 'GET'));
assert.equal(directory.mounted.length, 0);
console.log(JSON.stringify({ success: true, checks: ['One English visit increments the exact original path once', 'English client and API locale', 'No English discussion identity or duplicate client counters', 'Local previews and directories only read counts'] }, null, 2));
