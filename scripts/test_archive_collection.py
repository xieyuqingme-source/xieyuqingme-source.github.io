"""Exercise the separate thirty-per-source archive without changing v1 display."""
from datetime import datetime, timedelta
from contextlib import redirect_stderr, redirect_stdout
from email.utils import format_datetime
from html import escape
from io import StringIO
import os
from pathlib import Path
import sys
import tempfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

REPO = next(p for p in Path(__file__).resolve().parents if (p / "home/brief/news-sources.json").is_file())
# Works in scripts/ and in an ignored preparation directory.
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import news_snapshot as news
import news_archive as archive

if os.environ.get("NEWS_ARCHIVE_TEST_TEMP"):
    tempfile.tempdir = os.environ["NEWS_ARCHIVE_TEST_TEMP"]
    Path(tempfile.tempdir).mkdir(parents=True, exist_ok=True)

CONFIG = news.load_sources(REPO)
NOW = datetime(2026, 10, 30, 12, tzinfo=news.UTC)


def feed(source, *, count=50, published=None):
    items = []
    for i in range(count):
        stamp = published if published is not None else format_datetime(NOW - timedelta(minutes=i + 1))
        title = source["id"] + " original " + str(i)
        url = "https://" + source["article_hosts"][0] + "/article/" + str(i) + "?id=12&dep=P"
        items.append("<item><title>" + escape(title) + "</title><link>" + escape(url) + "</link>"
                     + ("<pubDate>" + escape(stamp) + "</pubDate>" if stamp else "") + "</item>")
    return ("<rss><channel>" + "".join(items) + "</channel></rss>").encode()


