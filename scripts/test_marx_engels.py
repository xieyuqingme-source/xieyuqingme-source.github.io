"""Offline provenance, negative-schema and publication checks for Read Marx & Engels."""
from collections import Counter
from copy import deepcopy
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit
import json
import sys
import unittest
import xml.etree.ElementTree as ET

from marx_engels import (AI_NOTE, ASSETS, BASIS, INTRO, HEADINGS, BRANCHES, load_marx_engels,
                        validate_wenji, validate_capital, validate_citations, validate_catalog,
                        validate_qa, quotation_budgets, source_url, source_path, text_hash,
                        markdown_sections, build_marx_engels)
from marx_engels import LEVELS, RESERVED
from marx_render import (LEVEL_NOTE, bookcase, day_seed, render_capital_index, render_capital_volume, render_content,
                         render_index, render_qa_index, render_sources, render_wenji_volume)
from site_i18n import FEATURES, localized_path

ROOT = Path(__file__).resolve().parent.parent
PUBLICATION = '--publication' in sys.argv
if PUBLICATION:
    sys.argv.remove('--publication')


def read(name):
    return json.loads((ROOT / 'marx-engels' / (name + '.json')).read_text(encoding='utf-8'))


class Tags(HTMLParser):
    def __init__(self, value):
        super().__init__()
        self.nodes = []
        self.feed(value)

    def handle_starttag(self, tag, attributes):
        self.nodes.append((tag, dict(attributes)))


class BibliographyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.wenji, cls.capital = read('wenji'), read('capital')
        cls.works = validate_wenji(cls.wenji)
        cls.chapters = validate_capital(cls.capital, cls.works)

    def test_ten_volumes_and_actual_work_counts(self):
        self.assertEqual([v['no'] for v in self.wenji['volumes']], list(range(1, 11)))
        self.assertEqual([len(v['works']) for v in self.wenji['volumes'][:4]], [15, 25, 28, 26])
        self.assertEqual(sum(w.get('kind') == 'appendix' for w in self.wenji['volumes'][2]['works']), 3)
        self.assertEqual(sum(w.get('kind') == 'appendix' for w in self.wenji['volumes'][3]['works']), 1)
        self.assertEqual(self.wenji['edition']['compiler'], '中共中央马克思恩格斯列宁斯大林著作编译局')
        self.assertEqual(self.wenji['edition']['year'], 2009)

    def test_full_letters_and_timeline_are_distinct(self):
        volume = self.wenji['volumes'][9]
        self.assertEqual([letter['no'] for letter in volume['letters']], list(range(1, 281)))
        self.assertIn('mia', volume['timeline'])
        self.assertEqual(len(self.chapters), 98)
        for number, parts, chapters in ((1, 7, 25), (2, 3, 21), (3, 7, 52)):
            volume = self.capital['volumes'][number - 1]
            self.assertEqual(len(volume['parts']), parts)
            self.assertEqual(sum(len(p['chapters']) for p in volume['parts']), chapters)

    def test_first_volume_real_one_to_many_english_mapping(self):
        chapters = self.chapters
        self.assertEqual([e['no'] for e in chapters[(1, 4)]['en']], [4, 5, 6])
        self.assertEqual([e['no'] for e in chapters[(1, 24)]['en']], list(range(26, 33)))
        self.assertEqual([e['no'] for e in chapters[(1, 25)]['en']], [33])
        self.assertEqual([e['no'] for n in range(1, 26) for e in chapters[(1, n)]['en']], list(range(1, 34)))

    def test_second_volume_split_english_pages_remain_one_logical_chapter(self):
        for number, expected in ((20, 4), (21, 2)):
            rows = self.chapters[(2, number)]['en']
            self.assertEqual(len(rows), expected)
            self.assertEqual({row['no'] for row in rows}, {number})
            self.assertEqual(len({row['url'] for row in rows}), expected)

    def test_directory_and_chapter_schema_rejects_corruption(self):
        for mutation in ('missing-volume', 'duplicate-work', 'backward-pages', 'bad-source', 'unknown-field'):
            data = deepcopy(self.wenji)
            if mutation == 'missing-volume': data['volumes'].pop()
            if mutation == 'duplicate-work': data['volumes'][0]['works'].append(deepcopy(data['volumes'][0]['works'][0]))
            if mutation == 'backward-pages': data['volumes'][0]['works'][0]['pages'] = [20, 3]
            if mutation == 'bad-source': data['volumes'][0]['works'][0]['mia'] = 'https://www.marxists.org.evil.example/chinese/x'
            if mutation == 'unknown-field': data['volumes'][0]['works'][0]['private_path'] = 'hidden'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): validate_wenji(data)
        for mutation in ('missing-chapter', 'english-single-object', 'wrong-english-number', 'unknown-step'):
            data = deepcopy(self.capital)
            chapter = data['volumes'][0]['parts'][0]['chapters'][0]
            if mutation == 'missing-chapter': data['volumes'][0]['parts'][0]['chapters'].pop()
            if mutation == 'english-single-object': chapter['en'] = chapter['en'][0]
            if mutation == 'wrong-english-number': chapter['en'][0]['no'] = 2
            if mutation == 'unknown-step': data['routes'][0]['steps'][0]['chapter'] = 99
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): validate_capital(data, self.works)

    def test_exact_source_prefix_and_private_path_boundaries(self):
        for value in ('http://www.marxists.org/chinese/x.htm', 'https://www.marxists.org/chinese-evil/x.htm',
                      'https://www.marxists.org/chinese/%2e%2e/archive/x.htm', 'https://user@www.marxists.org/chinese/x.htm',
                      'https://www.marxists.org:444/chinese/x.htm', 'https://www.marxists.org/archive/marx/x.htm',
                      'https://www.marxists.org/chinese/x.htm%0a<script>'):
            with self.subTest(value=value), self.assertRaises(ValueError): source_url(value, 'zh')
        with self.assertRaises(ValueError): source_path(ROOT, '../private.md')
        with TemporaryDirectory(prefix='marx-path-boundary-', dir=ROOT) as temporary:
            root = Path(temporary).resolve()
            (root / 'safe').mkdir()
            self.assertEqual(source_path(root, 'safe/file.md'), root / 'safe/file.md')


