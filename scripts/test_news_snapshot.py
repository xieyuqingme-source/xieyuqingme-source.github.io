"""Offline tests for automatic news safety, persistence and publication isolation."""
from collections import Counter
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from hashlib import sha256
from html import escape
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import news_snapshot as news


ROOT = Path(__file__).resolve().parent.parent
NOW = datetime(2026, 10, 28, 2, 0, 0, tzinfo=timezone.utc)
# Preserve the v1 eight-item contract independently of the new live catalog.
# test_world_sources exercises the v2 active/retired projection and 24-item cap.
CONFIG = news.validate_sources(news._read_json(ROOT / news.CONFIG_PATH))


def feed(source, count=8, *, title_prefix=None, published=None, link=None):
    items = []
    for i in range(count):
        title = (title_prefix or source["id"]) + " original headline " + str(i)
        url = link or "https://" + source["article_hosts"][0] + "/article/" + source["id"] + "/" + str(i) + "?id=12&dep=P"
        stamp = published if published is not None else format_datetime(NOW - timedelta(minutes=20 + i))
        items.append("<item><title>" + escape(title) + "</title><link>" + escape(url) + "</link>"
                     + ("<pubDate>" + stamp + "</pubDate>" if stamp else "") + "</item>")
    return ("<?xml version='1.0' encoding='UTF-8'?><rss><channel>" + "".join(items) + "</channel></rss>").encode("utf-8")


def collection(config=CONFIG):
    lookup = {source["feed_url"]: source for source in config["sources"]}
    return news.collect_snapshot(config, fetch=lambda url, hosts: feed(lookup[url]), now=NOW)[0]


def fixture(root, data=None):
    folder = Path(root) / "home/brief"
    folder.mkdir(parents=True)
    (folder / "news-sources.json").write_text(json.dumps(CONFIG, ensure_ascii=False), encoding="utf-8")
    news.write_snapshot(folder / "news-snapshot.json", data or collection(), CONFIG)


def asset(data, number=1):
    raw = news.snapshot_bytes(data, CONFIG)
    name = "news-" + news.timestamp(data["collected_at"]).strftime("%Y%m%dT%H%M%SZ") + "-" + sha256(raw).hexdigest()[:12] + ".json"
    return {"id": number, "name": name, "state": "uploaded", "size": len(raw)}, raw


