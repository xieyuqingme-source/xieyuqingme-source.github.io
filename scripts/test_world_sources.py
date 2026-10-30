"""Directory/collector integration with bounded first-party feed fixtures."""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import gzip
import json
import unittest

import news_archive as archive
import news_snapshot as news
import world_sources as sources

ROOT = Path(__file__).resolve().parent.parent
NOW = datetime(2026, 10, 31, 2, tzinfo=timezone.utc)


class WorldSourcesTests(unittest.TestCase):
    def setUp(self):
        self.catalog = sources.load_catalog(ROOT)
        self.legacy = news.validate_sources(news._read_json(ROOT / news.CONFIG_PATH))

    def test_one_catalog_drives_directory_and_eleven_active_feeds(self):
        config = news.load_sources(ROOT)
        actual = {f['id'] for s in self.catalog['sources'] for f in s['feeds'] if s['status'] == 'approved' and f['collect']}
        self.assertEqual(set(config['collect_ids']), actual)
        self.assertEqual(len(actual), 11)
        self.assertEqual(len(sources.approved_sources(self.catalog)), 59)
        self.assertFalse(any(s['type'] == 'personal' for s in self.catalog['sources']))
        self.assertEqual(len(config['sources']), 15)

    def test_old_seed_and_release_metadata_stay_valid(self):
        config = news.load_sources(ROOT)
        seed = news._read_json(ROOT / news.SEED_PATH)
        self.assertEqual(news.validate_snapshot(seed, config), seed)
        active = {s['id'] for s in news.active_sources(config)}
        self.assertNotIn('guardian-business', active)
        self.assertNotIn('bbc-world', active)
        self.assertNotIn('chinanews-china', active)
        self.assertTrue({'guardian-business', 'bbc-world', 'chinanews-china'} <= {s['id'] for s in config['sources']})

    def test_unapproved_or_mismatched_collection_labels_fail_closed(self):
        for field, value in [('status', 'draft'), ('collect', False)]:
            data = deepcopy(self.catalog)
            source = next(s for s in data['sources'] if s['collect'])
            source[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                sources.validate_catalog(data)

    def test_directory_rejects_script_local_urls_and_private_paths(self):
        for bad in ['javascript:alert(1)', 'https://127.0.0.1/', 'https://localhost/', '/private/', 'file:///notes']:
            data = deepcopy(self.catalog)
            data['sources'][0]['url'] = bad
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                sources.validate_catalog(data)

    def test_legacy_config_bounds_are_not_silently_relaxed(self):
        old = deepcopy(self.legacy)
        old['max_items'] = 9
        with self.assertRaises(ValueError): news.validate_sources(old)
        config = news.load_sources(ROOT)
        self.assertEqual(config['max_items'], 24)
        config['collect_ids'].append('not-a-known-source')
        with self.assertRaises(ValueError): news.validate_sources(config)

    def test_collector_never_fetches_retired_ids(self):
        config = news.load_sources(ROOT)
        fetched = []
        def fetch(url, hosts):
            fetched.append(url)
            return b'<rss><channel/></rss>'
        captures = []
        with self.assertRaises(ValueError): news.collect_snapshot(config, fetch=fetch, now=NOW, archive_sink=captures)
        self.assertEqual(fetched, [s['feed_url'] for s in news.active_sources(config)])
        self.assertEqual(len(captures), 1)
        self.assertEqual(len(captures[0]['run']['sources']), 11)
        self.assertIsNone(captures[0]['run']['displayed_ids'])

    def test_expanded_display_and_archive_survive_the_same_collection(self):
        config = news.load_sources(ROOT)
        by_feed = {source['feed_url']: source for source in news.active_sources(config)}
        def fetch(url, hosts):
            source = by_feed[url]
            host = source['article_hosts'][0]
            items = ''.join('<item><title>Verified fixture ' + source['id'] + '-' + str(i)
                            + '</title><link>https://' + host + '/qa/' + source['id'] + '-' + str(i)
                            + '</link><pubDate>2026-10-31T01:00:00Z</pubDate></item>' for i in range(2))
            return ('<rss><channel>' + items + '</channel></rss>').encode()
        captures = []
        snapshot, report = news.collect_snapshot(config, fetch=fetch, now=NOW, archive_sink=captures)
        self.assertEqual(len(report), 11)
        self.assertEqual(len(snapshot['items']), 20)  # The two BBC feeds share one publisher cap.
        self.assertEqual(len(captures), 1)
        capture = archive.validate_capture(captures[0], config)
        self.assertEqual(len(capture['items']), 22)
        self.assertEqual(len(capture['run']['displayed_ids']), 20)
        with TemporaryDirectory() as temporary:
            archive.merge_captures(temporary, [capture], config=config, now=NOW)
            data = news._read_json(Path(temporary) / archive.relative_path('2026-10-31'), archive.MAX_DAY_BYTES)
            self.assertEqual(len(archive.validate_day(data)['items']), 22)

    def test_rss_article_link_is_not_overwritten_by_an_atom_standout_link(self):
        source = next(s for s in news.load_sources(ROOT)['sources'] if s['id'] == 'nyt-home')
        raw = b'''<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel><item><title>Original mixed-namespace headline</title><link>https://www.nytimes.com/qa/original</link><atom:link rel="standout" href="https://www.nytimes.com/qa/standout"/><pubDate>Sat, 31 Oct 2026 01:00:00 +0000</pubDate></item></channel></rss>'''
        captured = []
        result = news.parse_feed(raw, source, NOW, archive_records=captured)
        self.assertEqual(result[0]['url'], 'https://www.nytimes.com/qa/original')
        self.assertEqual(captured[0]['url'], result[0]['url'])

    def test_atom_update_time_is_not_invented_as_a_publication_or_event_time(self):
        source = next(s for s in news.load_sources(ROOT)['sources'] if s['id'] == 'usgs-significant-week')
        raw = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Original event bulletin</title><link href="https://earthquake.usgs.gov/earthquakes/eventpage/qa"/><updated>2026-10-31T01:00:00.125Z</updated></entry></feed>'''
        captured = []
        self.assertEqual(news.parse_feed(raw, source, NOW, archive_records=captured), [])
        self.assertIsNone(captured[0]['published'])
        self.assertEqual(archive.archive_item(captured[0], source, NOW)['date_basis'], 'first-seen-missing')

    def test_nature_rdf_date_only_is_archived_without_inventing_an_instant(self):
        config = news.load_sources(ROOT)
        source = next(s for s in config['sources'] if s['id'] == 'nature-latest')
        raw = b'''<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Original research title</title><link>https://www.nature.com/articles/example</link><dc:date>2026-10-30</dc:date></item></rdf:RDF>'''
        captured = []
        self.assertEqual(news.parse_feed(raw, source, NOW, archive_records=captured), [])
        self.assertEqual(captured[0]['published'], '2026-10-30')
        item = archive.archive_item(captured[0], source, NOW)
        self.assertIsNone(item['published'])
        self.assertEqual(item['date_basis'], 'first-seen-invalid')
        self.assertEqual(item['archive_date'], '2026-10-31')

    def test_atom_fractional_seconds_and_chinese_traditional_originals(self):
        config = news.load_sources(ROOT)
        source = next(s for s in config['sources'] if s['id'] == 'bbc-zh')
        raw = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>保留繁體原題</title><link href="https://www.bbc.com/zhongwen/trad/example"/><published>2026-10-31T01:02:03.125Z</published></entry></feed>').encode()
        item = news.parse_feed(raw, source, NOW)[0]
        self.assertEqual(item['lang'], 'zh-Hant')
        self.assertEqual(item['title'], '保留繁體原題')
        self.assertEqual(item['published'], '2026-10-31T01:02:03Z')

    def test_only_explicit_community_feed_allows_public_external_article_links(self):
        source = next(s for s in news.load_sources(ROOT)['sources'] if s['id'] == 'hacker-news')
        self.assertIsNone(news.article_hosts(source))
        item = archive.archive_item({'title': 'Community-linked original', 'url': 'https://arxiv.org/abs/2601.00001', 'published': '2026-10-31T01:00:00Z'}, source, NOW)
        self.assertEqual(item['url'], 'https://arxiv.org/abs/2601.00001')
        for bad in ['http://arxiv.org/abs/1', 'https://127.0.0.1/', 'https://example.local/', 'https://user@example.com/']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                archive.archive_item({'title': 'Unsafe', 'url': bad, 'published': None}, source, NOW)
        config = news.load_sources(ROOT)
        source = next(s for s in config['sources'] if s['id'] == 'bbc-top')
        source['link_policy'] = 'public-https'
        with self.assertRaises(ValueError): news.validate_sources(config)

    def test_bounded_gzip_and_invalid_compressed_data(self):
        raw = b'<rss><channel/></rss>'
        self.assertEqual(news.decode_feed_body(gzip.compress(raw), 'gzip'), raw)
        for compressed in [b'not gzip', gzip.compress(b'a' * (news.MAX_FEED_BYTES + 1)), gzip.compress(raw)[:5]]:
            with self.assertRaises(ValueError): news.decode_feed_body(compressed, 'gzip')
        with self.assertRaises(ValueError): news.decode_feed_body(raw, 'br')


if __name__ == '__main__':
    unittest.main()
