"""Check offline coverage, source provenance, and SSR history without any network."""
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import hashlib
import unittest

from history_today import ALL_DAYS, MONTHS, history_items, load_history, render_history, validate_history


ROOT = Path(__file__).resolve().parent.parent


def fixture():
    items = []
    for day in sorted(ALL_DAYS):
        month, number = map(int, day.split("-"))
        items.append({"id": f"history-{day}-2000", "month_day": day, "year": 2000,
                      "title": {"zh-CN": "历史标题", "en": "Event title"},
                      "text": {"zh-CN": "有出处的事件。", "en": "A sourced event."},
                      "source": "Wikipedia contributors", "url": "https://en.wikipedia.org/wiki/History",
                      "source_page": f"https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/{MONTHS[month - 1]}_{number}",
                      "source_revision": 123, "verification": "automated_import"})
    return {"version": 1, "attribution": {"zh-CN": "维基百科贡献者，改写。", "en": "Adapted from Wikipedia contributors."},
            "selection_policy": {"zh-CN": "自动整理，非逐条史料核验。", "en": "Imported, not independently verified against original records."}, "items": items}


class HistoryTodayTests(unittest.TestCase):
    def test_actual_collection_covers_366_dates_with_bilingual_sources(self):
        data = load_history(ROOT)
        self.assertEqual({item["month_day"] for item in data["items"]}, ALL_DAYS)
        self.assertTrue(history_items(data, "02-29"))
        self.assertTrue(all(item["verification"] in {"automated_import", "editorial_review", "source_review"} for item in data["items"]))

    def test_expanded_window_has_review_records_for_each_bilingual_event(self):
        data = load_history(ROOT)
        audit = json.loads((ROOT / "home/brief/history-review.json").read_text(encoding="utf-8"))
        self.assertEqual(audit["scope"], {"start": "10-28", "end": "11-30", "days": 34})
        expanded = [item for item in data["items"] if "10-28" <= item["month_day"] <= "11-30"]
        records = {record["id"]: record for record in audit["items"]}
        self.assertEqual(len(records), len(audit["items"]))
        self.assertEqual(set(records), {item["id"] for item in data["items"] if item["verification"] == "source_review"})
        stamps = sorted({item["month_day"] for item in expanded})
        self.assertEqual(len(stamps), 34)
        for stamp in stamps:
            items = history_items(data, stamp)
            self.assertTrue(5 <= len(items) <= 8, stamp)
            for language in ("zh-CN", "en"):
                rendered = render_history(data, language, date(2026, *map(int, stamp.split("-"))))
                self.assertEqual(rendered.count('class="history-item"'), len(items))
                self.assertIn('class="history-more"', rendered)
        for item in expanded:
            record = records[item["id"]]
            self.assertEqual(item["verification"], "source_review")
            self.assertEqual(record["month_day"], item["month_day"])
            self.assertEqual(record["year"], item["year"])
            self.assertEqual([{key: source[key] for key in ("name", "url")} for source in record["sources"]], item["references"])
            self.assertTrue(record["review_note"].strip())
            for source in record["sources"]:
                self.assertTrue(source["note"].strip())
            for language in ("zh-CN", "en"):
                fingerprint = hashlib.sha256((item["title"][language] + "\n" + item["text"][language]).encode("utf-8")).hexdigest()
                self.assertEqual(record["text_sha256"][language], fingerprint)

    def test_all_reviewed_events_keep_matching_bilingual_provenance(self):
        data = load_history(ROOT)
        audit = json.loads((ROOT / "home/brief/history-review.json").read_text(encoding="utf-8"))
        records = {record["id"]: record for record in audit["items"]}
        selected = [item for item in data["items"] if item["verification"] == "source_review"]
        self.assertEqual(set(records), {item["id"] for item in selected})
        for item in selected:
            record=records[item["id"]]
            self.assertEqual((record["month_day"],record["year"]),(item["month_day"],item["year"]))
            self.assertEqual([{key: source[key] for key in ("name","url")} for source in record["sources"]],item["references"])
            for language in ("zh-CN","en"):
                self.assertEqual(record["text_sha256"][language],hashlib.sha256((item["title"][language]+"\n"+item["text"][language]).encode("utf-8")).hexdigest())

    def test_reviewed_institutional_sources_do_not_require_a_wikipedia_revision(self):
        data = fixture()
        item = data["items"][0]
        item.pop("source_page")
        item.pop("source_revision")
        item.update(source="Museum archive", url="https://museum.example.org/pages/home/history/record", verification="source_review")
        item["references"] = [{"name": item["source"], "url": item["url"]},
                              {"name": "Research & records", "url": "https://archive.example.org/record"}]
        validate_history(data)
        for language in ("zh-CN", "en"):
            html = render_history(data, language, date(2026, 1, 1))
            self.assertIn('href="https://museum.example.org/pages/home/history/record"', html)
            self.assertIn('href="https://archive.example.org/record"', html)
            self.assertIn("Research &amp; records", html)
            self.assertNotIn("Special:PermanentLink", html)

    def test_reviewed_references_have_names_safe_distinct_urls_and_a_matching_primary_source(self):
        for references in ([], [{"name": "", "url": "https://example.org/a"}],
                           [{"name": "Source", "url": "https://127.0.0.1/a"}],
                           [{"name": "Source", "url": "https://example.org/a", "private_note": "extra"}],
                           [{"name": "Source", "url": "https://example.org/a"}] * 2,
                           [{"name": "Different primary", "url": "https://example.org/a"}]):
            data = fixture()
            data["items"][0]["references"] = references
            with self.subTest(references=references), self.assertRaises(ValueError):
                validate_history(data)
        for removed in ("source_page", "source_revision"):
            data = fixture()
            data["items"][0].pop(removed)
            with self.subTest(removed=removed), self.assertRaisesRegex(ValueError, "both"):
                validate_history(data)
        data = fixture()
        data["items"][0]["verification"] = "source_review"
        with self.assertRaisesRegex(ValueError, "explicit reviewed"):
            validate_history(data)
        data["items"][0].pop("source_page")
        data["items"][0].pop("source_revision")
        with self.assertRaisesRegex(ValueError, "provenance"):
            validate_history(data)

    def test_missing_date_cannot_be_masked_by_a_duplicate_day(self):
        data = fixture()
        data["items"][-1] = deepcopy(data["items"][0])
        data["items"][-1]["id"] = "extra-january-event"
        with self.assertRaisesRegex(ValueError, "missing"):
            validate_history(data)

    def test_dates_have_exact_format_and_sources_identify_the_same_day(self):
        for day in ("2-29", "02-30", "00-01", "13-01", "01-01 "):
            with self.subTest(day=day), self.assertRaises(ValueError):
                history_items(fixture(), day)
        data = fixture()
        data["items"][0]["source_page"] = "https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/January_2"
        with self.assertRaisesRegex(ValueError, "disagrees"):
            validate_history(data)

    def test_leap_event_requires_a_leap_year_and_no_neighbor_fallback(self):
        data = fixture()
        leap = history_items(data, "02-29")[0]
        leap["year"] = 1900
        with self.assertRaisesRegex(ValueError, "leap"):
            validate_history(data)
        self.assertNotEqual(history_items(data, "02-28")[0]["id"], leap["id"])
        leap["year"] = 2000
        validate_history(data)

    def test_duplicate_ids_and_malformed_provenance_are_rejected(self):
        mutations = (("id", "history-01-02-2000"), ("source_revision", True),
                     ("source_revision", 0), ("verification", "verified"), ("year", True), ("year", 9999))
        for key, value in mutations:
            data = fixture()
            data["items"][0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                validate_history(data)

    def test_unsupported_fields_and_incomplete_translations_fail(self):
        for key, value in (("title", {"en": "Only English"}), ("text", {"zh-CN": "", "en": "Text"}),
                           ("private_note", "not public"), ("source", "C:/Users/private/file.md")):
            data = fixture()
            data["items"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_history(data)

    def test_unsafe_source_links_are_rejected(self):
        for url in ("http://example.com/a", "javascript:alert(1)", "https://user:pass@example.com/a",
                    "https://127.0.0.1/a", "https://example.local/a", "https://example.com/a?token=private"):
            data = fixture()
            data["items"][0]["url"] = url
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_history(data)

    def test_chinese_source_date_url_is_supported(self):
        data = fixture()
        data["items"][0]["source_page"] = "https://zh.wikipedia.org/wiki/Wikipedia:历史上的今天/1月1日"
        validate_history(data)

    def test_first_three_are_visible_and_remaining_events_use_details(self):
        data = fixture()
        for n in range(3):
            extra = deepcopy(data["items"][0])
            extra["id"] = f"extra-event-{n}"
            data["items"].append(extra)
        html = render_history(data, today=date(2026, 1, 1))
        first, rest = html.split('<details class="history-more">')
        self.assertEqual(first.count('class="history-item"'), 3)
        self.assertEqual(rest.count('class="history-item"'), 1)
        self.assertIn("Special:PermanentLink/123", html)
        self.assertIn("history-policy", html)
        self.assertNotIn("<h2", html)

    def test_render_escapes_text_and_uses_beijing_date_at_midnight(self):
        data = fixture()
        for item in data["items"]:
            item["title"]["en"] = "<script>alert('x')</script>"
        html = render_history(data, "en", datetime(2026, 10, 27, 16, 1, tzinfo=timezone.utc))
        self.assertIn('data-history-date="2026-10-28"', html)
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn("<script>", html)
        self.assertIn("Date source", html)
        with self.assertRaises(ValueError):
            render_history(data, today=datetime(2026, 1, 1))

    def test_earliest_three_start_a_single_chronological_timeline(self):
        data = fixture()
        base = deepcopy(data["items"][0])
        for i, year in enumerate((1969, 1863, 1923, 1956, 1991)):
            data["items"].append({**deepcopy(base), "id": "chronology-" + str(i), "year": year})
        original = deepcopy(data["items"])
        expected = sorted(item["year"] for item in data["items"] if item["month_day"] == "01-01")
        for language in ("zh-CN", "en"):
            html = render_history(data, language, date(2026, 1, 1))
            years = [int(value) for value in __import__("re").findall(r'class="history-year-value">(-?\d+)', html)]
            self.assertEqual(years, expected)
            first, more = html.split('<details class="history-more">')
            self.assertEqual([int(value) for value in __import__("re").findall(r'class="history-year-value">(-?\d+)',first)], expected[:3])
            self.assertEqual([int(value) for value in __import__("re").findall(r'class="history-year-value">(-?\d+)',more)], expected[3:])
            self.assertEqual(html.count('class="history-timeline"'), 1)
        self.assertEqual(data["items"], original)

    def test_elapsed_years_use_historical_years_without_year_zero(self):
        from history_today import elapsed_years
        for event, current, expected in ((1863,2026,163),(-539,2026,2564),(-1,2026,2026),(1,2026,2025),(-1,1,1),(-2,-1,1)):
            with self.subTest(event=event,current=current):
                self.assertEqual(elapsed_years(event,current),expected)
        for event, current in ((0,2026),(1,0),(True,2026)):
            with self.assertRaises(ValueError):
                elapsed_years(event,current)
        data=fixture()
        # The collection's existing schema accepts CE years only. Keep that
        # input contract; the conversion above also covers a future BCE import.
        data['items'][0]['year']=1863
        self.assertIn('<small class="history-ago">163年前</small>',render_history(data,today=date(2026,1,1)))
        self.assertIn('<small class="history-ago">163 years ago</small>',render_history(data,'en',date(2026,1,1)))

    def test_loader_rejects_duplicate_json_keys_and_linked_paths(self):
        with TemporaryDirectory(prefix="history-test-", dir=ROOT) as temporary:
            root = Path(temporary)
            directory = root / "home" / "brief"
            directory.mkdir(parents=True)
            target = directory / "history.json"
            raw = json.dumps(fixture(), ensure_ascii=False)
            target.write_text(raw.replace('"version": 1', '"version": 1, "version": 1', 1), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_history(root)
            target.write_text(raw, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "links"):
                load_history(root, linked=lambda path: path.name == "brief")


if __name__ == "__main__":
    unittest.main()
