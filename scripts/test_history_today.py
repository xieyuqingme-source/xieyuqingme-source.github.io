"""Check offline coverage, source provenance, and SSR history without any network."""
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json
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
        self.assertTrue(all(item["verification"] in {"automated_import", "editorial_review"} for item in data["items"]))

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
