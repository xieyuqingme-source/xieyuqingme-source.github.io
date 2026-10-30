"""Offline archive checks; no feed, GitHub or git remote is contacted."""
from copy import deepcopy
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import sys
import tempfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from hashlib import sha256

REPO = next(p for p in Path(__file__).resolve().parents if (p / "home/brief/news-sources.json").is_file())
if os.environ.get("NEWS_ARCHIVE_TEST_TEMP"):
    tempfile.tempdir = os.environ["NEWS_ARCHIVE_TEST_TEMP"]
    Path(tempfile.tempdir).mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(REPO / "scripts"))
import news_snapshot as news
import news_archive as archive

CONFIG = news.load_sources(REPO)
NOW = datetime(2026, 10, 30, 12, tzinfo=news.UTC)
SOURCE = CONFIG["sources"][0]


def capture(stamp=NOW, *, published=None, suffix="one", failed=False):
    items = [] if failed else [archive.archive_item(dict(title="Original headline " + suffix,
                            url="https://" + SOURCE["article_hosts"][0] + "/" + suffix + "?id=12&utm_source=feed",
                            published=published or news._stamp(stamp - timedelta(hours=1))), SOURCE, stamp)]
    report = [dict(source_id=s["id"], status="failed" if failed else "ok", received=0 if failed else len(items),
                   archived=0 if failed or s["id"] != SOURCE["id"] else len(items), eligible=0 if failed else len(items),
                   reason="TimeoutError" if failed else None) for s in CONFIG["sources"]]
    return archive.make_capture(items, report, stamp, [i["id"] for i in items] if items else None)


def day(root, value):
    return news._read_json(Path(root) / archive.relative_path(value), archive.MAX_DAY_BYTES)


def bytes_tree(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in Path(root).rglob("*") if p.is_file()}