class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_marx_engels(ROOT)
        cls.bodies = {key: item['body'] for key, item in cls.data['items'].items()}

    def test_complete_first_edition_scope(self):
        items = self.data['items'].values()
        counts = Counter(i['category'] for i in items if i['status'] == 'published')
        for kind, minimum in {'terms': 20, 'myths': 8, 'works': 12, 'guides': 3}.items():
            self.assertGreaterEqual(counts[kind], minimum)
        self.assertEqual(self.data['intro']['intro'], INTRO)
        self.assertEqual(self.data['intro']['basis'], BASIS)
        self.assertGreaterEqual(len(self.data['qa']), 11)
        self.assertTrue({1, 2, 3} <= {i['chapter'] for i in items if i['kind'] == 'guides'})

    def test_every_displayed_quote_has_review_and_real_edition(self):
        data, review, errata = read('citations'), read('citations-review'), read('errata')
        citations, _, _ = validate_citations(data, review, errata, self.data['works'])
        self.assertTrue(citations)
        self.assertEqual({i['id'] for i in review['items']}, set(citations))
        for item in citations.values():
            self.assertLessEqual(len(item['text']), 150)
            self.assertTrue(item['url'].startswith('https://www.marxists.org/chinese/'))
            self.assertEqual(item['edition'], 'quanji-23-1972' if item['vol'] == 5 else 'wenji-2009')
            if item['vol'] == 5: self.assertIsNone(item['page'])

    def test_citation_corruption_is_rejected(self):
        base, review, errata = read('citations'), read('citations-review'), read('errata')
        for mutation in ('changed-text', 'missing-review', 'bad-source', 'fake-page', 'fake-errata', 'unknown-field'):
            data, records = deepcopy(base), deepcopy(review)
            if mutation == 'changed-text': data['items'][0]['text'] += '补'
            if mutation == 'missing-review': records['items'].pop()
            if mutation == 'bad-source': data['items'][0]['url'] = 'https://example.org/chinese/page'
            if mutation == 'fake-page': data['items'][0].update(page=9, page_kind='exact')
            if mutation == 'fake-errata': data['items'][0]['errata'] = ['missing-error']
            if mutation == 'unknown-field': data['items'][0]['draft_note'] = 'private'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_citations(data, records, errata, self.data['works'])

    def test_page_start_and_edition_checks_cannot_be_faked_with_a_matching_review(self):
        base, review, errata = read('citations'), read('citations-review'), read('errata')
        for mutation in ('volume-seven-page', 'invented-directory-page', 'other-chinese-edition'):
            data, records = deepcopy(base), deepcopy(review)
            if mutation == 'volume-seven-page':
                item = next(c for c in data['items'] if c['vol'] == 7);item.update(page=1, page_kind='section_start')
            elif mutation == 'invented-directory-page':
                item = next(c for c in data['items'] if c['vol'] == 2);item.update(page=99999, page_kind='section_start')
            else:
                item = next(c for c in data['items'] if c['work'] == 'manifesto');item['url']='https://www.marxists.org/chinese/marx/01.htm'
                next(w for w in records['works'] if w['id']=='manifesto')['urls'].append(item['url'])
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_citations(data, records, errata, self.data['works'])

    def test_content_unknown_fields_reserved_paths_and_fake_quotes_fail(self):
        base = self.data['catalog']
        for mutation in ('reserved', 'unknown-field', 'bad-verdict', 'missing-citation', 'fake-quote', 'short-body', 'unknown-related', 'unregistered-blockquote', 'missing-page'):
            catalog, bodies = deepcopy(base), deepcopy(self.bodies)
            card = catalog['cards'][0]
            if mutation == 'reserved':
                bodies['capital'] = bodies.pop(card['slug']); card['slug'] = 'capital'
            if mutation == 'unknown-field': card['internal_note'] = 'private'
            if mutation == 'bad-verdict': next(c for c in catalog['cards'] if c['column'] == 'myths')['verdict'] = '大概吧'
            if mutation == 'missing-citation': card['citations'] = ['not-in-the-source-index']
            if mutation == 'fake-quote': bodies[card['slug']] += '\n\n“这是一句未经核对的伪造原话。”\n'
            if mutation == 'short-body': bodies[card['slug']] = '## 白话\n过短。'
            if mutation == 'unknown-related': card['related'] = ['missing-card']
            if mutation == 'unregistered-blockquote': bodies[card['slug']] += '\n\n> 完全没有登记来源的原著引文也会显示在这里。\n'
            if mutation == 'missing-page': bodies[card['slug']] += '\n\n[未生成的卡](/marx/not-a-published-card/)\n'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_catalog(catalog, bodies, self.data['citations'], self.data['works'], self.data['chapters'])

    def test_quote_budgets_count_repeated_displays_not_only_unique_ids(self):
        data = self.data
        report = quotation_budgets(data['items'], data['citations'], data['lengths'])
        total = sum(len(data['citations'][c]['text']) for i in data['items'].values() if i['status'] == 'published' for c in i['citations'])
        self.assertEqual(sum(w['displayed_characters'] for w in report['works'].values()), total)
        self.assertEqual(sum(report['pages'].values()), total)
        item = deepcopy(next(iter(data['items'].values())))
        item['prose_characters'] = 1
        with self.assertRaises(ValueError): quotation_budgets({'test': item}, data['citations'], data['lengths'])
        lengths = deepcopy(data['lengths'])
        for record in lengths.values(): record['characters'] = 1
        with self.assertRaises(ValueError): quotation_budgets(data['items'], data['citations'], lengths)

    def test_errata_material_is_separately_counted_and_included_in_work_limits(self):
        data=self.data;budget=data['budgets']
        correction_total=sum(len(e['wrong'])+len(e['right']) for e in data['errata'].values())
        self.assertEqual(budget['errata_characters'],correction_total)
        self.assertEqual(budget['pages']['/marx/sources/'],correction_total)
        citation_total=sum(len(data['citations'][cid]['text']) for i in data['items'].values() if i['status']=='published' for cid in i['citations'])
        self.assertEqual(budget['citation_characters'],citation_total)
        self.assertEqual(budget['total_characters'],citation_total+correction_total)
        for record in budget['works'].values():
            self.assertEqual(record['displayed_characters'],record['citation_characters']+record['errata_characters'])
            self.assertLessEqual(record['displayed_characters'],record['limit'])

    def test_private_research_cache_is_not_a_build_input(self):
        original = Path.read_text
        def public_only(path, *args, **kwargs):
            if '.local-checks' in path.parts:
                raise AssertionError('Research cache accessed by public loader')
            return original(path, *args, **kwargs)
        with patch.object(Path, 'read_text', public_only):
            data = load_marx_engels(ROOT)
        self.assertEqual(set(data['items']), set(self.data['items']))

    def test_render_is_escaped_and_contains_notes_and_real_sources(self):
        for item in self.data['items'].values():
            html = render_content(self.data, item)
            self.assertIn(AI_NOTE, html)
            self.assertIn('https://www.marxists.org/chinese/', html)
            self.assertNotIn('Obsidian Vault', html)
            self.assertNotIn('<script', html)
            self.assertNotIn('source_body_sha256', html)
        html = render_index(self.data)
        self.assertIn('data-me-deck-data', html)
        self.assertNotIn('source_body_sha256', html)
        self.assertNotIn('quote_sha256', html)

    def test_bookcase_treats_all_ten_volumes_alike(self):
        html = bookcase(self.data)
        self.assertEqual(html.count('class="me-spine"'), 10)
        self.assertNotIn('is-capital', html)

    def test_qa_is_a_quiet_subpage_reached_by_one_small_button(self):
        index = render_index(self.data)
        self.assertEqual(index.count('href="/marx/qa/"'), 1)
        self.assertIn('class="me-minor-link" href="/marx/qa/"', index)
        self.assertNotIn('<h2>问对录</h2>', index)
        for item in self.data['qa']:
            self.assertNotIn(item['article'], index)
        self.assertNotIn('问对录', render_capital_index(self.data))
        self.assertNotIn('问对录', render_capital_volume(self.data, self.data['capital']['volumes'][0]))
        for item in self.data['items'].values():
            if item['kind'] == 'guides':
                self.assertNotIn('<h2>问对录</h2>', render_content(self.data, item))
        directory = render_qa_index(self.data)
        for item in self.data['qa']:
            self.assertEqual(directory.count('href="' + item['article'] + '"'), 1)
        self.assertIn('id="qa-1-general"', directory)
        self.assertIn('id="qa-1-ch01"', directory)
        self.assertIn('/marx/capital/1/ch01/', directory)
        self.assertNotIn(AI_NOTE, directory)
        self.assertIn('qa', RESERVED)

    def test_marxist_quotations_and_reading_link_both_ways(self):
        self.assertIn('href="/today/#daily-quotation-card"', render_index(self.data))
        sources = render_sources(self.data)
        self.assertIn('href="/today/#daily-quotation-card"', sources)
        self.assertIn('href="/assets/quotes-sources.md"', sources)
        self.assertTrue((ROOT / 'home/brief/quotes-sources.md').is_file())

    def test_joke_difficulty_names_are_always_marked_as_difficulty(self):
        self.assertEqual(LEVELS, {1: '唯心主义', 2: '形而上学', 3: '修正主义'})
        index = render_index(self.data)
        self.assertIn(LEVEL_NOTE, index)
        for label in LEVELS.values():
            self.assertIn(f'aria-pressed="false">{label}</button>', index)
            self.assertNotIn('<p class="me-meta">' + label, index)
        for item in self.data['items'].values():
            self.assertIn('<p class="me-meta">难度：' + LEVELS[item['level']] + ' · ', render_content(self.data, item))
        volume = render_wenji_volume(self.data, self.data['wenji']['volumes'][0])
        self.assertIn('难度：', volume)
        self.assertIn(LEVEL_NOTE, volume)

    def test_qa_paths_are_real_and_cannot_drift_to_guessed_routes(self):
        routes = {i['article'] for i in self.data['qa']}
        validate_qa(read('qa-index'), routes, self.data['chapters'])
        data = read('qa-index'); data['items'][0]['article'] = '/articles/guessed.html'
        with self.assertRaises(ValueError): validate_qa(data, routes, self.data['chapters'])
        self.assertTrue(any('第二种价值形式' in i['title'] for i in self.data['qa']))


