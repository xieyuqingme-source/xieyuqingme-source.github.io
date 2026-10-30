"""Offline boundary and publication-budget tests for the public topic corpus."""
from collections import Counter
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

ROOT = next(parent for parent in Path(__file__).resolve().parents
            if (parent / 'marx-engels/catalog.json').is_file()
            and (parent / '.github/workflows/pages.yml').is_file())
sys.path.insert(0, str(ROOT / 'scripts'))
from marx_engels import load_marx_engels, quotation_budgets
import marx_topics as topics_module

EXPECTED = {
    'commune': {
        'timeline': {'commune-march18', 'commune-march26', 'commune-march28', 'commune-may21', 'commune-may28'},
        'letters': {'commune-letter129', 'commune-letter130'},
        'summaries': {'commune-address', 'commune-engels1891'},
        'manifesto-preface': {'commune-manifesto1872'},
    },
    'late-engels': {
        'five-letters': {'late-letter237', 'late-letter240', 'late-letter241', 'late-letter263', 'late-letter266'},
        'read-together': {'late-key-determination', 'late-key-interaction', 'late-key-resultant'},
    },
    'mba': {
        'enterprise': {'mba-cooperation', 'mba-division', 'mba-machinery', 'mba-piece-wage', 'mba-management', 'mba-shares', 'mba-commerce'},
    },
}


class TopicBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = deepcopy(load_marx_engels(ROOT))
        fixture_dir = ROOT / 'marx-engels/topics'
        cls.raw = {name: json.loads((fixture_dir / (name + '.json')).read_text(encoding='utf-8'))
                   for name in topics_module.TOPICS}

    def load(self, mutate=None, core=None):
        raw = deepcopy(self.raw)
        if mutate:
            mutate(raw)
        with TemporaryDirectory(prefix='marx-topics-', dir=ROOT) as temporary:
            root = Path(temporary)
            self.assertEqual(root.resolve().parent, ROOT.resolve())
            directory = root / 'marx-engels/topics'
            directory.mkdir(parents=True)
            for name, packet in raw.items():
                (directory / (name + '.json')).write_text(json.dumps(packet, ensure_ascii=False), encoding='utf-8')
            return topics_module.load_topics(root, core or self.core)

    @staticmethod
    def item(raw, topic='commune', section=0, item=0):
        return raw[topic]['sections'][section]['items'][item]

    def rejected(self, mutate):
        with self.assertRaises(ValueError):
            self.load(mutate)

    def test_curated_topics_keep_all_required_material_and_primary_bindings(self):
        topics = self.load()
        self.assertEqual(set(topics), set(EXPECTED))
        for name, required in EXPECTED.items():
            topic = topics[name]
            sections = {section['id']: section for section in topic['sections']}
            self.assertTrue(required.keys() <= sections.keys())
            for ident, ids in required.items():
                self.assertTrue(ids <= {item['id'] for item in sections[ident]['items']})
            self.assertGreater(topic['prose_characters'], 400)
            for section in topic['sections']:
                for item in section['items']:
                    self.assertLessEqual(len(item['citations']), 1)
                    for cid in item['citations']:
                        self.assertEqual(self.core['citations'][cid]['url'].split('#')[0], item['source']['url'].split('#')[0])
        core = {**self.core, 'topics': topics}
        rendered = topics_module.render_topic(core, 'commune')
        self.assertIn('id="topic-top"', rendered)
        self.assertIn('href="#timeline"', rendered)
        self.assertEqual(rendered.count('id="commune-march18"'), 1)
        self.assertIn('/marx/topics/', rendered)
        self.assertEqual({page[0] for page in topics_module.extra_pages(core)}, set(topics_module.ROUTES))
        from marx_render import render_index
        self.assertIn('href="/marx/topics/"', render_index(self.core))
        # A loader that renders topics but omits them from global budgets must fail.
        for topic in topics.values():
            expected = sum(len(self.core['citations'][cid]['text']) for cid in topic['citations'])
            self.assertEqual(self.core['budgets']['pages'][topic['route']], expected)

    def test_unknown_fields_and_non_boolean_ai_markers_fail(self):
        for mutate in (
            lambda r: r['mba'].update(extra='unknown'),
            lambda r: r['mba'].update(version=True),
            lambda r: r['mba'].update(ai_assisted=1),
            lambda r: r['mba'].update(ai_assisted=False),
            lambda r: self.item(r).update(extra='unknown'),
            lambda r: self.item(r)['source'].update(private_note='unknown'),
        ):
            with self.subTest(mutate=mutate): self.rejected(mutate)

    def test_removing_required_sections_or_entries_fails(self):
        for topic, section in (('commune', 'letters'), ('late-engels', 'five-letters'), ('mba', 'enterprise')):
            with self.subTest(topic=topic, section=section):
                def remove_section(raw):
                    raw[topic]['sections'] = [s for s in raw[topic]['sections'] if s['id'] != section]
                self.rejected(remove_section)
        for topic, section, ident in (('commune', 'timeline', 'commune-may28'),
                                      ('late-engels', 'five-letters', 'late-letter263'),
                                      ('mba', 'enterprise', 'mba-commerce')):
            with self.subTest(topic=topic, ident=ident):
                def remove_item(raw):
                    target = next(s for s in raw[topic]['sections'] if s['id'] == section)
                    target['items'] = [item for item in target['items'] if item['id'] != ident]
                self.rejected(remove_item)

    def test_duplicate_and_reserved_dom_anchors_fail(self):
        self.rejected(lambda r: self.item(r).update(id='timeline'))
        self.rejected(lambda r: self.item(r, item=1).update(id=self.item(r)['id']))
        # Keep every required item: an appended anchor must be rejected for the
        # real DOM collision, rather than incidentally for missing curriculum.
        def reserved(raw):
            added = deepcopy(self.item(raw))
            added['id'] = 'topic-top'
            raw['commune']['sections'][0]['items'].append(added)
        self.rejected(reserved)

    def test_unknown_private_and_unsafe_links_fail(self):
        for url in ('javascript:alert(1)', 'file:///C:/private/note.md',
                    'https://127.0.0.1/private', 'https://www.marxists.org.evil.example/chinese/a.htm',
                    'http://www.marxists.org/chinese/a.htm',
                    'https://user:pass@www.marxists.org/chinese/a.htm',
                    'https://www.marxists.org/chinese/%2e%2e/a.htm'):
            with self.subTest(url=url):
                self.rejected(lambda r: self.item(r)['source'].update(url=url))
        for route in ('/marx/not-a-published-page/', 'https://example.com/', 'D:/private/note.md'):
            with self.subTest(route=route):
                self.rejected(lambda r: self.item(r).update(related=[route]))

    def test_container_values_fail_cleanly_without_unhashable_type_errors(self):
        for mutate in (
            lambda r: self.item(r).update(citations=[{}]),
            lambda r: self.item(r).update(related=[{}]),
            lambda r: self.item(r).update(citations=True),
            lambda r: self.item(r).update(related={'route': '/marx/'}),
            lambda r: self.item(r).update(source=True),
            lambda r: self.item(r).update(date=True, precision='day'),
        ):
            with self.subTest(mutate=mutate): self.rejected(mutate)

    def test_citations_are_known_single_and_bound_to_this_source(self):
        target_source = self.item(self.raw)['source']['url'].split('#')[0]
        cid = next(ident for ident, citation in self.core['citations'].items()
                   if citation['url'].split('#')[0] != target_source)
        self.rejected(lambda r: self.item(r).update(citations=['not-a-citation']))
        self.rejected(lambda r: self.item(r).update(citations=[cid, cid]))
        self.rejected(lambda r: self.item(r).update(citations=[cid]))

    def test_all_long_quote_styles_stay_in_citation_blocks(self):
        invented = '这是一句未经核对的长引文'
        for left, right in (('“', '”'), ('‘', '’'), ('「', '」'), ('『', '』')):
            with self.subTest(left=left):
                self.rejected(lambda r: self.item(r).update(text=left + invented + right))
        self.rejected(lambda r: r['commune'].update(intro='“' + invented + '”'))
        self.rejected(lambda r: r['commune']['sections'][0].update(intro='“' + invented + '”'))

    def test_date_and_precision_pairs_reject_invented_or_invalid_calendar_dates(self):
        self.rejected(lambda r: self.item(r).pop('precision'))
        self.rejected(lambda r: self.item(r).pop('date'))
        for value, precision in (('2026-02-29', 'day'), ('1890-09-21', 'month'),
                                 ('1890-00', 'month'), ('1890-13', 'month'),
                                 ('0000-10', 'month'), ('0000', 'year'),
                                 ('1890-09-21/22', 'day'), ('1890', True)):
            with self.subTest(value=value, precision=precision):
                self.rejected(lambda r: self.item(r).update(date=value, precision=precision))
        valid = self.load(lambda r: self.item(r).update(date='2000-02-29', precision='day'))
        self.assertEqual(valid['commune']['sections'][0]['items'][0]['date'], '2000-02-29')
        valid = self.load(lambda r: self.item(r).update(date='1890-09', precision='month'))
        self.assertEqual(valid['commune']['sections'][0]['items'][0]['precision'], 'month')

    def test_repeated_displays_reach_work_budgets_and_inline_duplicates_fail(self):
        topic = self.raw['late-engels']
        source_item = next(item for section in topic['sections'] for item in section['items'] if item['citations'])
        cid = source_item['citations'][0]
        original = self.core['citations'][cid]['text']
        def repeat(raw):
            target = deepcopy(source_item)
            target['id'] = 'late-additional-displayed-quote'
            raw['late-engels']['sections'][0]['items'].append(target)
        initial = self.load()
        repeated = self.load(repeat)
        self.assertEqual(repeated['late-engels']['citations'].count(cid), initial['late-engels']['citations'].count(cid) + 1)
        def inline(raw):
            target = next(item for section in raw['late-engels']['sections'] for item in section['items'] if cid in item['citations'])
            target['text'] += '原句为“' + original + '”。'
        # Even a bound long original belongs in the automatic CID block only;
        # rejecting prose duplication prevents an unbudgeted second display.
        self.rejected(inline)
        budget_items = topics_module.quotation_items(repeated)
        lengths = {citation['work']: {'characters': 1000000} for citation in self.core['citations'].values()}
        budgets = quotation_budgets(budget_items, self.core['citations'], lengths)
        expected = Counter()
        for entry in budget_items.values():
            for ident in entry['citations']:
                citation = self.core['citations'][ident]
                expected[citation['work']] += len(citation['text'])
        self.assertEqual({work: row['citation_characters'] for work, row in budgets['works'].items()}, dict(expected))
        for entry in budget_items.values():
            self.assertEqual(budgets['pages'][entry['route']],
                             sum(len(self.core['citations'][ident]['text']) for ident in entry['citations']))
        constrained = deepcopy(lengths)
        constrained[self.core['citations'][cid]['work']]['characters'] = 1
        with self.assertRaises(ValueError): quotation_budgets(budget_items, self.core['citations'], constrained)
        missing = deepcopy(lengths)
        del missing[self.core['citations'][cid]['work']]
        with self.assertRaises(ValueError): quotation_budgets(budget_items, self.core['citations'], missing)

    def test_renderer_escapes_user_shaped_prose_and_keeps_source_links(self):
        payload = '<img src=x onerror=alert(1)>'
        topics = self.load(lambda r: self.item(r).update(text=payload))
        html = topics_module.render_topic({**self.core, 'topics': topics}, 'commune')
        self.assertNotIn(payload, html)
        self.assertIn('&lt;img src=x onerror=alert(1)&gt;', html)
        self.assertIn('rel="noopener noreferrer"', html)

    def test_date_evidence_is_separate_and_directory_links_have_real_titles(self):
        topics = self.load(lambda r: self.item(r).update(related=['/marx/life/letters/']))
        address = next(item for section in topics['commune']['sections']
                       for item in section['items'] if item['id'] == 'commune-address')
        self.assertEqual(address['source']['url'],
                         'https://www.marxists.org/chinese/marx-engels2/03/07.htm')
        self.assertEqual(address['date_source']['url'],
                         'https://www.marxists.org/chinese/marx-engels2/10/287.htm')
        pages = topics_module.extra_pages({**self.core, 'topics': topics})
        html = next(page[3] for page in pages if page[0] == '/marx/topics/commune/')
        self.assertIn('日期依据', html)
        self.assertIn('href="/marx/life/letters/"', html)
        self.assertNotIn('相关页面', html)
        self.assertEqual(html.count(topics['commune']['intro']), 1)
        for bad in ({'url': 'javascript:alert(1)', 'locator': '日期', 'checked_on': '2026-10-30'},
                    {'url': address['date_source']['url'], 'locator': '日期', 'checked_on': True},
                    True):
            with self.subTest(date_source=bad):
                self.rejected(lambda r: self.item(r).update(date_source=bad))


if __name__ == '__main__':
    unittest.main()
