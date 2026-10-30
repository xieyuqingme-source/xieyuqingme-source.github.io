"""Offline contracts for local archive views; no build, feed, git or GitHub."""
from copy import deepcopy
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import news_archive as archive
import news_snapshot as news
import world_archive as world


if os.environ.get("WORLD_ARCHIVE_TEST_TEMP"):
    tempfile.tempdir = os.environ["WORLD_ARCHIVE_TEST_TEMP"]
    Path(tempfile.tempdir).mkdir(parents=True, exist_ok=True)

NOW = datetime(2026, 10, 31, 0, tzinfo=news.UTC)
SOURCE = dict(id="bbc-world", publisher="bbc", name="BBC News", category="world", lang="en", article_hosts=["www.bbc.com"])


def instant(day):
    return news.timestamp(day + "T12:00:00Z")


def item(day, suffix=None, *, published="valid"):
    seen = instant(day)
    value = news._stamp(seen - timedelta(hours=1)) if published == "valid" else published
    return archive.archive_item(dict(title="Original headline " + (suffix or day),
                                    url="https://www.bbc.com/news/" + (suffix or day) + "?id=12&utm_source=feed",
                                    published=value), SOURCE, seen)


def run(day, entries=(), *, status="ok", origin="rss", hour=12, outcomes=True):
    collected = instant(day).replace(hour=hour)
    unknown = status == "unknown"
    report = [dict(source_id=SOURCE["id"], status=status, received=None if unknown else len(entries),
                   archived=len(entries), eligible=None if unknown else len(entries), reason="TimeoutError" if status == "failed" else None)]
    result = archive.make_capture(list(entries), report, collected, [i["id"] for i in entries] if entries else None, origin=origin)["run"]
    if origin == "release-import":
        result["displayed_ids"] = [i["id"] for i in entries]
        result["display_status"] = "imported"
        result["id"] = archive._digest("run-", {k: v for k, v in result.items() if k != "id"})
    if outcomes:
        result["archive_result"] = dict(stored_ids=[i["id"] for i in entries], frozen_ids=[])
    return result


def day_data(day, *, entries=None, runs=None):
    entries = [item(day)] if entries is None else entries
    data = archive.empty_day(day)
    data.update(items=entries, runs=[run(day, entries)] if runs is None else runs)
    return data


def write_day(root, data, *, path=None):
    target = Path(root) / (path or archive.relative_path(data["date"]))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(archive.day_bytes(data))
    return target


def manual_item(day="2026-10-27", *, suffix="manual"):
    source = {**SOURCE, "id": "legacy-www-bbc-com", "publisher": "legacy-www-bbc-com", "lang": "zh-CN"}
    result = archive.archive_item(dict(title="旧人工样刊标题", url="https://www.bbc.com/news/" + suffix, published=None), source, NOW, origin="legacy-manual")
    result.update(archive_date=day, date_basis="legacy-edition",
                  legacy=dict(edition_date=day, entries=[dict(id="manual-old-id", title="旧人工样刊标题", title_en="Old manual title", published_original="2026-10-26")]))
    return result