class SourceAndCollectionTests(unittest.TestCase):
    def test_reviewed_sources_cover_domestic_world_economy_science(self):
        self.assertTrue(4 <= len(CONFIG["sources"]) <= 6)
        self.assertEqual({source["category"] for source in CONFIG["sources"]}, set(news.CATEGORIES))
        self.assertTrue(any(source["category"] == "domestic" and source["lang"] == "zh-CN" for source in CONFIG["sources"]))
        for source in CONFIG["sources"]:
            self.assertTrue(source["docs_url"].startswith("https://"))
            self.assertTrue(source["home_url"].startswith("https://"))

    def test_selects_eight_in_editorial_feed_order_with_category_and_media_limits(self):
        data = collection()
        self.assertEqual(len(data["items"]), 8)
        self.assertEqual([item["category"] for item in data["items"][:4]], list(news.CATEGORIES))
        self.assertEqual(data["items"][0]["title"], "chinanews-china original headline 0")
        counts = Counter(item["source_id"] for item in data["items"])
        self.assertLessEqual(max(counts.values()), 2)
        self.assertEqual(data["collected_at"], "2026-10-28T02:00:00Z")
        for item in data["items"]:
            self.assertEqual(set(item), {"id", "category", "title", "source", "source_id", "published", "lang", "url"})
            self.assertIn("?id=12&dep=P", item["url"])
            self.assertNotEqual(item["published"], data["collected_at"])

    def test_one_source_failure_leaves_others_usable_and_never_fills_with_old_news(self):
        lookup = {source["feed_url"]: source for source in CONFIG["sources"]}
        def fetch(url, hosts):
            source = lookup[url]
            if source["category"] == "domestic":
                raise TimeoutError("upstream failed with secret body")
            if source["category"] == "science":
                return feed(source, published=format_datetime(NOW - timedelta(days=4)))
            return feed(source)
        data, report = news.collect_snapshot(CONFIG, fetch=fetch, now=NOW)
        self.assertTrue(0 < len(data["items"]) < 8)
        self.assertEqual({item["category"] for item in data["items"]}, {"world", "economy"})
        self.assertEqual(report[0], {"id": "chinanews-china", "status": "failed", "reason": "TimeoutError"})
        self.assertNotIn("secret", json.dumps(report))

    def test_no_valid_news_is_an_error_not_a_new_empty_edition(self):
        with self.assertRaisesRegex(ValueError, "keep the last"):
            news.collect_snapshot(CONFIG, fetch=lambda url, hosts: b"<rss><channel/></rss>", now=NOW)

    def test_url_and_same_title_deduplication_preserve_real_query_parameters(self):
        config = deepcopy(CONFIG)
        first, second = config["sources"][:2]
        second["article_hosts"] = list(first["article_hosts"])
        second["home_url"] = first["home_url"]
        lookup = {source["feed_url"]: source for source in config["sources"]}
        def fetch(url, hosts):
            source = lookup[url]
            if source["id"] == first["id"]:
                return feed(source, count=1, title_prefix="Same", link="https://www.chinanews.com.cn/a?id=12&utm_source=feed")
            if source["id"] == second["id"]:
                return feed(source, count=1, title_prefix="Another", link="https://www.chinanews.com.cn/a?utm_source=other&id=12")
            return feed(source, count=1, title_prefix="Same")
        data, _ = news.collect_snapshot(config, fetch=fetch, now=NOW)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["url"], "https://www.chinanews.com.cn/a?id=12&utm_source=feed")
        self.assertNotEqual(news.url_key("https://www.bbc.com/a?id=12"), news.url_key("https://www.bbc.com/a?id=13"))

    def test_shared_publisher_cannot_exceed_limit_through_multiple_feeds(self):
        config = deepcopy(CONFIG)
        for source in config["sources"]:
            source["publisher"] = "same-publisher"
        self.assertEqual(len(collection(config)["items"]), 2)

    def test_missing_naive_future_and_old_publication_dates_are_not_invented(self):
        source = CONFIG["sources"][0]
        for value in ("", "not a date", "2026-10-28T01:00:00", format_datetime(NOW + timedelta(seconds=1)), format_datetime(NOW - timedelta(hours=73))):
            with self.subTest(value=value):
                self.assertEqual(news.parse_feed(feed(source, count=1, published=value), source, NOW), [])

    def test_atom_uses_published_and_alternate_url_without_summary(self):
        source = CONFIG["sources"][1]
        raw = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Original &amp; exact title</title><link rel="self" href="https://www.bbc.com/feed/1"/><link rel="alternate" href="https://www.bbc.com/story?id=1"/><published>2026-10-28T01:00:00Z</published><updated>2026-10-28T02:00:00Z</updated><summary>Not republished</summary></entry></feed>'''
        result = news.parse_feed(raw, source, NOW)
        self.assertEqual(result[0]["title"], "Original & exact title")
        self.assertEqual(result[0]["published"], "2026-10-28T01:00:00Z")
        self.assertEqual(result[0]["url"], "https://www.bbc.com/story?id=1")
        self.assertNotIn("summary", result[0])

    def test_rejects_dtd_entities_oversized_and_non_utf8_xml(self):
        source = CONFIG["sources"][0]
        for raw in (b'<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
                    b'<!ENTITY x "unsafe"><rss/>', b"x" * (news.MAX_FEED_BYTES + 1),
                    '<rss/>'.encode('utf-16'), b'<?xml version="1.0" encoding="ISO-8859-1"?><rss/>'):
            with self.subTest(raw=raw[:50]), self.assertRaises((ValueError, UnicodeError)):
                news.parse_feed(raw, source, NOW)


class SafetyAndRenderingTests(unittest.TestCase):
    def test_rejects_private_or_disguised_urls_and_keeps_valid_queries(self):
        invalid = ["http://www.bbc.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a",
                   "https://192.168.1.1/a", "https://example.local/a", "https://example.internal/a", "https://example.test/a",
                   "https://single/a", "https://@www.bbc.com/a", "https://user:pw@www.bbc.com/a", "https://www.bbc.com:444/a",
                   "https://www.bbc.com/a%0aheader", "https://www.bbc.com/a%250d", "https://www.bbc.com/a\\path",
                   "https://www.bbc.com/a?x=" + "%25" * 8 + "0a"]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                news.public_url(value)
        for depth in range(9):
            with self.subTest(encoded_depth=depth), self.assertRaises(ValueError):
                news.public_url("https://www.bbc.com/a%" + "25" * depth + "0a")
        value = "https://www.bbc.com/a?id=12&dep=P&at_campaign=rss"
        self.assertEqual(news.public_url(value, {"www.bbc.com"}), value)
        with self.assertRaises(ValueError):
            news.public_url("https://attacker.example/a", {"www.bbc.com"})

    def test_dns_cannot_connect_to_private_or_mixed_addresses(self):
        for hosts in (("127.0.0.1",), ("93.184.216.34", "10.1.1.1")):
            answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (host, 443)) for host in hosts]
            with self.subTest(hosts=hosts), patch.object(news.socket, "getaddrinfo", return_value=answers), patch.object(news.http.client, "HTTPSConnection") as connection:
                with self.assertRaises(ValueError):
                    news.fetch_feed("https://www.bbc.com/feed", {"www.bbc.com"})
                connection.assert_not_called()

    def test_redirect_outside_the_feed_host_is_rejected_before_second_request(self):
        response = Mock(status=302)
        response.getheader.side_effect = lambda key, default=None: "https://127.0.0.1/private" if key == "Location" else default
        connection = Mock()
        connection.getresponse.return_value = response
        answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        with patch.object(news.socket, "getaddrinfo", return_value=answers), patch.object(news.http.client, "HTTPSConnection", return_value=connection):
            with self.assertRaises(ValueError):
                news.fetch_feed("https://www.bbc.com/feed", {"www.bbc.com"})
        self.assertEqual(connection.request.call_count, 1)

    def test_exact_schema_source_metadata_dates_titles_and_limits(self):
        original = collection()
        changes = [lambda d: d.update(private="x"), lambda d: d.update(version=True),
                   lambda d: d["items"][0].update(summary="made up"),
                   lambda d: d["items"][0].update(title="<script>alert(1)</script>"),
                   lambda d: d["items"][0].update(title="C:\\Users\\someone\\private"),
                   lambda d: d["items"][0].update(lang="fr"),
                   lambda d: d["items"][0].update(source="Not this publisher"),
                   lambda d: d["items"][0].update(published="2026-10-28T02:00:01Z"),
                   lambda d: d["items"][0].update(published="2026-10-20T02:00:00Z"),
                   lambda d: d["items"].append(deepcopy(d["items"][0])),
                   lambda d: d.update(collected_at=None)]
        for change in changes:
            data = deepcopy(original)
            change(data)
            with self.subTest(change=change), self.assertRaises(ValueError):
                news.validate_snapshot(data, CONFIG)

    def test_snapshot_staleness_is_runtime_filter_not_a_fabricated_new_date(self):
        data = collection()
        self.assertTrue(news.visible_items(data, CONFIG, NOW))
        self.assertEqual(news.visible_items(data, CONFIG, NOW + timedelta(hours=73)), [])
        output = news.render_snapshot(data, "zh-CN", CONFIG, now=NOW + timedelta(hours=73))
        self.assertNotIn('<article', output)
        self.assertIn("2026-10-28", output)
        self.assertIn("暂无72小时内", output)
        self.assertEqual(output.count('rel="noopener noreferrer"'), len(CONFIG["sources"]))
        self.assertEqual(data["collected_at"], "2026-10-28T02:00:00Z")

    def test_bilingual_ssr_keeps_original_headlines_and_source_links_optional(self):
        data = collection()
        for lang in ("zh-CN", "en"):
            output = news.render_snapshot(data, lang, CONFIG, now=NOW)
            self.assertEqual(output.count('<article class="news-row">'), 8)
            self.assertIn(data["items"][0]["title"], output)
            self.assertIn('lang="zh-CN"', output)
            self.assertIn('lang="en"', output)
            self.assertIn('id=12&amp;dep=P', output)
            minimal = news.render_snapshot(data, lang, CONFIG, now=NOW, include_sources=False, include_stamp=False)
            self.assertNotIn('news-source-links', minimal)
            self.assertNotIn('news-feed-note', minimal)

    def test_checked_in_seed_is_valid_real_source_data_without_daily_date_assumptions(self):
        data = news.validate_snapshot(news._read_json(ROOT / news.SEED_PATH), CONFIG)
        self.assertTrue(data["items"])
        self.assertIsNotNone(data["collected_at"])
        self.assertLessEqual(len(data["items"]), 8)
        self.assertTrue(any(item["category"] == "domestic" for item in data["items"]))


class PersistenceTests(unittest.TestCase):
    def test_invalid_optional_override_uses_seed_and_never_fetches(self):
        with TemporaryDirectory() as folder:
            fixture(folder)
            bad = Path(folder) / "bad.json"
            bad.write_text('{"version":1,"version":1}', encoding="utf-8")
            with patch.dict(os.environ, {"NEWS_SNAPSHOT_PATH": str(bad)}), patch.object(news, "fetch_feed") as fetch:
                self.assertEqual(news.load_snapshot(folder), collection())
            fetch.assert_not_called()

    def test_optional_future_snapshot_uses_seed(self):
        with TemporaryDirectory() as folder:
            fixture(folder)
            future = collection()
            future["collected_at"] = news._stamp(NOW + timedelta(days=1))
            for item in future["items"]:
                item["published"] = news._stamp(NOW + timedelta(days=1, minutes=-1))
            target = Path(folder) / "future.json"
            news.write_snapshot(target, future, CONFIG)
            with patch.object(news, "_now", return_value=NOW):
                self.assertEqual(news.load_snapshot(folder, target), collection())

    def test_bounded_utf8_atomic_json_and_link_checks(self):
        with TemporaryDirectory() as folder:
            target = Path(folder) / "snapshot.json"
            news.write_snapshot(target, collection(), CONFIG)
            self.assertEqual(news._read_json(target), collection())
            self.assertFalse(list(Path(folder).glob("*.tmp")))
            target.write_bytes(b"x" * (news.MAX_SNAPSHOT_BYTES + 1))
            with self.assertRaises(ValueError):
                news._read_json(target)
            target.write_bytes(b"\xff")
            with self.assertRaises(UnicodeError):
                news._read_json(target)
            with patch.object(Path, "is_symlink", return_value=True), self.assertRaises(ValueError):
                news._read_json(target)

    def test_restore_skips_invalid_newer_asset_and_checks_digest(self):
        data = collection()
        valid, raw = asset(data, 1)
        invalid = dict(id=2, name="news-20261028T030000Z-000000000000.json", state="uploaded", size=20)
        calls = []
        def gh(args, **kwargs):
            calls.append((args, kwargs))
            if args[-1].endswith("tags/news-data"):
                return json.dumps({"assets": [valid, invalid]}).encode()
            return b"not a valid snapshot" if args[-1].endswith("/2") else raw
        with TemporaryDirectory() as folder:
            fixture(folder)
            self.assertEqual(news.restore_snapshot(folder, gh=gh, now=NOW), data)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(call[1]["timeout"] <= news.REQUEST_TIMEOUT for call in calls))

    def test_release_outage_or_timeout_always_falls_back_to_seed(self):
        for error in (OSError("network"), subprocess.TimeoutExpired("gh", 8), ValueError("bad index")):
            with self.subTest(error=error), TemporaryDirectory() as folder:
                fixture(folder)
                self.assertEqual(news.restore_snapshot(folder, gh=Mock(side_effect=error), now=NOW), collection())

    def test_explicit_publish_refuses_local_and_untrusted_runs_without_remote_calls(self):
        gh = Mock()
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            news.publish_snapshot("does-not-exist.json", gh=gh)
        gh.assert_not_called()

    def test_publish_uploads_and_confirms_new_asset_before_cleaning_old_snapshots(self):
        with TemporaryDirectory() as folder:
            fixture(folder)
            target = Path(folder) / "snapshot.json"
            data = collection()
            news.write_snapshot(target, data, CONFIG)
            old = [{"id": i + 1, "name": f"news-202610{i // 24 + 1:02d}T{i % 24:02d}0000Z-{'a' * 12}.json", "state": "uploaded", "size": 20} for i in range(33)]
            assets = list(old)
            calls = []
            def gh(args, **kwargs):
                calls.append(args)
                if args[:2] == ["release", "upload"]:
                    uploaded = Path(args[3])
                    self.assertTrue(uploaded.is_file())
                    self.assertEqual(news._json(uploaded.read_bytes()), data)
                    assets.append({"id": 100, "name": uploaded.name, "state": "uploaded", "size": uploaded.stat().st_size})
                    return b""
                if "DELETE" in args:
                    return b""
                return json.dumps({"assets": assets}).encode()
            env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": news.REPOSITORY, "GITHUB_REF": "refs/heads/main"}
            with patch.dict(os.environ, env), patch.object(news, "_now", return_value=NOW):
                name = news.publish_snapshot(target, folder, gh=gh)
            self.assertTrue(news.ASSET.fullmatch(name))
            upload_index = next(i for i, args in enumerate(calls) if args[:2] == ["release", "upload"])
            delete_indices = [i for i, args in enumerate(calls) if "DELETE" in args]
            self.assertEqual(len(delete_indices), 4)
            self.assertTrue(all(i > upload_index + 1 for i in delete_indices))
            self.assertNotIn("--clobber", str(calls))

    def test_failed_upload_never_deletes_previous_snapshot(self):
        with TemporaryDirectory() as folder:
            fixture(folder)
            target = Path(folder) / "snapshot.json"
            news.write_snapshot(target, collection(), CONFIG)
            calls = []
            def gh(args, **kwargs):
                calls.append(args)
                if args[:2] == ["release", "upload"]:
                    raise OSError("failed upload")
                return b'{"assets":[]}'
            env = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": news.REPOSITORY, "GITHUB_REF": "refs/heads/main"}
            with patch.dict(os.environ, env), patch.object(news, "_now", return_value=NOW), self.assertRaises(OSError):
                news.publish_snapshot(target, folder, gh=gh)
            self.assertFalse(any("DELETE" in args for args in calls))

    def test_workflows_isolate_collection_from_normal_publication_and_never_commit(self):
        update = (ROOT / ".github/workflows/update-news.yml").read_text(encoding="utf-8")
        pages = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
        self.assertIn("20 0,6,12 * * *", update)
        self.assertIn("persist-credentials: false", update)
        self.assertIn("publish --input", update)
        self.assertNotIn("git commit", update)
        self.assertNotIn("git push", update)
        self.assertIn("workflows: [Update news snapshot]", pages)
        self.assertIn("workflow_run.conclusion == 'success'", pages)
        self.assertIn("continue-on-error: true", pages)
        self.assertIn("news_snapshot.py restore", pages)
        self.assertNotIn("news_snapshot.py collect", pages)
        self.assertIn("NEWS_SNAPSHOT_PATH", pages)


if __name__ == "__main__":
    unittest.main()
