"""Focused validation and no-JavaScript rendering of the local reading decks."""
import copy
from datetime import date, timedelta
from html.parser import HTMLParser
import json
import hashlib
from pathlib import Path
import unittest

from daily_brief import render_brief_bottom, validate_content


ROOT = Path(__file__).resolve().parent.parent


class ReadingParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.nodes = {}
        self.quote_text = ""
        self.in_quote = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.nodes[attrs["id"]] = (tag, attrs)
        if attrs.get("id") == "daily-quote-text":
            self.in_quote = True

    def handle_endtag(self, tag):
        if tag == "p":
            self.in_quote = False

    def handle_data(self, data):
        if self.in_quote:
            self.quote_text += data


class DailyBriefReadingTests(unittest.TestCase):
    def setUp(self):
        self.content = json.loads((ROOT / "home/daily-content.json").read_text(encoding="utf-8"))

    def test_expanded_pool_has_reviewed_language_sources_and_correct_authorship(self):
        self.assertIs(validate_content(self.content), self.content)
        self.assertEqual(len(self.content["quotes"]), 430)
        counts = {}
        for item in self.content["quotes"]:
            counts[item["author"]["zh-CN"]] = counts.get(item["author"]["zh-CN"], 0) + 1
            self.assertEqual(set(item["url"]), {"zh-CN", "en"})
            for url in item["url"].values():
                self.assertTrue(url.startswith("https://"))
            self.assertTrue(all(value in {"zh-CN", "en"} for value in item.get("source_language", {}).values()))
        self.assertEqual(counts, {"马克思": 110, "恩格斯": 60, "马恩": 80, "列宁": 50, "毛泽东": 100,
                                 "雷锋": 10, "切·格瓦拉": 10, "尼古拉·奥斯特洛夫斯基": 10})

    def test_review_manifest_covers_the_current_text_and_source_of_every_entry(self):
        review = json.loads((ROOT / "home/brief/quotes-review.json").read_text(encoding="utf-8"))
        records = {item["id"]: item for item in review["quotes"]}
        self.assertEqual(len(records), len(self.content["quotes"]))
        self.assertEqual(set(records), {q["id"] for q in self.content["quotes"]})
        for item in self.content["quotes"]:
            record = records[item["id"]]
            for language in ("zh-CN", "en"):
                with self.subTest(id=item["id"], language=language):
                    source = record["sources"][language]
                    self.assertEqual(source["url"], item["url"][language])
                    self.assertEqual(source["language"], item.get("source_language", {}).get(language, language))
                    self.assertEqual(record["texts_sha256"][language], hashlib.sha256(item["text"][language].encode("utf-8")).hexdigest())
                    self.assertRegex(source["source_sha256"], r"^[0-9a-f]{64}$")
                    self.assertTrue(source["locator"].strip())
                    self.assertIn(source["method"], {"site-translation", "verbatim-normalized", "scan-visually-checked"})

    def test_novel_uses_published_translations_and_stays_within_short_excerpt_scope(self):
        items = [q for q in self.content["quotes"] if q["id"].startswith("ostrovsky-steel-")]
        self.assertEqual(len(items), 10)
        self.assertLessEqual(sum(len(q["text"]["en"].split()) for q in items), 200)
        for item in items:
            self.assertIn("黄树南", item["translation_note"]["zh-CN"])
            self.assertIn("R. Prokofieva", item["translation_note"]["en"])
            self.assertIn("1952", item["translation_note"]["en"])
            self.assertIn("/the-making-of-steel/", item["url"]["zh-CN"])
            self.assertIn("/page/n", item["url"]["en"])
            self.assertNotIn("site-translation", item["translation_note"]["en"])

    def test_no_script_cards_render_each_entry_and_its_own_language_link(self):
        for index, item in enumerate(self.content["quotes"]):
            for language, heading in (("zh-CN", "红色语录"), ("en", "Red quotations")):
                with self.subTest(id=item["id"], language=language):
                    # Exercise every card without re-embedding the entire 430-card JSON on every iteration.
                    html = render_brief_bottom({"version": 1, "quotes": [item]}, {}, language, date(1970, 1, 1))
                    parsed = ReadingParser(html)
                    link = parsed.nodes["daily-quote-work"][1]
                    self.assertEqual(link["href"], item["url"][language])
                    self.assertEqual(link["lang"], language)
                    self.assertEqual(link["hreflang"], item.get("source_language", {}).get(language, language))
                    self.assertIn("hidden", parsed.nodes["daily-quote-button"][1])
                    self.assertIn(heading + "</h3>", html)
                    self.assertEqual(parsed.quote_text, item["text"][language])
                    self.assertIn(item["translation_note"][language], html)
                    self.assertNotIn("Daily quotations", html)
                    self.assertNotIn("每日语录", html)

    def test_incomplete_or_unsafe_source_in_either_language_is_rejected(self):
        first = self.content["quotes"][0]
        for sources in ({"zh-CN": first["url"]["zh-CN"]},
                        {"zh-CN": first["url"]["zh-CN"], "en": "javascript:alert(1)"},
                        {"zh-CN": "http://example.org", "en": first["url"]["en"]},
                        {"zh-CN": [], "en": first["url"]["en"]},
                        {"zh-CN": first["url"]["zh-CN"], "en": "https://user:pass@example.org/text"}):
            content = copy.deepcopy(self.content)
            content["quotes"][0]["url"] = sources
            with self.subTest(sources=sources), self.assertRaises(ValueError):
                validate_content(content)

    def test_existing_single_source_fixtures_still_validate_and_render(self):
        content = copy.deepcopy(self.content)
        for item in content["quotes"]:
            item["url"] = item["url"]["zh-CN"]
        validate_content(content)
        html = render_brief_bottom(content, {}, "zh-CN", date(1970, 1, 1))
        self.assertEqual(ReadingParser(html).nodes["daily-quote-work"][1]["href"], content["quotes"][0]["url"])

    def test_quote_count_limit_does_not_affect_daily_news_limits(self):
        content = {"version": 1, "quotes": self.content["quotes"] * 3}
        with self.assertRaisesRegex(ValueError, "between 1 and 1000"):
            validate_content(content)

    def test_duplicate_text_and_unsupported_source_language_are_rejected(self):
        for language in ("zh-CN", "en"):
            content = copy.deepcopy(self.content)
            content["quotes"][1]["text"][language] = "  " + content["quotes"][0]["text"][language] + "！"
            with self.assertRaisesRegex(ValueError, "distinct"):
                validate_content(content)
        for tag in ("javascript:en", "en\" onclick=\"alert(1)", "fr"):
            content = copy.deepcopy(self.content)
            content["quotes"][0]["source_language"] = {"zh-CN": "en", "en": tag}
            with self.assertRaises(ValueError):
                validate_content(content)

    def test_full_pool_daily_rotation_survives_midnight_and_future_dates(self):
        for day in (-1, 0, 429, 430, 431, 100000):
            expected = self.content["quotes"][day % len(self.content["quotes"])]
            html = render_brief_bottom(self.content, {}, "zh-CN", date(1970, 1, 1) + timedelta(days=day))
            self.assertIn(expected["text"]["zh-CN"], html)

    def test_quote_text_is_escaped_and_essay_card_is_preserved(self):
        content = copy.deepcopy(self.content)
        content["quotes"][0]["text"]["en"] = '<script>alert("quotation")</script>'
        own = '<article id="daily-own-quote-card">An essay line</article>'
        html = render_brief_bottom(content, {}, "en", date(1970, 1, 1), own_quote=own)
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn('<script>alert', html)
        self.assertIn(own, html)


if __name__ == "__main__":
    unittest.main()
