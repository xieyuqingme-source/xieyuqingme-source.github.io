"""Read the finished World output; never rebuild, collect or access the network."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import unittest

from world_sources import load_catalog, approved_sources

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / '_site_unified'


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids, self.tags = {}, []
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if 'id' in attrs:
            if attrs['id'] in self.ids: raise AssertionError('Duplicate World HTML ID')
            self.ids[attrs['id']] = attrs


class WorldPublicationTests(unittest.TestCase):
    def test_all_generated_world_pages_keep_chinese_language_and_real_routes(self):
        pages = sorted((SITE / 'world').rglob('index.html'))
        self.assertGreaterEqual(len(pages), 2)
        for path in pages:
            with self.subTest(path=path.relative_to(SITE)):
                text = path.read_text(encoding='utf-8')
                parsed = Page(text)
                self.assertNotIn('{{', text)
                self.assertNotIn('/en/world/', text)
                self.assertTrue(any(tag == 'html' and attrs.get('lang') == 'zh-CN' for tag, attrs in parsed.tags))
                self.assertTrue(any(tag == 'main' and 'data-world' in attrs for tag, attrs in parsed.tags))
                self.assertTrue(any(tag == 'link' and attrs.get('rel') == 'canonical' for tag, attrs in parsed.tags))
                for tag, attrs in parsed.tags:
                    if tag == 'a' and attrs.get('target') == '_blank':
                        self.assertTrue({'noopener', 'noreferrer'} <= set(attrs.get('rel', '').split()))

    def test_sources_are_the_approved_catalog_not_unchecked_personal_recommendations(self):
        text = (SITE / 'world/sources/index.html').read_text(encoding='utf-8')
        parsed = Page(text)
        cards = [attrs for tag, attrs in parsed.tags if 'data-source-card' in attrs]
        self.assertEqual(len(cards), len(approved_sources(load_catalog(ROOT))))
        self.assertFalse(any(attrs.get('data-type') == 'personal' for attrs in cards))
        self.assertIn('data-source-filters', text)

    def test_monthly_search_indexes_link_to_existing_day_pages(self):
        for path in (SITE / 'world/search').glob('*.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            self.assertLessEqual(path.stat().st_size, 32 * 1024 * 1024)
            self.assertTrue(re.fullmatch(r'\d{4}-\d{2}', data['month']))
            for item in data['items']:
                self.assertEqual(item['date'][:7], data['month'])
                self.assertTrue((SITE / item['day_url'].strip('/') / 'index.html').is_file())
                self.assertTrue(item['url'].startswith('https://'))


if __name__ == '__main__':
    unittest.main()