class ArchiveTests(unittest.TestCase):
    def _mixed_legacy_release(self):
        legacy = archive.legacy_capture(news._read_json(REPO / "home/brief/news/2026-10-27.json"), now=NOW)
        manual = next(i for i in legacy["items"] if i["source_id"] == "legacy-www-chinanews-com-cn")
        entry = {k: manual[k] for k in ("id", "category", "published", "url")}
        entry.update(title="Earlier original-source headline", source=SOURCE["name"], source_id=SOURCE["id"], lang=SOURCE["lang"])
        release = archive.release_capture(dict(version=1, collected_at="2026-10-28T00:00:00Z", items=[entry]), CONFIG)
        return legacy, release, manual

    def test_beijing_midnight_and_late_previous_day(self):
        left = capture(published="2026-10-29T15:59:00Z", suffix="before")
        right = capture(published="2026-10-29T16:00:00Z", suffix="after")
        self.assertEqual(left["items"][0]["archive_date"], "2026-10-29")
        self.assertEqual(right["items"][0]["archive_date"], "2026-10-30")
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [left, right], config=CONFIG, now=NOW)
            self.assertEqual(len(day(root, "2026-10-29")["items"]), 1)
            self.assertEqual(len(day(root, "2026-10-30")["runs"]), 2)

    def test_canonical_url_and_cross_run_merge_keep_earliest_and_latest_observation(self):
        first, second = capture(), capture(NOW + timedelta(hours=1))
        second["items"][0]["url"] = second["items"][0]["url"].replace("utm_source=feed", "utm_source=other")
        second["items"][0]["title"] = "A later revision"
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [first, second], config=CONFIG, now=NOW + timedelta(hours=1))
            data = day(root, "2026-10-30")
            self.assertEqual(len(data["items"]), 1)
            item = data["items"][0]
            self.assertEqual(item["title"], first["items"][0]["title"])
            self.assertEqual(item["first_seen"], news._stamp(NOW))
            self.assertEqual(item["last_seen"], news._stamp(NOW + timedelta(hours=1)))
            self.assertEqual(item["canonical_url"], "https://www.chinanews.com.cn/one?id=12")
            before = bytes_tree(root)
            archive.merge_captures(root, [first, second], config=CONFIG, now=NOW + timedelta(hours=1))
            self.assertEqual(before, bytes_tree(root))

    def test_three_previous_beijing_days_mutable_fourth_day_frozen(self):
        old = capture(published="2026-10-26T16:00:00Z")
        older = capture(published="2026-10-26T15:59:00Z", suffix="frozen")
        with TemporaryDirectory() as root:
            report = archive.merge_captures(root, [old, older], config=CONFIG, now=NOW)
            self.assertEqual(report["frozen_items"], 1)
            self.assertEqual(len(day(root, "2026-10-27")["items"]), 1)
            self.assertFalse((Path(root) / archive.relative_path("2026-10-26")).exists())

    def test_existing_frozen_file_is_never_reformatted_or_touched(self):
        initial = capture(NOW - timedelta(days=5))
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [initial], config=CONFIG, now=NOW - timedelta(days=5))
            original = bytes_tree(root)
            archive.merge_captures(root, [initial], config=CONFIG, now=NOW)
            self.assertEqual(original, bytes_tree(root))
            with self.assertRaises(ValueError):
                archive.merge_captures(root, [initial], config=CONFIG, now=NOW, bootstrap=True)

    def test_conflicting_canonical_sightings_merge_commutatively(self):
        left = capture()["items"][0]
        right = deepcopy(left)
        right.update(title="A competing headline")
        self.assertEqual(archive.merge_item(left, right), archive.merge_item(right, left))
        third = deepcopy(left)
        right["last_seen"] = news._stamp(NOW + timedelta(hours=1))
        third.update(title="Third headline", last_seen=news._stamp(NOW + timedelta(minutes=30)))
        self.assertEqual(archive.merge_item(archive.merge_item(left, right), third),
                         archive.merge_item(left, archive.merge_item(right, third)))

    def test_missing_invalid_future_dates_keep_reason_without_inventing_publication(self):
        for published, basis in ((None, "first-seen-missing"), ("bad date", "first-seen-invalid"),
                                 ("2026-10-30T13:00:00Z", "first-seen-future")):
            item = archive.archive_item(dict(title="Original headline", url="https://www.chinanews.com.cn/a", published=published), SOURCE, NOW)
            self.assertEqual(item["archive_date"], "2026-10-30")
            self.assertEqual(item["date_basis"], basis)
            self.assertEqual(item["published"], published if basis.endswith("future") else None)
            archive._validate_item(item, CONFIG)

    def test_all_failed_run_is_written_without_fake_headlines(self):
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [capture(failed=True)], config=CONFIG, now=NOW)
            data = day(root, "2026-10-30")
            self.assertEqual(data["items"], [])
            self.assertEqual(len(data["runs"]), 1)
            self.assertIsNone(data["runs"][0]["displayed_ids"])
            self.assertEqual(data["runs"][0]["display_status"], "not-updated")

    def test_validation_failure_changes_no_file_and_creates_no_directory(self):
        good, bad = capture(), capture(suffix="bad")
        bad["items"][0]["title"] = "<script>bad</script>"
        with TemporaryDirectory() as temp:
            root = Path(temp) / "new-root"
            with self.assertRaises(ValueError):
                archive.merge_captures(root, [good, bad], config=CONFIG, now=NOW)
            self.assertFalse(root.exists())
            archive.merge_captures(root, [good], config=CONFIG, now=NOW)
            before = bytes_tree(root)
            with self.assertRaises(ValueError):
                archive.merge_captures(root, [bad], config=CONFIG, now=NOW)
            self.assertEqual(before, bytes_tree(root))

    def test_single_day_size_limit_is_checked_before_any_write(self):
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [capture()], config=CONFIG, now=NOW)
            before = bytes_tree(root)
            with patch.object(archive, "MAX_DAY_BYTES", 100), self.assertRaises(ValueError):
                archive.merge_captures(root, [capture(suffix="second")], config=CONFIG, now=NOW)
            self.assertEqual(before, bytes_tree(root))

    def test_displayed_ids_must_belong_to_the_capture_and_source_counts_are_consistent(self):
        original = capture()
        for kind in ("missing-display", "under-received"):
            bad = deepcopy(original)
            if kind == "missing-display":
                bad["run"]["displayed_ids"] = ["news-" + "0" * 20]
            else:
                bad["run"]["sources"][0]["received"] = 0
            bad["run"]["id"] = archive._digest("run-", {k: v for k, v in bad["run"].items() if k != "id"})
            with self.subTest(kind=kind), TemporaryDirectory() as temp:
                root = Path(temp) / "not-created"
                with self.assertRaises(ValueError):
                    archive.merge_captures(root, [bad], config=CONFIG, now=NOW)
                self.assertFalse(root.exists())

    def test_writer_records_stored_and_frozen_ids_without_changing_run_identity(self):
        incoming = capture()
        frozen_item = capture(published="2026-10-26T15:59:00Z", suffix="frozen")["items"][0]
        incoming["items"].append(frozen_item)
        incoming["run"]["sources"][0].update(received=2, archived=2)
        incoming["run"]["id"] = archive._digest("run-", {k: v for k, v in incoming["run"].items() if k != "id"})
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [incoming], config=CONFIG, now=NOW)
            run = day(root, "2026-10-30")["runs"][0]
            self.assertEqual(run["id"], incoming["run"]["id"])
            self.assertEqual(run["archive_result"], dict(stored_ids=[incoming["items"][0]["id"]], frozen_ids=[frozen_item["id"]]))
            before = bytes_tree(root)
            archive.merge_captures(root, [incoming], config=CONFIG, now=NOW)
            self.assertEqual(before, bytes_tree(root))

    def test_inputs_cannot_supply_merge_results_and_persisted_result_ids_are_disjoint(self):
        incoming = capture()
        incoming["run"]["archive_result"] = dict(stored_ids=[], frozen_ids=[])
        with self.assertRaises(ValueError):
            archive.validate_capture(incoming, CONFIG)
        run = deepcopy(incoming["run"])
        valid_id = incoming["items"][0]["id"]
        for result in (dict(stored_ids=[valid_id], frozen_ids=[valid_id]),
                       dict(stored_ids=[valid_id, valid_id], frozen_ids=[]),
                       dict(stored_ids=["not-an-id"], frozen_ids=[])):
            run["archive_result"] = result
            with self.subTest(result=result), self.assertRaises(ValueError):
                archive._validate_run(run)

    def test_legacy_editions_import_only_headlines_and_mark_uncertain_times(self):
        with TemporaryDirectory() as root:
            captures = [archive.legacy_capture(news._read_json(REPO / f"home/brief/news/{d}.json"), now=NOW) for d in ("2026-10-26", "2026-10-27")]
            archive.merge_captures(root, captures, config=CONFIG, now=NOW, bootstrap=True)
            for d in ("2026-10-26", "2026-10-27"):
                data = day(root, d)
                self.assertEqual(len(data["items"]), 5 if d == "2026-10-26" else 6)
                self.assertEqual(sum(len(i["legacy"]["entries"]) for i in data["items"]), 6)
                for item in data["items"]:
                    self.assertEqual(item["origin"], "legacy-manual")
                    self.assertNotIn("summary", item)
                    self.assertNotIn("priority", item)
                    self.assertEqual(item["legacy"]["edition_date"], d)
            self.assertIsNone(day(root, "2026-10-26")["items"][0]["published"])

    def test_mixed_release_and_legacy_bootstrap_keeps_annotations_in_both_orders_and_retries(self):
        legacy, release, manual = self._mixed_legacy_release()
        primary = release["items"][0]
        self.assertEqual(archive.merge_item(primary, manual), archive.merge_item(manual, primary))
        results = []
        for captures in ([release, legacy], [legacy, release]):
            with TemporaryDirectory() as root:
                archive.merge_captures(root, captures, config=CONFIG, now=NOW, bootstrap=True)
                stored = day(root, "2026-10-27")
                result = next(i for i in stored["items"] if i["id"] == manual["id"])
                self.assertEqual(result["origin"], "release-import")
                self.assertEqual(result["title"], primary["title"])
                self.assertEqual(result["source_id"], primary["source_id"])
                self.assertEqual(result["first_seen"], primary["first_seen"])
                self.assertEqual(result["legacy"], manual["legacy"])
                self.assertEqual(sum(len(i.get("legacy", {}).get("entries", [])) for i in stored["items"]), 6)
                before = bytes_tree(root)
                archive.merge_captures(root, captures, config=CONFIG, now=NOW, bootstrap=True)
                self.assertEqual(before, bytes_tree(root))
                results.append(before)
        self.assertEqual(results[0], results[1])

    def test_existing_first_bucket_and_primary_metadata_keep_legacy_when_earlier_import_differs(self):
        legacy, release, manual = self._mixed_legacy_release()
        first = capture()
        first["items"] = [archive.archive_item(dict(title="Established RSS headline", url=manual["url"],
                                                      published="2026-10-29T12:00:00Z"), SOURCE, NOW)]
        first["run"]["displayed_ids"] = [manual["id"]]
        first["run"]["id"] = archive._digest("run-", {k: v for k, v in first["run"].items() if k != "id"})
        with TemporaryDirectory() as root:
            archive.merge_captures(root, [first], config=CONFIG, now=NOW)
            archive.merge_captures(root, [release, legacy], config=CONFIG, now=NOW, bootstrap=True)
            stored = day(root, "2026-10-29")["items"][0]
            self.assertEqual(stored["archive_date"], "2026-10-29")
            self.assertEqual(stored["origin"], "rss")
            self.assertEqual(stored["title"], "Established RSS headline")
            self.assertEqual(stored["published"], "2026-10-29T12:00:00Z")
            self.assertEqual(stored["legacy"], manual["legacy"])
            self.assertNotIn(manual["id"], {i["id"] for i in day(root, "2026-10-27")["items"]})

    def test_merged_legacy_notes_retain_each_edition_and_are_associative_and_bounded(self):
        _, release, manual = self._mixed_legacy_release()
        first, second = deepcopy(manual), deepcopy(manual)
        first["legacy"]["entries"] = [{**manual["legacy"]["entries"][0], "id": "edition-27-" + str(i)} for i in range(30)]
        second.update(archive_date="2026-10-26", published=None)
        second["legacy"]["edition_date"] = "2026-10-26"
        second["legacy"]["entries"] = [{**manual["legacy"]["entries"][0], "id": "edition-26-" + str(i)} for i in range(30)]
        archive._validate_item(first, CONFIG)
        archive._validate_item(second, CONFIG)
        primary = release["items"][0]
        left = archive.merge_item(archive.merge_item(primary, first), second)
        right = archive.merge_item(primary, archive.merge_item(first, second))
        self.assertEqual(left, right)
        self.assertEqual(left, archive.merge_item(second, archive.merge_item(first, primary)))
        self.assertEqual(len(left["legacy"]["entries"]), 60)
        self.assertEqual({e.get("edition_date", left["legacy"]["edition_date"]) for e in left["legacy"]["entries"]}, {"2026-10-26", "2026-10-27"})
        self.assertEqual(archive.merge_item(left, first), left)
        archive._validate_item(left, CONFIG, stored=True)
        too_large = deepcopy(left)
        too_large["legacy"]["entries"].append(deepcopy(too_large["legacy"]["entries"][0]))
        with self.assertRaises(ValueError):
            archive._validate_item(too_large, CONFIG, stored=True)

    def test_capture_cannot_spoof_merged_legacy_annotations_or_extra_edition_dates(self):
        legacy, release, manual = self._mixed_legacy_release()
        for incoming in (capture(), release):
            incoming["items"][0]["legacy"] = deepcopy(manual["legacy"])
            with self.subTest(origin=incoming["origin"]), self.assertRaises(ValueError):
                archive.validate_capture(incoming, CONFIG)
        legacy["items"][0]["legacy"]["entries"][0]["edition_date"] = "2026-10-27"
        with self.assertRaises(ValueError):
            archive.validate_capture(legacy, CONFIG)
        stored = archive.merge_item(release["items"][0], manual)
        stored["legacy"]["entries"][0]["title"] = "<unsafe>"
        with self.assertRaises(ValueError):
            archive._validate_item(stored, CONFIG, stored=True)

    def test_release_import_has_unknown_source_results_and_original_eight_ids(self):
        snapshot = news._read_json(REPO / news.SEED_PATH)
        result = archive.release_capture(snapshot, CONFIG)
        self.assertEqual(result["run"]["displayed_ids"], [item["id"] for item in snapshot["items"]])
        self.assertTrue(all(s["status"] == "unknown" for s in result["run"]["sources"]))
        self.assertTrue(all(i["origin"] == "release-import" for i in result["items"]))

    def test_local_publish_guard_never_invokes_a_remote_process(self):
        with patch.dict(archive.os.environ, {}, clear=True), patch.object(archive.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                archive._trusted_actions()
            run.assert_not_called()

    def test_rejected_push_refetches_and_merges_without_force_or_main_checkout(self):
        calls, pushes = [], []
        def git(arguments, **kwargs):
            calls.append(arguments)
            if arguments[:3] == ["diff", "--cached", "--quiet"]:
                return 1
            if arguments[0] == "push":
                pushes.append(arguments)
                return 1 if len(pushes) == 1 else 0
            return 0
        refs = iter([FileNotFoundError(), {"object": {"sha": "a" * 40}}])
        def gh(arguments, **kwargs):
            result = next(refs)
            if isinstance(result, Exception):
                raise result
            return json.dumps(result).encode()
        env = dict(GITHUB_ACTIONS="true", GITHUB_REPOSITORY=news.REPOSITORY, GITHUB_REF="refs/heads/main")
        with patch.dict(archive.os.environ, env):
            result = archive.publish_archive(capture(), REPO, git=git, gh=gh, now=NOW)
        self.assertEqual(result["attempts"], 2)
        self.assertEqual(len(pushes), 2)
        first_push = next(n for n, args in enumerate(calls) if args[0] == "push")
        refetch = next(n for n, args in enumerate(calls) if args[0] == "fetch")
        self.assertGreater(refetch, first_push)
        self.assertNotIn("--force", str(calls))
        self.assertTrue(all("main" not in str(args) for args in calls))

    def test_manual_release_import_checks_hash_before_accepting_any_capture(self):
        snapshot = news._read_json(REPO / news.SEED_PATH)
        raw = news.snapshot_bytes(snapshot, CONFIG)
        name = "news-" + news.timestamp(snapshot["collected_at"]).strftime("%Y%m%dT%H%M%SZ") + "-" + sha256(raw).hexdigest()[:12] + ".json"
        asset = dict(id=1, name=name, state="uploaded", size=len(raw))
        def gh(arguments, **kwargs):
            return json.dumps({"assets": [asset]}).encode() if arguments[-1].endswith("tags/news-data") else raw
        env = dict(GITHUB_ACTIONS="true", GITHUB_REPOSITORY=news.REPOSITORY, GITHUB_REF="refs/heads/main")
        with patch.dict(archive.os.environ, env):
            captures = archive.release_captures(CONFIG, gh=gh, now=NOW)
            self.assertEqual(len(captures), 1)
            asset["name"] = asset["name"].replace(sha256(raw).hexdigest()[:12], "0" * 12)
            with self.assertRaises(ValueError):
                archive.release_captures(CONFIG, gh=gh, now=NOW)


if __name__ == "__main__":
    unittest.main()
