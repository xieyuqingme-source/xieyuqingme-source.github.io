"""Small isolated SSR fixtures for World; no unified build, feed or browser."""
from copy import deepcopy
from datetime import datetime, timedelta
from hashlib import sha256
from html import escape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import news_archive as archive
import news_snapshot as news
import world_archive as world
import world_pages as pages


ROOT = Path(__file__).resolve().parent.parent
NOW = datetime(2026, 10, 31, 0, tzinfo=news.UTC)
if os.environ.get('WORLD_ARCHIVE_TEST_TEMP'):
    tempfile.tempdir = os.environ['WORLD_ARCHIVE_TEST_TEMP']
    Path(tempfile.tempdir).mkdir(parents=True, exist_ok=True)


def config_and_snapshot():
    sources, items = [], []
    for index in range(12):
        category = news.CATEGORIES[index % 4]
        source = dict(id='fixture-' + str(index), publisher='publisher-' + str(index), name='Source ' + str(index),
                      category=category, lang='en', feed_url='https://www.bbc.com/feed/' + str(index),
                      home_url='https://www.bbc.com/', docs_url='https://www.bbc.com/docs', article_hosts=['www.bbc.com'])
        sources.append(source)
        for number in range(2):
            url = 'https://www.bbc.com/story/' + str(index) + '/' + str(number) + '?id=12&dep=P'
            items.append(dict(id='news-' + sha256(news.url_key(url).encode()).hexdigest()[:20], category=category,
                              title='Original & exact headline ' + str(index) + '-' + str(number), source=source['name'],
                              source_id=source['id'], published=news._stamp(NOW - timedelta(hours=1)), lang='en', url=url))
    config = dict(version=2, max_items=24, max_per_source=2, max_per_publisher=2, max_age_hours=72,
                  sources=sources, collect_ids=[source['id'] for source in sources])
    return config, dict(version=1, collected_at=news._stamp(NOW), items=items)


def source_record(identifier, *, domain='international', kind='official', status='approved', languages=None):
    return dict(id=identifier, name=identifier + ' public source', domain=domain, type=kind,
                url='https://www.bbc.com/', languages=languages or ['zh-CN', 'en'], region='公开来源',
                reason='查看一手发布与更正说明。', access='点击来源后访问原站；部分地区可能受限。',
                checked='2026-10-31', status=status, collect=False,
                official_links=[dict(label='官方说明', url='https://www.bbc.com/docs')], feeds=[])


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements, self.scripts, self.current = [], {}, None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if tag == 'script' and attrs.get('id'):
            self.current = attrs['id']
            self.scripts[self.current] = ''

    def handle_data(self, data):
        if self.current:
            self.scripts[self.current] += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.current = None


class WorldPageTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='world-pages-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root, self.output, self.archive_root = self.base / 'repo', self.base / 'output', self.base / 'data'
        (self.root / 'home/assets').mkdir(parents=True)
        shutil.copy2(ROOT / 'home/world.template.html', self.root / 'home/world.template.html')
        (self.root / 'home/assets/world.js').write_text('/* isolated local World fixture */', encoding='utf-8')
        (self.root / 'home/assets/world.css').write_text('.world-page{max-width:70rem}', encoding='utf-8')
        self.config, self.snapshot = config_and_snapshot()
        self.catalog = dict(version=1, sources=[source_record('official-source'), source_record('media-source', kind='media', domain='science'),
                                               source_record('draft-personal', kind='personal', status='draft')])
        self.calendar = {'2026-10-30': dict(lunar='农历示例', term='霜降示例', moon='残月示例')}

    def write_day(self, stamp, count=1, *, failed=False):
        collected = news.timestamp(stamp + 'T12:00:00Z')
        entries = [archive.archive_item(dict(title='Archive original ' + stamp + '-' + str(index),
                                             url='https://www.bbc.com/archive/' + stamp + '/' + str(index),
                                             published=news._stamp(collected - timedelta(hours=1))), self.config['sources'][0], collected)
                   for index in range(count)]
        report = [dict(source_id=self.config['sources'][0]['id'], status='failed' if failed else 'ok',
                       received=count, eligible=count, archived=count, reason='TimeoutError' if failed else None)]
        run = archive.make_capture(entries, report, collected, [i['id'] for i in entries][:8] if entries else None)['run']
        run['archive_result'] = dict(stored_ids=[i['id'] for i in entries], frozen_ids=[])
        data = archive.empty_day(stamp)
        data.update(items=entries, runs=[run])
        target = self.archive_root / archive.relative_path(stamp)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.day_bytes(data))
        return data

    def build(self, store=None, **kwargs):
        store = world.load_archive(self.archive_root, now=NOW) if store is None else store
        return pages.build_world(self.root, self.output, 'https://public.test', self.snapshot, self.config,
                                 self.catalog, store, calendar_meta=self.calendar, now=NOW, **kwargs)

    def read(self, route):
        return (self.output / route.strip('/') / 'index.html').read_text(encoding='utf-8')

    def test_chinese_only_seo_shared_runtime_and_exact_local_asset_copy(self):
        self.write_day('2026-10-30')
        report = self.build()
        self.assertEqual(set(report['routes']), {'/world/', '/world/sources/', '/world/2026/10/', '/world/2026/10/30/'})
        for route in report['routes']:
            html = self.read(route)
            parsed = Elements(html)
            self.assertNotIn('{{', html)
            self.assertIn('<html lang="zh-CN"', html)
            self.assertIn('class="world-page container"', html)
            self.assertIn('data-world', html)
            self.assertIn('id="site-i18n-data"', html)
            self.assertNotIn('/en/world', html)
            self.assertEqual([attrs['href'] for tag, attrs in parsed.elements if tag == 'link' and attrs.get('rel') == 'canonical'], ['https://public.test' + route])
            self.assertEqual([attrs['content'] for tag, attrs in parsed.elements if tag == 'meta' and attrs.get('property') == 'og:url'], ['https://public.test' + route])
            self.assertIn('/assets/share-cover.png', html)
            self.assertTrue(any(tag == 'meta' and attrs.get('name') == 'description' and attrs.get('content') for tag, attrs in parsed.elements))
        for name in ('world.js', 'world.css'):
            self.assertEqual((self.output / 'assets' / name).read_bytes(), (self.root / 'home/assets' / name).read_bytes())
        self.assertFalse((self.output / 'en/world').exists())

    def test_today_keeps_24_original_headlines_in_four_groups_and_real_check_time(self):
        self.build()
        html = self.read('/world/')
        self.assertEqual(html.count('class="world-news"'), 24)
        for item in self.snapshot['items']:
            self.assertIn(escape(item['title']), html)
            self.assertIn(escape(item['url'], quote=True), html)
        self.assertEqual(html.count('class="world-news-group"'), 4)
        self.assertIn('最近检查：2026-10-31 08:00 +08:00', html)
        self.assertIn('页面日期：<time id="world-today-date" datetime="2026-10-31">2026年10月31日 · 北京时间</time>', html)
        self.assertIn('合计最多24条', html)
        self.assertNotIn('最重要的', html)
        self.assertNotIn('当前保留旧来源配置的快照', html)
        self.config = deepcopy(self.config)
        self.config['collect_ids'].remove(self.config['sources'][0]['id'])
        self.build()
        historical = self.read('/world/')
        self.assertIn('当前保留旧来源配置的快照；新采集成功后会替换。', historical)
        for item in self.snapshot['items']:
            self.assertIn(escape(item['title']), historical)
            self.assertIn(escape(item['url'], quote=True), historical)
        self.assertIn('最近检查：2026-10-31 08:00 +08:00', historical)

    def test_missing_archive_does_not_fabricate_daily_or_monthly_pages(self):
        report = self.build()
        self.assertEqual(set(report['routes']), {'/world/', '/world/sources/'})
        html = self.read('/world/')
        self.assertIn('存档暂不可用', html)
        self.assertNotIn('<h3>一年前的今天</h3>', html)
        manifest = json.loads(Elements(html).scripts['world-search-months'])
        self.assertEqual(manifest, dict(version=1, months=[], default_month=''))
        self.assertFalse((self.output / 'world/2026').exists())

    def test_real_empty_failure_day_and_missing_calendar_date_are_different(self):
        self.write_day('2026-10-30', 0, failed=True)
        self.build()
        daily, month = self.read('/world/2026/10/30/'), self.read('/world/2026/10/')
        self.assertIn('当日自动采集全部失败', daily)
        self.assertIn('本日文件没有标题', daily)
        self.assertIn('<td>失败（TimeoutError）</td>', daily)
        self.assertIn('class="world-table-scroll" tabindex="0" aria-label="各来源真实采集结果，可横向滚动"', daily)
        self.assertIn('data-archive-date="2026-10-30"', month)
        self.assertIn('<span class="world-day-count">0</span>', month)
        self.assertIn('<span class="world-day-count">—</span>', month)
        self.assertIn('<span aria-disabled="true">前一天暂无存档</span>', daily)
        self.assertIn('<span aria-disabled="true">后一天暂无存档</span>', daily)

    def test_complete_day_and_search_index_do_not_use_three_title_previews(self):
        data = self.write_day('2026-10-30', 20)
        report = self.build()
        daily = self.read('/world/2026/10/30/')
        self.assertEqual(daily.count('class="world-news"'), 20)
        self.assertIn('农历示例 · 霜降示例 · 残月示例', daily)
        index = json.loads((self.output / 'world/search/2026-10.json').read_text(encoding='utf-8'))
        self.assertEqual({item['id'] for item in index['items']}, {item['id'] for item in data['items']})
        self.assertEqual(report['search_months'], 1)
        self.assertIn('这些ID只记录生成的显示快照，不代表页面实际部署', daily)
        self.assertIn('当次生成快照的关联条目', daily)

    def test_oversize_month_only_disables_its_search_and_preserves_all_day_titles(self):
        self.write_day('2026-10-30', 10)
        store = world.load_archive(self.archive_root, now=NOW)
        data = world.month_search_index(store, '2026-10')
        exact_bytes = len((json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
        with patch.object(pages, 'MAX_SEARCH_BYTES', exact_bytes):
            self.assertEqual(self.build(store)['search_months'], 1)
        with patch.object(pages, 'MAX_SEARCH_BYTES', exact_bytes - 1):
            report = self.build(store)
        self.assertEqual(report['search_unavailable'], ['2026-10'])
        self.assertEqual(self.read('/world/2026/10/30/').count('class="world-news"'), 10)
        self.assertIn('超过32 MiB上限', self.read('/world/'))
        unavailable = json.loads((self.output / 'world/search/2026-10.json').read_text(encoding='utf-8'))
        self.assertFalse(unavailable['available'])
        self.assertEqual(unavailable['items'], [])
        self.assertEqual(json.loads(Elements(self.read('/world/')).scripts['world-search-months'])['months'], [])

    def test_source_directory_exposes_only_approved_cards_with_filter_contract_and_no_empty_personal_type(self):
        self.build()
        html = self.read('/world/sources/')
        parsed = Elements(html)
        cards = [attrs for tag, attrs in parsed.elements if tag == 'article' and 'data-source-card' in attrs]
        self.assertEqual(len(cards), 2)
        self.assertTrue(all(attrs['data-languages'] == 'zh-CN en' for attrs in cards))
        self.assertNotIn('draft-personal', html)
        self.assertNotIn('value="personal"', html)
        self.assertNotIn('data-type="personal"', html)
        self.assertIn('data-source-directory', html)
        self.assertIn('data-source-filters hidden', html)
        self.assertIn('data-source-count', html)
        self.assertIn('data-source-empty hidden', html)
        for name in ('domain', 'type', 'language'):
            self.assertIn('name="' + name + '"', html)
        self.assertIn('type="reset"', html)
        self.assertEqual(sum(tag == 'div' and 'data-source-cell' in attrs for tag, attrs in parsed.elements), 2)

    def test_exact_year_ago_section_is_conditional_and_recent_window_does_not_fill_old_gaps(self):
        self.write_day('2025-10-31', 4)
        self.write_day('2026-10-01', 1)
        self.build()
        html = self.read('/world/')
        self.assertIn('<h3>一年前的今天</h3>', html)
        self.assertIn('最近7个北京日尚无存档', html)
        self.assertNotIn('/world/2026/10/01/', html)

    def test_legacy_annotation_and_fallback_are_readable_without_scripts_and_do_not_replace_primary_title(self):
        collected = news.timestamp('2026-10-27T12:00:00Z')
        source = self.config['sources'][0]
        primary = archive.archive_item(dict(title='Primary original headline', url='https://www.bbc.com/annotated', published='2026-10-27T11:00:00Z'), source, collected)
        legacy_source = {**source, 'id': 'legacy-bbc', 'publisher': 'legacy-bbc', 'lang': 'zh-CN'}
        legacy = archive.archive_item(dict(title='旧手工标题', url=primary['url'], published=None), legacy_source, NOW, origin='legacy-manual')
        legacy.update(archive_date='2026-10-27', date_basis='legacy-edition', legacy=dict(edition_date='2026-10-27', entries=[dict(id='old-id', title='旧手工标题', title_en='Legacy editorial title', published_original='2026-10-26')]))
        merged = archive.merge_item(primary, legacy)
        data = archive.empty_day('2026-10-27')
        data.update(items=[merged], runs=[])
        target = self.archive_root / archive.relative_path(data['date'])
        target.parent.mkdir(parents=True)
        target.write_bytes(archive.day_bytes(data))
        self.build()
        html = self.read('/world/2026/10/27/')
        self.assertIn('Primary original headline', html)
        self.assertIn('旧人工样刊旁证', html)
        self.assertIn('Legacy editorial title', html)
        self.assertIn('2026-10-26', html)
        self.assertIn('按当前北京日期已冻结', html)
        self.assertIn('没有该日运行记录', html)
        self.assertIn('<details class="world-provenance">', html)

    def test_source_and_output_path_safety_and_offline_boundary(self):
        with self.assertRaises(ValueError):
            pages.source_path(self.root, '../outside')
        with self.assertRaises(ValueError):
            pages._destination(self.output, '../outside')
        with patch.object(Path, 'is_symlink', return_value=True), self.assertRaises(ValueError):
            self.build()
        self.assertFalse(self.output.exists())
        self.write_day('2026-10-30')
        with patch.object(socket, 'getaddrinfo') as dns, patch.object(subprocess, 'run') as process, patch.object(news, 'fetch_feed') as fetch:
            self.build()
            dns.assert_not_called()
            process.assert_not_called()
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
