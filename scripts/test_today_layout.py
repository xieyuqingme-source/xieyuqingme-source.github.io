"""Offline Today template and optional publication contracts; never rebuild or fetch."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent
PUBLICATION = "--publication" in sys.argv
if PUBLICATION:
    sys.argv.remove("--publication")


class Structure(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.stack, self.ids, self.parents, self.text, self.sections, self.scripts = [], {}, {}, {}, [], []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        identity = attributes.get("id")
        if identity:
            if identity in self.ids:
                raise AssertionError("Duplicate ID: " + identity)
            self.ids[identity] = (tag, attributes)
            self.parents[identity] = [attrs.get("id") for _, attrs in self.stack]
            self.text[identity] = ""
        if tag == "section" and self.stack and self.stack[-1][1].get("id") == "brief-body":
            self.sections.append(identity)
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append((tag, attributes))

    def handle_endtag(self, tag):
        matches = [index for index, (opened, _) in enumerate(self.stack) if opened == tag]
        if matches:
            del self.stack[matches[-1]:]

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        self.handle_endtag(tag)

    def handle_data(self, data):
        for _, attributes in self.stack:
            if attributes.get("id") in self.text:
                self.text[attributes["id"]] += data


class TodayLayoutTests(unittest.TestCase):
    def test_bilingual_structure_weather_and_page_owned_asset_order(self):
        for language in ("", "en/"):
            with self.subTest(language=language):
                html = (ROOT / ("home/" + language + "today.template.html")).read_text(encoding="utf-8")
                page = Structure(html)
                self.assertEqual(page.sections, ["daily-earth", "today-month", "today-year", "today-history", "today-news", "today-reading"])
                self.assertIn("daily-earth", page.parents["today-weather"])
                self.assertEqual(page.ids["weather-more"][0], "details")
                self.assertNotIn("open", page.ids["weather-more"][1])
                for identity in ("weather-map-canvas", "daily-city", "city-search-form", "daily-weather-details"):
                    self.assertIn("weather-more", page.parents[identity])
                self.assertNotIn("weather-more", page.parents["daily-weather-summary"])
                self.assertNotIn("daily-moon-phase", page.ids)
                self.assertNotIn("today-timeline", html)
                self.assertEqual(html.count("data-today-visual="), 4)
                names = ["astronomy-solar.js", "astronomy-cycles.js", "home-today-visuals.js", "home-today.js", "home-daily.js"]
                positions = [page.scripts.index("/assets/" + name) for name in names]
                self.assertEqual(positions, sorted(positions))
                self.assertNotIn("/assets/home-earth.js", page.scripts)
                self.assertNotIn("/assets/vendor/lunar-javascript-1.7.7.js", page.scripts)

    @unittest.skipUnless(PUBLICATION, "Use --publication after the normal local build")
    def test_no_script_output_retains_weekday_progress_elapsed_years_and_both_cards(self):
        for prefix in ("", "en/"):
            with self.subTest(prefix=prefix):
                html = (ROOT / "_site_unified" / prefix / "today/index.html").read_text(encoding="utf-8")
                page = Structure(html)
                self.assertNotIn("{{", html)
                title = page.text["today-title"].strip()
                self.assertRegex(title, r"\d{4}.*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$" if prefix else r"\d{4}年\d{1,2}月\d{1,2}日 星期[一二三四五六日]$")
                self.assertRegex(page.text["today-year-label"], r"\d{4}.*\d+")
                progress = float(page.ids["today-year-track"][1]["aria-valuenow"])
                self.assertTrue(0 <= progress <= 100)
                self.assertIn('class="history-ago"', html)
                for identity in ("daily-quote-text", "english-quote-text", "english-quote-translation"):
                    self.assertTrue(page.text[identity].strip())
                self.assertEqual(html.count('id="daily-quotation-card"'), 1)
                self.assertEqual(html.count('id="english-quotation-card"'), 1)
                self.assertNotIn("open", page.ids["weather-more"][1])
                self.assertIn('class="yl-no-script"', html)


if __name__ == "__main__":
    unittest.main()
