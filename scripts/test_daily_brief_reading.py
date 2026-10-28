"""Focused validation and no-JavaScript rendering of the local reading decks."""
import copy
from datetime import date, timedelta
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest

from daily_brief import render_brief_bottom, validate_content


ROOT = Path(__file__).resolve().parent.parent


class ReadingParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.nodes = {}
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.nodes[attrs["id"]] = (tag, attrs)


class DailyBriefReadingTests(unittest.TestCase):
    def setUp(self):
        self.content = json.loads((ROOT / "home/daily-content.json").read_text(encoding="utf-8"))

    def test_all_twenty_entries_have_separate_reviewed_language_sources(self):
        self.assertIs(validate_content(self.content), self.content)
        self.assertEqual(len(self.content["quotes"]), 20)
        counts = {}
        for item in self.content["quotes"]:
            counts[item["author"]["zh-CN"]] = counts.get(item["author"]["zh-CN"], 0) + 1
            self.assertEqual(set(item["url"]), {"zh-CN", "en"})
            self.assertTrue(item["url"]["zh-CN"].startswith("https://www.marxists.org/chinese/"))
            self.assertRegex(item["url"]["en"], r"^https://www\.marxists\.org/(?:archive|reference/archive)/")
            self.assertIn("MIA", item["translation_note"]["en"])
            self.assertNotIn("this site", item["translation_note"]["en"])
        self.assertEqual(counts, {"马克思": 5, "恩格斯": 5, "列宁": 5, "毛泽东": 5})

    def test_no_script_cards_render_each_entry_and_its_own_language_link(self):
        for index, item in enumerate(self.content["quotes"]):
            for language, heading in (("zh-CN", "红色语录"), ("en", "Red quotations")):
                with self.subTest(id=item["id"], language=language):
                    html = render_brief_bottom(self.content, {}, language, date(1970, 1, 1) + timedelta(days=index))
                    parsed = ReadingParser(html)
                    link = parsed.nodes["daily-quote-work"][1]
                    self.assertEqual(link["href"], item["url"][language])
                    self.assertEqual(link["lang"], language)
                    self.assertEqual(link["hreflang"], language)
                    self.assertIn("hidden", parsed.nodes["daily-quote-button"][1])
                    self.assertIn(heading + "</h3>", html)
                    self.assertIn(item["text"][language], html)
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