@unittest.skipUnless(PUBLICATION, 'Run --publication after building the site.')
class PublicationTests(unittest.TestCase):
    def test_all_routes_metadata_navigation_and_sitemap(self):
        data = load_marx_engels(ROOT)
        output = ROOT / '_site_unified'
        routes = {'/marx/', '/marx/wenji/', '/marx/capital/', '/marx/capital/english/', '/marx/capital/routes/', '/marx/sources/', '/marx/qa/'}
        routes.update(f'/marx/wenji/{no}/' for no in range(1, 11))
        routes.update(f'/marx/capital/{no}/' for no in range(1, 4))
        routes.update(i['route'] for i in data['items'].values() if i['status'] == 'published')
        self.assertGreaterEqual(len(routes), 62)
        sitemap = {e.text for e in ET.parse(output / 'sitemap.xml').findall('.//{*}loc')}
        for route in routes:
            with self.subTest(route=route):
                html = (output / route.strip('/') / 'index.html').read_text(encoding='utf-8')
                nodes = Tags(html).nodes
                self.assertIn('https://xieyuqing.me' + route, sitemap)
                self.assertTrue(any(t == 'link' and a.get('rel') == 'canonical' and a.get('href') == 'https://xieyuqing.me' + route for t, a in nodes))
                self.assertTrue(any(t == 'meta' and a.get('property') == 'og:url' and a.get('content') == 'https://xieyuqing.me' + route for t, a in nodes))
                self.assertFalse(any(t == 'a' and 'site-language-switch' in a.get('class', '').split() for t, a in nodes))
                self.assertNotIn('Obsidian Vault', html)
                self.assertNotIn('source_body_sha256', html)
                self.assertNotIn('{{', html)
        self.assertEqual(localized_path('/marx/capital/', 'en'), '/marx/capital/')
        self.assertNotIn('/marx', FEATURES)
        self.assertFalse((output / 'en/marx').exists())
        volume_one = (output / 'marx/capital/1/index.html').read_text(encoding='utf-8')
        for chapter in (data['chapters'][(1, no)] for no in range(1, 26)):
            for english in chapter['en']:
                self.assertTrue(any(t == 'a' and a.get('href') == english['url'] for t, a in Tags(volume_one).nodes))
        for route in ('/', '/en/', '/projects/', '/en/projects/', '/today/', '/en/today/'):
            html = (output / route.strip('/') / 'index.html').read_text(encoding='utf-8')
            self.assertGreaterEqual(sum(t == 'a' and a.get('href') == '/marx/' for t, a in Tags(html).nodes), 2)
        for name in ASSETS:
            self.assertTrue((output / 'assets' / name).is_file())
        self.assertNotIn('https://xieyuqing.me/marx/', (output / 'articles/feed.xml').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