class WorldArchiveTests(unittest.TestCase):
    def test_missing_and_valid_empty_archive_are_distinct_without_implicit_sources(self):
        with TemporaryDirectory() as root:
            missing = world.load_archive(root, now=NOW)
            self.assertFalse(missing["available"])
            self.assertEqual(missing["message"], "存档暂不可用")
            (Path(root) / "archive").mkdir()
            empty = world.load_archive(root, now=NOW)
            self.assertTrue(empty["available"])
            self.assertFalse(empty["has_data"])
            self.assertEqual(empty["message"], "尚无存档数据")
            self.assertEqual(world.recent_days(empty), [])
            self.assertIsNone(world.year_ago(empty))
            self.assertEqual(world.month_view(empty, "2026-10")["message"], "该月无存档")
            self.assertEqual(world.day_view(empty, "2026-10-31")["message"], "该日无存档")
            self.assertFalse(world.load_archive(None, now=NOW)["available"])

    def test_empty_failed_day_is_real_zero_not_a_missing_or_unavailable_date(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2026-10-30", entries=[], runs=[run("2026-10-30", status="failed")]))
            store = world.load_archive(root, now=NOW)
            self.assertTrue(store["available"])
            self.assertTrue(store["has_data"])
            daily = world.day_view(store, "2026-10-30")
            self.assertTrue(daily["exists"])
            self.assertEqual(daily["items"], [])
            self.assertEqual(daily["collection"]["status"], "failed")
            self.assertEqual(daily["runs"][0]["sources"][0]["captured"], 0)
            self.assertIsNone(daily["runs"][0]["generated_snapshot_ids"])
            month = world.month_view(store, "2026-10")
            self.assertEqual(month["days"][29]["item_count"], 0)
            self.assertIsNone(month["days"][28]["item_count"])
            self.assertFalse(month["days"][28]["exists"])

    def test_invalid_file_rejects_entire_snapshot_and_leaks_no_local_path(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2026-10-29"))
            bad = write_day(root, day_data("2026-10-30"))
            for content in (b'{"version":1,"version":1}', b'\xff', b'{"private":"C:\\\\Users\\\\someone"}'):
                with self.subTest(content=content):
                    bad.write_bytes(content)
                    store = world.load_archive(root, now=NOW)
                    self.assertFalse(store["available"])
                    self.assertEqual(store["days"], {})
                    self.assertEqual(world.month_search_index(store, "2026-10")["items"], [])
                    self.assertEqual(world.day_view(store, "2026-10-29")["message"], world.UNAVAILABLE)
                    self.assertNotIn(str(root), json.dumps(store))
                    self.assertNotIn("someone", json.dumps(store))

    def test_deeply_nested_json_is_unavailable_without_leaking_partial_data_or_paths(self):
        with TemporaryDirectory() as root:
            valid = day_data("2026-10-29")
            write_day(root, valid)
            bad = Path(root) / archive.relative_path("2026-10-30")

            def assert_unavailable():
                store = world.load_archive(root, now=NOW)
                self.assertFalse(store["available"])
                self.assertFalse(store["has_data"])
                self.assertEqual(store["message"], "存档暂不可用")
                self.assertEqual(store["dates"], [])
                self.assertEqual(store["months"], [])
                self.assertEqual(store["days"], {})
                self.assertEqual(store["source_names"], {})
                self.assertEqual(world.month_search_index(store, "2026-10")["items"], [])
                self.assertEqual(world.day_view(store, "2026-10-29")["message"], world.UNAVAILABLE)
                self.assertNotIn(str(root), json.dumps(store))
                self.assertNotIn("Original headline", json.dumps(store))

            # JSON C-parser recursion limits vary across supported interpreters.
            for depth in (1500, 5000):
                with self.subTest(depth=depth):
                    bad.write_text("[" * depth + "0" + "]" * depth, encoding="utf-8")
                    self.assertLess(bad.stat().st_size, archive.MAX_DAY_BYTES)
                    assert_unavailable()
            with patch.object(news, "_read_json", side_effect=[valid, RecursionError(str(root))]) as read:
                assert_unavailable()
                self.assertEqual(read.call_count, 2)

    def test_wrong_path_and_oversized_file_are_rejected_using_archive_bounds(self):
        with TemporaryDirectory() as root:
            path = write_day(root, day_data("2026-10-30"), path=Path("archive/2026/11/2026-10-30.json"))
            self.assertFalse(world.load_archive(root, now=NOW)["available"])
            path.unlink()
            path = write_day(root, day_data("2026-10-30"))
            path.write_bytes(b"x" * (archive.MAX_DAY_BYTES + 1))
            self.assertFalse(world.load_archive(root, now=NOW)["available"])

    def test_symlinks_and_junctions_are_rejected_before_any_json_read(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2026-10-30"))
            for kind in ("is_symlink", "is_junction"):
                with self.subTest(kind=kind), patch.object(Path, kind, return_value=True, create=True), patch.object(news, "_read_json") as read:
                    result = world.load_archive(root, now=NOW)
                    self.assertFalse(result["available"])
                    self.assertEqual(result["message"], world.UNAVAILABLE)
                    read.assert_not_called()

    def test_reused_canonical_id_in_separate_day_files_is_not_silently_combined(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2026-10-29", entries=[item("2026-10-29", "same-url")]))
            write_day(root, day_data("2026-10-30", entries=[item("2026-10-30", "same-url")]))
            self.assertFalse(world.load_archive(root, now=NOW)["available"])

    def test_calendar_adjacent_dates_are_separate_from_nearest_available_dates(self):
        with TemporaryDirectory() as root:
            for stamp in ("2026-10-27", "2026-10-29", "2026-10-30"):
                write_day(root, day_data(stamp))
            store = world.load_archive(root, now=NOW)
            result = world.day_view(store, "2026-10-29")
            self.assertIsNone(result["previous"])
            self.assertEqual(result["previous_available"]["date"], "2026-10-27")
            self.assertEqual(result["next"], dict(date="2026-10-30", url="/world/2026/10/30/"))
            self.assertEqual(result["next"], result["next_available"])

    def test_full_day_and_month_index_are_complete_while_only_calendar_previews_are_short(self):
        with TemporaryDirectory() as root:
            entries = [item("2026-10-30", "headline-" + str(i)) for i in range(60)]
            write_day(root, day_data("2026-10-30", entries=entries, runs=[]))
            store = world.load_archive(root, now=NOW)
            daily = world.day_view(store, "2026-10-30")
            self.assertEqual(len(daily["items"]), 60)
            self.assertEqual(daily["collection"]["status"], "unrecorded")
            month = world.month_view(store, "2026-10")
            self.assertEqual(len(month["days"]), 31)
            self.assertEqual(month["item_count"], 60)
            self.assertEqual(len(month["days"][29]["preview"]), 3)
            index = world.month_search_index(store, "2026-10")
            self.assertEqual(len(index["items"]), 60)
            self.assertEqual({entry["id"] for entry in index["items"]}, {entry["id"] for entry in entries})
            self.assertEqual(set(index["items"][0]), {"id", "date", "title", "source", "url", "day_url", "lang", "origin", "date_basis", "search_titles"})
            self.assertTrue(all(entry["url"].startswith("https://www.bbc.com/") for entry in index["items"]))
            self.assertTrue(all(entry["day_url"] == "/world/2026/10/30/" for entry in index["items"]))
            json.dumps(index, ensure_ascii=False)

    def test_unknown_import_status_and_old_missing_writer_results_are_not_zero_or_live_success(self):
        with TemporaryDirectory() as root:
            entries = [item("2026-10-30")]
            entries[0]["origin"] = "release-import"
            imported = run("2026-10-30", entries, status="unknown", origin="release-import", outcomes=False)
            imported["sources"][0]["archived"] = None
            imported["id"] = archive._digest("run-", {k: v for k, v in imported.items() if k != "id"})
            write_day(root, day_data("2026-10-30", entries=entries, runs=[imported]))
            store = world.load_archive(root, now=NOW)
            daily = world.day_view(store, "2026-10-30")
            self.assertEqual(daily["collection"]["status"], "imported")
            self.assertEqual(daily["collection"]["unknown_source_results"], 1)
            self.assertIsNone(daily["collection"]["captured_observations"])
            self.assertIsNone(daily["collection"]["stored_observations"])
            self.assertIsNone(daily["collection"]["latest_live_collected_at"])
            self.assertEqual(daily["runs"][0]["generated_snapshot_ids"], [entries[0]["id"]])
            self.assertIn("不代表页面实际部署", daily["runs"][0]["snapshot_note"])

    def test_partial_live_runs_preserve_actual_counts_and_failed_snapshot_state(self):
        with TemporaryDirectory() as root:
            entries = [item("2026-10-30")]
            runs = [run("2026-10-30", entries), run("2026-10-30", status="failed", hour=13)]
            write_day(root, day_data("2026-10-30", entries=entries, runs=runs))
            result = world.day_view(world.load_archive(root, now=NOW), "2026-10-30")
            self.assertEqual(result["collection"]["status"], "partial")
            self.assertEqual(result["collection"]["live_run_count"], 2)
            self.assertEqual(result["collection"]["captured_observations"], 1)
            self.assertEqual(result["collection"]["stored_observations"], 1)
            self.assertEqual(result["collection"]["frozen_observations"], 0)
            self.assertEqual(result["runs"][1]["snapshot_state"], "not-updated")
            self.assertIsNone(result["runs"][1]["generated_snapshot_ids"])

    def test_manual_observation_time_is_not_claimed_as_that_editions_live_collection(self):
        with TemporaryDirectory() as root:
            entry = manual_item()
            source = dict(source_id=entry["source_id"], status="unknown", received=None, eligible=None, archived=1, reason=None)
            manual_run = archive.make_capture([entry], [source], NOW, [entry["id"]], origin="legacy-manual")["run"]
            manual_run["display_status"] = "legacy-manual"
            manual_run["id"] = archive._digest("run-", {k: v for k, v in manual_run.items() if k != "id"})
            write_day(root, day_data("2026-10-27", entries=[entry], runs=[manual_run]))
            view = world.day_view(world.load_archive(root, now=NOW), "2026-10-27")
            self.assertEqual(view["collection"]["status"], "manual")
            self.assertIsNone(view["collection"]["latest_live_collected_at"])
            self.assertEqual(view["runs"][0]["recorded_beijing_date"], "2026-10-31")
            self.assertIsNone(view["runs"][0]["generated_snapshot_ids"])
            self.assertEqual(view["runs"][0]["manual_edition_ids"], [entry["id"]])
            self.assertTrue(view["items"][0]["provenance"]["manual_title"])
            self.assertIsNone(view["items"][0]["published"])

    def test_rss_primary_with_legacy_notes_keeps_identity_and_searches_manual_titles(self):
        with TemporaryDirectory() as root:
            legacy = manual_item(suffix="same-story")
            primary = archive.archive_item(dict(title="Original RSS headline", url=legacy["url"], published="2026-10-27T01:00:00Z"), SOURCE, instant("2026-10-27"))
            merged = archive.merge_item(primary, legacy)
            write_day(root, day_data("2026-10-27", entries=[merged], runs=[]))
            store = world.load_archive(root, now=NOW)
            entry = world.day_view(store, "2026-10-27")["items"][0]
            self.assertEqual(entry["origin"], "rss")
            self.assertFalse(entry["provenance"]["manual_title"])
            self.assertTrue(entry["provenance"]["has_legacy_annotation"])
            titles = world.month_search_index(store, "2026-10")["items"][0]["search_titles"]
            self.assertEqual(titles, ["Original RSS headline", "旧人工样刊标题", "Old manual title"])

    def test_publication_fallback_and_current_freeze_do_not_rebucket_or_rewrite_data(self):
        with TemporaryDirectory() as root:
            entries = [item("2026-10-27", "missing", published=None), item("2026-10-27", "invalid", published="not a date"),
                       item("2026-10-27", "date-only", published="2026-10-26"),
                       item("2026-10-27", "future", published="2026-10-28T12:00:00Z")]
            path = write_day(root, day_data("2026-10-27", entries=entries))
            before = path.read_bytes()
            result = world.day_view(world.load_archive(root, now=NOW), "2026-10-27")
            self.assertTrue(result["frozen"])
            self.assertEqual({entry["archive_date"] for entry in result["items"]}, {"2026-10-27"})
            self.assertEqual({entry["date_basis"] for entry in result["items"]}, {"first-seen-missing", "first-seen-invalid", "first-seen-future"})
            self.assertTrue(all(not entry["provenance"]["publication_date_used"] for entry in result["items"]))
            date_only = next(entry for entry in result["items"] if entry["title"].endswith("date-only"))
            self.assertEqual(date_only["date_basis"], "first-seen-invalid")
            self.assertIsNone(date_only["published"])
            self.assertIn("没有有效的完整发布时间", date_only["provenance"]["date_basis_label"])
            self.assertEqual(path.read_bytes(), before)

    def test_recent_window_is_calendar_seven_days_not_the_last_seven_available_files(self):
        with TemporaryDirectory() as root:
            for stamp in ("2026-10-01", "2026-10-24", "2026-10-25", "2026-10-28", "2026-10-31"):
                write_day(root, day_data(stamp))
            store = world.load_archive(root, now=NOW)
            self.assertEqual([day["date"] for day in world.recent_days(store)], ["2026-10-31", "2026-10-28", "2026-10-25"])
            self.assertEqual([day["date"] for day in world.recent_days(store, end="2026-10-30")], ["2026-10-28", "2026-10-25", "2026-10-24"])

    def test_exact_year_ago_requires_titles_and_never_borrows_february_28(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2025-10-31", entries=[item("2025-10-31", str(i)) for i in range(5)]))
            write_day(root, day_data("2025-10-30", entries=[], runs=[run("2025-10-30", status="failed")]))
            write_day(root, day_data("2027-02-28"))
            store = world.load_archive(root, now=NOW)
            result = world.year_ago(store)
            self.assertEqual(result["date"], "2025-10-31")
            self.assertEqual(result["item_count"], 5)
            self.assertEqual(len(result["preview"]), 3)
            self.assertIsNone(world.year_ago(store, today="2026-10-30"))
            self.assertIsNone(world.year_ago(store, today="2028-02-29"))
            self.assertEqual(len(world.month_view(store, "2028-02")["days"]), 29)

    def test_views_are_independent_json_data_and_all_read_paths_remain_offline(self):
        with TemporaryDirectory() as root:
            write_day(root, day_data("2026-10-30"))
            with (patch.object(news, "fetch_feed") as feed, patch.object(news, "_gh") as gh,
                  patch.object(archive, "_git") as git, patch.object(socket, "getaddrinfo") as dns,
                  patch.object(subprocess, "run") as process):
                store = world.load_archive(root, now=NOW)
                first = world.day_view(store, "2026-10-30")
                first["items"][0]["title"] = "Caller changed its own view"
                second = world.day_view(store, "2026-10-30")
                self.assertNotEqual(first["items"][0]["title"], second["items"][0]["title"])
                for payload in (second, world.month_view(store, "2026-10"), world.month_search_index(store, "2026-10"), world.recent_days(store)):
                    json.dumps(payload, ensure_ascii=False)
                for tool in (feed, gh, git, dns, process):
                    tool.assert_not_called()


if __name__ == "__main__":
    unittest.main()