class ArchiveCollectionTests(unittest.TestCase):
    def test_every_source_archives_thirty_while_display_stays_eight_and_fetches_once(self):
        lookup = {s["feed_url"]: s for s in CONFIG["sources"]}
        calls = []
        def fetch(url, hosts):
            calls.append(url)
            return feed(lookup[url])
        capture = []
        display, report = news.collect_snapshot(CONFIG, fetch=fetch, now=NOW, archive_sink=capture)
        self.assertEqual(len(calls), len(CONFIG["sources"]))
        self.assertEqual(len(display["items"]), 8)
        self.assertEqual(len(capture[0]["items"]), 30 * len(CONFIG["sources"]))
        self.assertEqual(capture[0]["run"]["displayed_ids"], [i["id"] for i in display["items"]])
        self.assertEqual({s["archived"] for s in capture[0]["run"]["sources"]}, {30})
        original, old_report = news.collect_snapshot(CONFIG, fetch=lambda url, hosts: feed(lookup[url]), now=NOW)
        self.assertEqual(display, original)
        self.assertEqual(report, old_report)

    def test_missing_invalid_future_and_old_dates_are_archived_but_not_displayed(self):
        for value, basis in (("", "first-seen-missing"), ("bad date", "first-seen-invalid"),
                             (format_datetime(NOW + timedelta(hours=1)), "first-seen-future"),
                             (format_datetime(NOW - timedelta(days=5)), "published")):
            capture = []
            with self.subTest(value=value), self.assertRaises(ValueError):
                news.collect_snapshot(CONFIG, fetch=lambda url, hosts: feed(CONFIG["sources"][0], count=1, published=value),
                                      now=NOW, archive_sink=capture)
            self.assertEqual(capture[0]["items"][0]["date_basis"], basis)
            self.assertIsNone(capture[0]["run"]["displayed_ids"])
            archive.validate_capture(capture[0], CONFIG)

    def test_all_failed_sources_still_produce_a_true_empty_capture(self):
        def fail(url, hosts):
            raise TimeoutError("Private response must never be stored")
        capture = []
        with self.assertRaises(ValueError):
            news.collect_snapshot(CONFIG, fetch=fail, now=NOW, archive_sink=capture)
        self.assertEqual(capture[0]["items"], [])
        self.assertEqual({s["status"] for s in capture[0]["run"]["sources"]}, {"failed"})
        self.assertNotIn("Private", str(capture[0]))

    def _cli_fixture(self, root, *, fetcher=None):
        lookup = {s["feed_url"]: s for s in CONFIG["sources"]}
        fetcher = fetcher or (lambda url, hosts: feed(lookup[url], count=30))
        original_collect = news.collect_snapshot
        def collect(config, *, archive_sink=None):
            return original_collect(config, fetch=fetcher, now=NOW, archive_sink=archive_sink)
        old_captures = []
        original_collect(CONFIG, fetch=lambda url, hosts: feed(lookup[url], count=1),
                         now=NOW - timedelta(minutes=1), archive_sink=old_captures)
        capture_path = Path(root) / "capture.json"
        archive.write_capture(capture_path, old_captures[0], CONFIG)
        old_bytes = capture_path.read_bytes()
        snapshot_path, output_path = Path(root) / "snapshot.json", Path(root) / "step-output"
        args = ["collect", "--root", str(REPO), "--output", str(snapshot_path),
                "--archive-output", str(capture_path), "--github-output", str(output_path)]
        return collect, args, snapshot_path, capture_path, output_path, old_bytes

    def test_cli_oversize_valid_archive_preserves_eight_item_snapshot_and_old_capture(self):
        lookup = {s["feed_url"]: s for s in CONFIG["sources"]}
        def large_feed(url, hosts):
            source = lookup[url]
            items = []
            for index in range(30):
                title = source["id"] + str(index) + "例" * 450
                link = "https://" + source["article_hosts"][0] + "/story/" + str(index) + "?id=" + "a" * 1700
                items.append("<item><title>" + escape(title) + "</title><link>" + escape(link) + "</link><pubDate>"
                             + format_datetime(NOW - timedelta(minutes=index + 1)) + "</pubDate></item>")
            return ("<rss><channel>" + "".join(items) + "</channel></rss>").encode()
        captured = []
        expected, _ = news.collect_snapshot(CONFIG, fetch=large_feed, now=NOW, archive_sink=captured)
        self.assertEqual(len(captured[0]["items"]), 150)
        self.assertLess(len(news.snapshot_bytes(expected, CONFIG)), news.MAX_SNAPSHOT_BYTES)
        with self.assertRaises(ValueError):
            archive.capture_bytes(captured[0], CONFIG)
        with TemporaryDirectory() as root:
            collect, args, snapshot, capture_path, output, old_bytes = self._cli_fixture(root, fetcher=large_feed)
            stderr = StringIO()
            with patch.object(news, "collect_snapshot", side_effect=collect), redirect_stderr(stderr), redirect_stdout(StringIO()):
                news.main(args)
            self.assertEqual(news._read_json(snapshot), expected)
            self.assertEqual(capture_path.read_bytes(), old_bytes)
            self.assertFalse(output.exists())
            self.assertIn("archive capture unavailable (ValueError)", stderr.getvalue())

    def test_cli_archive_io_failure_preserves_valid_snapshot_and_emits_no_ready_flag(self):
        with TemporaryDirectory() as root:
            collect, args, snapshot, capture_path, output, old_bytes = self._cli_fixture(root)
            stderr = StringIO()
            with patch.object(news, "collect_snapshot", side_effect=collect), patch.object(archive, "_atomic_write", side_effect=PermissionError("Private error detail")), redirect_stderr(stderr), redirect_stdout(StringIO()):
                news.main(args)
            self.assertEqual(len(news.validate_snapshot(news._read_json(snapshot), CONFIG)["items"]), 8)
            self.assertEqual(capture_path.read_bytes(), old_bytes)
            self.assertFalse(output.exists())
            self.assertIn("archive capture unavailable (PermissionError)", stderr.getvalue())
            self.assertNotIn("Private", stderr.getvalue())

    def test_cli_archive_generation_validation_failure_is_isolated_and_success_sets_ready(self):
        with TemporaryDirectory() as root:
            collect, args, snapshot, capture_path, output, old_bytes = self._cli_fixture(root)
            stderr = StringIO()
            with patch.object(news, "collect_snapshot", side_effect=collect), patch.object(news, "_archive_capture", side_effect=ValueError("bad capture")), redirect_stderr(stderr), redirect_stdout(StringIO()):
                news.main(args)
            self.assertEqual(len(news.validate_snapshot(news._read_json(snapshot), CONFIG)["items"]), 8)
            self.assertEqual(capture_path.read_bytes(), old_bytes)
            self.assertFalse(output.exists())
            self.assertIn("archive capture unavailable (ValueError)", stderr.getvalue())
            with patch.object(news, "collect_snapshot", side_effect=collect), redirect_stdout(StringIO()):
                news.main(args)
            self.assertEqual(output.read_text(encoding="utf-8"), "archive_capture_ready=true\n")
            self.assertEqual(archive.validate_capture(news._read_json(capture_path, archive.MAX_CAPTURE_BYTES), CONFIG)["collected_at"], news._stamp(NOW))


if __name__ == "__main__":
    unittest.main()
