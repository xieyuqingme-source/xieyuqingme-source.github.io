"""Offline Learn English validation and publication checks; no private sources or network."""
from collections import Counter
from copy import deepcopy
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
import json
import re
import sys
import unittest
import xml.etree.ElementTree as ET

from english_corner import (ASSETS, MAP_ASSETS, SECTIONS, build_english_corner, lf, load_english_corner,
                            public_domain, public_url, related_route, render_card, render_index,
                            sections, source_path, text_hash, validate_corner, word_count)
from site_i18n import FEATURES, localized_path

ROOT = Path(__file__).resolve().parent.parent
TODAY = date(2026, 10, 29)
PUBLICATION = '--publication' in sys.argv
if PUBLICATION:
    sys.argv.remove('--publication')


class Tags(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.nodes = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        self.nodes.append((tag, dict(attributes)))


def fixture():
    """Synthetic provenance values test rules without masquerading as researched content."""
    titles = {'words': '词的身世', 'classics': '经典一页', 'between': '中英之间', 'myths': '考据', 'mistakes': '别说错'}
    columns = [{'id': key, 'title': title, 'english': 'Synthetic column ' + key, 'description': 'Synthetic test description.'}
               for key, title in titles.items()]
    bodies = {
        'fixture-word': '## 故事\n\nSynthetic story.\n\n## 可以这样用\n\n例句：A learner opens a book.\n',
        'fixture-classic': '## 导读\n\nSynthetic introduction.\n\n## 原文\n\nBright light guides the reader.\n\n## 可以这样用\n\n例句：The light helps us read.\n',
        'fixture-between': '## 对照\n\n| 中文 | English |\n| --- | --- |\n| 书 | book |\n\n## 为什么\n\nSynthetic explanation.\n\n## 可以这样用\n\n例句：Open the book.\n',
        'fixture-myth': '## 流行说法\n\nSynthetic claim.\n\n## 证据\n\nTwo synthetic references.\n\n## 结论\n\n存疑。\n'
    }
    source = {'label': 'Synthetic source fixture', 'url': 'https://example.org/source', 'checked_on': '2026-10-29'}
    cards = []
    for slug, column in [('fixture-word', 'words'), ('fixture-classic', 'classics'), ('fixture-between', 'between'), ('fixture-myth', 'myths')]:
        card = {'slug': slug, 'column': column, 'title': 'Synthetic public question?', 'level': 1,
                'tags': ['测试'], 'summary': 'Synthetic public summary.', 'sources': [deepcopy(source)],
                'related': [], 'added': '2026-10-29', 'status': 'published', 'ai_assisted': True}
        if column == 'words':
            card.update(headword='book', journey=[{'language': 'Synthetic language', 'form': 'book', 'period': '', 'place_zh':'Synthetic representative region', 'lon':0, 'lat':10, 'approximate':True}])
        elif column == 'classics':
            excerpt = sections(bodies[slug])['原文']
            card['work'] = {'author_zh': '测试作者', 'author_en': 'Synthetic Author', 'title_zh': '测试作品',
                            'title_en': 'Synthetic Work', 'first_published': 1900, 'author_died': 1950,
                            'range': 'Synthetic sentence', 'edition': 'Synthetic public-domain test fixture',
                            'edition_url': source['url'], 'excerpt_words': word_count(excerpt), 'excerpt_sha256_lf': text_hash(excerpt)}
        elif column == 'myths':
            card['verdict'] = '存疑'
            card['sources'].append({**source, 'url': 'https://example.net/second'})
        cards.append(card)
    notes = {'version': 1, 'works': {'fixture-classic': [
        {'term': term, 'meaning': 'Synthetic contextual meaning.', 'source_url': 'https://example.org/dictionary/' + term,
         'source_label': 'Synthetic dictionary fixture', 'checked_on': '2026-10-29'}
        for term in ['Bright', 'light', 'reader']]}}
    return {'version': 1, 'columns': columns, 'cards': cards}, bodies, notes


class CornerValidationTests(unittest.TestCase):
    def assert_bad(self, change, *, location='catalog'):
        data, bodies, notes = fixture()
        change({'catalog': data, 'bodies': bodies, 'notes': notes}[location])
        with self.assertRaises(ValueError):
            validate_corner(data, bodies, notes, today=TODAY)

    def test_valid_five_column_fixture_and_drafts_are_explicit(self):
        data, bodies, notes = fixture()
        corner = validate_corner(data, bodies, notes, today=TODAY)
        self.assertEqual(Counter(c['column'] for c in corner['cards']), Counter({'words':1,'classics':1,'between':1,'myths':1}))
        data['cards'][0]['status'] = 'draft'
        corner = validate_corner(data, bodies, notes, today=TODAY)
        self.assertNotIn('fixture-word', [c['slug'] for c in corner['cards']])

    def test_unknown_and_missing_fields_cannot_silently_publish(self):
        mutations = [lambda d: d.update(extra=True), lambda d: d.pop('columns'),
                     lambda d: d['columns'][0].update(extra=True), lambda d: d['cards'][0].update(extra=True),
                     lambda d: d['cards'][1]['work'].update(extra=True), lambda d: d['cards'][0]['sources'][0].update(extra=True),
                     lambda d: d['cards'][0]['journey'][0].update(extra=True)]
        for index, mutation in enumerate(mutations):
            with self.subTest(case=index): self.assert_bad(mutation)
        self.assert_bad(lambda n: n.update(extra=True), location='notes')
        self.assert_bad(lambda n: n['works']['fixture-classic'][0].update(extra=True), location='notes')

    def test_versions_booleans_levels_and_metadata_types_are_strict(self):
        for value in [True, '1', 2]:
            with self.subTest(value=value): self.assert_bad(lambda d: d.update(version=value))
        for value in [True, 0, 4, '1']:
            with self.subTest(level=value): self.assert_bad(lambda d: d['cards'][0].update(level=value))
        self.assert_bad(lambda d: d['cards'][0].update(ai_assisted='yes'))
        self.assert_bad(lambda n: n.update(version=True), location='notes')

    def test_column_and_slug_boundaries(self):
        for slug in ['tools', 'play', 'quotes', 'map', 'a', '../private', 'Word', 'bad_slug', 'a' * 65]:
            with self.subTest(slug=slug): self.assert_bad(lambda d: d['cards'][0].update(slug=slug))
        self.assert_bad(lambda d: d['cards'][1].update(slug=d['cards'][0]['slug']))
        self.assert_bad(lambda d: d['columns'][1].update(id='words'))
        self.assert_bad(lambda d: d['cards'][0].update(column='unknown'))
        self.assert_bad(lambda d: d['cards'][0].update(summary='字' * 121))
        self.assert_bad(lambda d: d['cards'][0].update(verdict='真'))
        self.assert_bad(lambda d: d['cards'][3].update(verdict='也许'))

    def test_real_iso_dates_and_source_minimums(self):
        for invalid in ['2026-2-03', '2026-02-30', 'tomorrow', True]:
            with self.subTest(date=invalid): self.assert_bad(lambda d: d['cards'][0]['sources'][0].update(checked_on=invalid))
        self.assert_bad(lambda d: d['cards'][0].update(added='2026-11-31'))
        self.assert_bad(lambda d: d['cards'][0].update(sources=[]))
        self.assert_bad(lambda d: d['cards'][3]['sources'].pop())

    def test_sources_exclude_network_credentials_and_private_hosts(self):
        for invalid in ['http://example.org/', 'javascript:alert(1)', 'https://127.0.0.1/', 'https://10.2.3.4/',
                        'https://[::1]/', 'https://localhost/', 'https://example.local/', 'https://user:secret@example.org/',
                        'https://example.org/unsafe path', 'https://example.org/Obsidian%20Vault/']:
            with self.subTest(url=invalid):
                with self.assertRaises(ValueError): public_url(invalid)
        self.assertEqual(public_url('https://example.org/home/text#chapter'),'https://example.org/home/text#chapter')

    def test_private_paths_cannot_enter_metadata_or_body(self):
        for value in ['C:\\Users\\Private\\notes.md', 'D:/Obsidian Vault/private', 'Obsidian Vault', '/Users/name/private']:
            with self.subTest(value=value):
                self.assert_bad(lambda d: d['cards'][0].update(summary=value))
                self.assert_bad(lambda b: b.update({'fixture-word': '## 故事\n\n' + value + '\n\n## 可以这样用\n\n例句。'}), location='bodies')

    def test_required_sections_are_real_nonempty_unique_headings(self):
        for body in ['## 故事\n\nOnly one section.', '## 故事\n\n\n## 可以这样用\n\nExample.',
                     '## 故事\n\nOne.\n\n## 故事\n\nTwo.\n\n## 可以这样用\n\nExample.',
                     '## 故事\n\n```text\n## 可以这样用\n```', '# Unexpected title\n\n## 故事\n\nStory.\n\n## 可以这样用\n\nExample.']:
            with self.subTest(body=body): self.assert_bad(lambda b: b.update({'fixture-word': body}), location='bodies')
        self.assert_bad(lambda b: b.pop('fixture-word'), location='bodies')

    def test_mistakes_render_context_examples_explanation_then_one_source_section(self):
        data,bodies,notes=fixture()
        card=deepcopy(data['cards'][2]);card.update(slug='fixture-mistake',column='mistakes',related=[])
        body='## 错句\n\nI very like books.\n\n## 对句\n\nI really like books.\n\n## 为什么\n\nSynthetic contextual explanation.'
        data['cards'].append(card);bodies[card['slug']]=body
        corner=validate_corner(data,bodies,notes,today=TODAY)
        html=render_card(corner['cards'][-1],corner)
        positions=[html.index('<h2>'+heading+'</h2>') for heading in ['错句','对句','为什么','来源']]
        self.assertEqual(positions,sorted(positions))
        self.assertEqual(html.count('例句为编写的示例。'),1)
        self.assertEqual(html.count('<h2>来源</h2>'),1)
        parts=sections(body)
        for missing in ['错句','对句','为什么']:
            changed=deepcopy(bodies)
            changed[card['slug']]='\n\n'.join('## '+heading+'\n\n'+text for heading,text in parts.items() if heading!=missing)
            with self.subTest(missing=missing),self.assertRaises(ValueError):
                validate_corner(data,changed,notes,today=TODAY)

    def test_journey_requires_bounded_finite_coordinates_and_an_explicit_schematic_label(self):
        for key,value in [('lon',181),('lon',float('nan')),('lon',True),('lat',-91),('lat',float('inf')),('lat','20'),('approximate',False),('approximate',1),('place_zh','')]:
            with self.subTest(key=key,value=value):
                self.assert_bad(lambda d:d['cards'][0]['journey'][0].update({key:value}))
        self.assert_bad(lambda d:d['cards'][0]['journey'][0].pop('approximate'))

    def test_original_hash_and_word_count_protect_reviewed_excerpt(self):
        self.assert_bad(lambda b: b.update({'fixture-classic': b['fixture-classic'].replace('Bright light','A different light')}), location='bodies')
        self.assert_bad(lambda d: d['cards'][1]['work'].update(excerpt_words=600))
        self.assert_bad(lambda d: d['cards'][1]['work'].update(excerpt_sha256_lf='0' * 64))
        data, bodies, notes = fixture()
        long = ' '.join(['word'] * 601)
        bodies['fixture-classic'] = '## 导读\n\nIntro.\n\n## 原文\n\n' + long + '\n\n## 可以这样用\n\nExample.'
        data['cards'][1]['work'].update(excerpt_words=601, excerpt_sha256_lf=text_hash(long))
        with self.assertRaises(ValueError): validate_corner(data,bodies,notes,today=TODAY)

    def test_lf_and_crlf_hash_the_same_reviewed_passage(self):
        self.assertEqual(text_hash('one\ntwo'), text_hash('one\r\ntwo'))
        self.assertEqual(lf('one\rtwo\r\nthree'), 'one\ntwo\nthree')
        data,bodies,notes = fixture()
        first = validate_corner(data,bodies,notes,today=TODAY)
        second = validate_corner(data,{s:b.replace('\n','\r\n') for s,b in bodies.items()},notes,today=TODAY)
        self.assertEqual(first['cards'][1]['sections']['原文'],second['cards'][1]['sections']['原文'])

    def test_public_domain_fixed_date_boundaries_and_time_relaxation(self):
        public_domain(1930,1975,TODAY)
        for published,died in [(1931,1975),(1930,1976),(0,1900),(1900,0),(True,1900),(1900,False)]:
            with self.subTest(published=published,died=died):
                with self.assertRaises(ValueError): public_domain(published,died,TODAY)
        public_domain(1931,1976,date(2027,1,1))
        self.assert_bad(lambda d: d['cards'][1]['work'].update(author_died=2000))

    def test_related_reading_must_exist_and_drafts_are_not_destinations(self):
        data,bodies,notes = fixture(); data['cards'][0]['related'] = ['fixture-classic','/articles/test.html']
        corner = validate_corner(data,bodies,notes,{'/articles/test.html'},TODAY)
        self.assertEqual(related_route('fixture-classic',{'fixture-classic'},set()),'/english/fixture-classic/')
        self.assertEqual(len(corner['cards']),4)
        data['cards'][0]['related'].append('missing')
        with self.assertRaises(ValueError): validate_corner(data,bodies,notes,{'/articles/test.html'},TODAY)
        data['cards'][0]['related'] = ['fixture-between']; data['cards'][2]['status'] = 'draft'
        with self.assertRaises(ValueError): validate_corner(data,bodies,notes,today=TODAY)

    def test_vocabulary_is_contextual_reviewed_and_not_free_invention(self):
        self.assert_bad(lambda n: n['works']['fixture-classic'][0].update(term='absent'),location='notes')
        self.assert_bad(lambda n: n['works']['fixture-classic'][1].update(term='Bright'),location='notes')
        self.assert_bad(lambda n: n['works'].pop('fixture-classic'),location='notes')
        self.assert_bad(lambda n: n['works']['fixture-classic'].pop(),location='notes')
        self.assert_bad(lambda n: n['works'].update({'fixture-word':deepcopy(n['works']['fixture-classic'])}),location='notes')

    def test_raw_html_is_escaped_and_unregistered_images_are_excluded(self):
        data,bodies,notes = fixture()
        bodies['fixture-word'] = bodies['fixture-word'].replace('Synthetic story.','<script>alert(1)</script> <img src="https://example.org/a.png">')
        data['cards'][0]['title'] = 'A <b>title</b> & "quote"'
        corner = validate_corner(data,bodies,notes,today=TODAY)
        html = render_card(corner['cards'][0],corner)
        self.assertNotIn('<script>',html); self.assertNotIn('<img ',html)
        self.assertIn('&lt;script&gt;',html); self.assertIn('&lt;b&gt;title&lt;/b&gt;',html)
        self.assert_bad(lambda b: b.update({'fixture-word':b['fixture-word'] + '\n\n![remote image](https://example.org/a.png)'}),location='bodies')

    def test_only_explicit_local_book_images_with_alt_are_allowed(self):
        data,bodies,notes=fixture()
        bodies['fixture-word'] += '\n\n![A country estate](/assets/books/book-pride-and-prejudice.webp)'
        self.assertEqual(len(validate_corner(data,bodies,notes,today=TODAY)['cards']),4)
        for path in ['/assets/books/not-registered.webp','/assets/books/../foods/hotpot.webp','/assets/books/book-pride-and-prejudice.webp?remote=1','https://example.org/book.webp']:
            self.assert_bad(lambda b: b.update({'fixture-word':b['fixture-word']+'\n\n![A scene]('+path+')'}),location='bodies')
        self.assert_bad(lambda b: b.update({'fixture-word':b['fixture-word']+'\n\n![](/assets/books/book-pride-and-prejudice.webp)'}),location='bodies')

    def test_explicit_source_paths_do_not_escape_repository(self):
        self.assertEqual(source_path(Path('.'),'public-file.md'),Path.cwd().resolve()/'public-file.md')
        with TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            self.assertEqual(source_path(root,'english-corner/catalog.json'),root/'english-corner/catalog.json')
            with self.assertRaises(ValueError): source_path(root,'../private.md')

    def test_loader_checks_assets_and_reads_only_catalogued_public_markdown(self):
        data,bodies,notes = fixture()
        with TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            with self.assertRaises(ValueError): load_english_corner(root,TODAY)
            (root/'home/assets').mkdir(parents=True)
            (root/'home/english-corner.template.html').write_text('Synthetic template',encoding='utf-8')
            (root/'home/english-intro.json').write_text((ROOT/'home/english-intro.json').read_text(encoding='utf-8'),encoding='utf-8')
            for name in (*ASSETS,*MAP_ASSETS):
                path=root/'home/assets'/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('Synthetic local asset',encoding='utf-8')
            (root/'english-corner/cards').mkdir(parents=True)
            (root/'english-corner/catalog.json').write_text(json.dumps(data),encoding='utf-8')
            (root/'english-corner/notes.json').write_text(json.dumps(notes),encoding='utf-8')
            (root/'english-corner/quiz.json').write_text('{"version":1,"questions":[]}',encoding='utf-8')
            for slug,body in bodies.items(): (root/'english-corner/cards'/f'{slug}.md').write_text(body,encoding='utf-8')
            (root/'english-corner/cards/not-catalogued.md').write_text('Unpublished fixture; not a card.',encoding='utf-8')
            loaded = load_english_corner(root,TODAY)
            self.assertEqual({c['slug'] for c in loaded['cards']},set(bodies))
            (root/'home/assets'/ASSETS[0]).unlink()
            with self.assertRaises(ValueError): load_english_corner(root,TODAY)

    def test_static_fixture_pages_have_metadata_and_no_false_english_counterpart(self):
        data,bodies,notes = fixture(); corner = validate_corner(data,bodies,notes,today=TODAY)
        with TemporaryDirectory(dir=ROOT) as directory:
            output = Path(directory)
            report = build_english_corner(ROOT,output,'https://public.test',corner)
            self.assertEqual(report['cards'],4)
            self.assertEqual(set(report['routes']),{'/english/','/english/tools/numbers/','/english/play/','/english/quotes/','/english/map/',*('/english/'+c['slug']+'/' for c in corner['cards'])})
            for route in report['routes']:
                html = (output/route.strip('/')/'index.html').read_text(encoding='utf-8')
                tags = Tags(html).nodes
                self.assertEqual([a.get('href') for t,a in tags if t == 'link' and a.get('rel') == 'canonical'],['https://public.test'+route])
                self.assertEqual(sum(t == 'h1' for t,a in tags),1)
                self.assertFalse(any(t == 'a' and 'site-language-switch' in a.get('class','') for t,a in tags))
                self.assertFalse(any(t == 'link' and a.get('hreflang') == 'en' for t,a in tags))
                self.assertIn('/english/',html); self.assertNotIn('Obsidian Vault',html); self.assertNotIn('{{',html)
            self.assertIn('data-ec-filters', (output/'english/index.html').read_text(encoding='utf-8'))
            self.assertIn('转换需要 JavaScript',(output/'english/tools/numbers/index.html').read_text(encoding='utf-8'))
            self.assertFalse((output/'en/english').exists())
            for name in ASSETS: self.assertTrue((output/'assets'/name).is_file(),name)


class CornerProductionTests(unittest.TestCase):
    def test_public_inventory_and_reviewed_classic_notes(self):
        corner = load_english_corner(ROOT)
        counts = Counter(c['column'] for c in corner['cards'])
        self.assertGreaterEqual(len(corner['cards']),40)
        for column,minimum in [('words',8),('classics',8),('between',4),('myths',4),('mistakes',8)]: self.assertGreaterEqual(counts[column],minimum,column)
        self.assertTrue(all(c['ai_assisted'] for c in corner['cards']))
        for card in corner['cards']:
            with self.subTest(slug=card['slug']):
                self.assertNotIn('Obsidian Vault',card['body'])
                self.assertTrue(all(date.fromisoformat(s['checked_on']) for s in card['sources']))
                if card['column'] == 'classics': self.assertGreaterEqual(len(corner['notes'][card['slug']]),3)

    def test_chinese_first_routes_stay_outside_bilingual_features(self):
        self.assertNotIn('/english',FEATURES)
        self.assertEqual(localized_path('/english/', 'en'),'/english/')
        self.assertEqual(localized_path('/english/tools/numbers/?n=1#read','en'),'/english/tools/numbers/?n=1#read')
        corner = load_english_corner(ROOT)
        html = render_index(corner)
        self.assertEqual(html.count('data-ec-row '),len(corner['cards']))
        self.assertEqual(html.count('data-ec-column='),5)
        self.assertIn('AI 辅助',html)

    @unittest.skipUnless(PUBLICATION,'Use --publication after the final local build.')
    def test_final_publication_sitemap_metadata_and_navigation(self):
        output = ROOT/'_site_unified'; corner = load_english_corner(ROOT)
        routes = ['/english/','/english/tools/numbers/','/english/play/','/english/quotes/','/english/map/',*('/english/'+c['slug']+'/' for c in corner['cards'])]
        locations = {urlsplit(loc.text).path for loc in ET.parse(output/'sitemap.xml').findall('.//{*}loc')}
        self.assertTrue(set(routes).issubset(locations))
        self.assertFalse(any(route.startswith('/en/english') for route in locations))
        self.assertFalse((output/'en/english').exists())
        for route in routes:
            html = (output/route.strip('/')/'index.html').read_text(encoding='utf-8')
            tags = Tags(html).nodes
            self.assertEqual([a['href'] for t,a in tags if t == 'link' and a.get('rel') == 'canonical'],['https://xieyuqing.me'+route])
            self.assertFalse(any(t == 'a' and 'site-language-switch' in a.get('class','') for t,a in tags))
            self.assertEqual(sum(t == 'h1' for t,a in tags),1)
            self.assertNotIn('data-article-path',html)
            if route == '/english/':
                expected = corner['intro'].get('title',corner['intro']['name'])
                self.assertTrue(re.search(r'<title>(.*?)</title>',html)[1].startswith(expected))
                og = [a['content'] for t,a in tags if t == 'meta' and a.get('property') == 'og:title']
                self.assertEqual(len(og),1)
                self.assertTrue(og[0].startswith(expected))
            matching = next((card for card in corner['cards'] if route == '/english/'+card['slug']+'/'),None)
            if matching:
                self.assertEqual([a['content'] for t,a in tags if t == 'meta' and a.get('name') == 'description'],[matching['summary']])
        for route in ['/','/en/','/today/','/en/today/','/about/']:
            html = (output/route.strip('/')/'index.html').read_text(encoding='utf-8')
            self.assertGreaterEqual(sum(t == 'a' and a.get('href') == '/english/' for t,a in Tags(html).nodes),2,route)
        rss = (output/'articles/feed.xml').read_text(encoding='utf-8')
        self.assertNotIn('https://xieyuqing.me/english/',rss)


if __name__ == '__main__':
    unittest.main()
