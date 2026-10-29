"""Focused validation and no-JavaScript rendering of the local reading decks."""
import copy
from datetime import date, timedelta
from html.parser import HTMLParser
import json
import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from daily_brief import (render_brief_bottom, validate_content, validate_english_quotes,
                         load_english_quotes, render_english_quote)


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
            expected_languages = {"zh-CN": "zh-CN", "en": "en"}
            if item["author"]["zh-CN"] == "雷锋":
                self.assertIn(item["source_language"]["en"], {"zh-CN", "en"})
                expected_languages["en"] = item["source_language"]["en"]
            if item["author"]["zh-CN"] == "切·格瓦拉":
                self.assertIn(item["source_language"]["zh-CN"], {"zh-CN", "en"})
                expected_languages["zh-CN"] = item["source_language"]["zh-CN"]
            self.assertEqual(item["source_language"], expected_languages)
        self.assertEqual(counts, {"马克思": 110, "恩格斯": 60, "马恩": 80, "列宁": 50, "毛泽东": 100,
                                 "雷锋": 10, "切·格瓦拉": 10, "尼古拉·奥斯特洛夫斯基": 10})

    def test_review_manifest_covers_the_current_text_and_source_of_every_entry(self):
        review = json.loads((ROOT / "home/brief/quotes-review.json").read_text(encoding="utf-8"))
        records = {item["id"]: item for item in review["quotes"]}
        self.assertEqual(len(records), len(self.content["quotes"]))
        self.assertEqual(set(records), {q["id"] for q in self.content["quotes"]})
        expected_exceptions = {(item["id"], language) for item in self.content["quotes"] for language in ("zh-CN", "en")
                               if records[item["id"]]["sources"][language]["method"] == "site-translation"}
        declared = review["translation_exceptions"]
        self.assertEqual(len(declared), len(expected_exceptions))
        self.assertEqual({(item["id"], item["language"]) for item in declared}, expected_exceptions)
        for exception in declared:
            self.assertEqual(exception["source_language"], records[exception["id"]]["sources"][exception["language"]]["language"])
        for item in self.content["quotes"]:
            record = records[item["id"]]
            for language in ("zh-CN", "en"):
                with self.subTest(id=item["id"], language=language):
                    source = record["sources"][language]
                    self.assertEqual(source["url"], item["url"][language])
                    self.assertEqual(source["language"], item["source_language"][language])
                    self.assertEqual(record["texts_sha256"][language], hashlib.sha256(item["text"][language].encode("utf-8")).hexdigest())
                    self.assertRegex(source["source_sha256"], r"^[0-9a-f]{64}$")
                    self.assertTrue(source["locator"].strip())
                    self.assertIn(source["method"], {"verbatim-normalized", "scan-visually-checked", "site-translation"})
                    if source["method"] == "site-translation":
                        self.assertIn((item["author"]["zh-CN"], language), {("雷锋", "en"), ("切·格瓦拉", "zh-CN")})
                        self.assertNotEqual(source["language"], language)
                        self.assertIn("AI", item["translation_note"][language])
                    else:
                        self.assertEqual(source["language"], language)
                    if "edition" in source:
                        self.assertTrue(source["edition"].strip())
                    if "edition_url" in source:
                        self.assertTrue(source["edition_url"].startswith("https://"))

    def test_marx_engels_lenin_and_mao_chinese_quotes_cite_the_chinese_mia_text(self):
        for item in self.content["quotes"]:
            if item["author"]["zh-CN"] in {"马克思", "恩格斯", "马恩", "列宁", "毛泽东"}:
                with self.subTest(id=item["id"]):
                    self.assertTrue(item["url"]["zh-CN"].startswith("https://www.marxists.org/chinese/"))
                    self.assertEqual(item["source_language"], {"zh-CN": "zh-CN", "en": "en"})

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
        # Independently read from the cited 1952 scan, printed pp. 105 and 178.
        by_id = {item["id"]: item for item in items}
        self.assertIn("every moment of life, lest", by_id["ostrovsky-steel-03"]["text"]["en"])
        self.assertNotIn("moment of his life", by_id["ostrovsky-steel-03"]["text"]["en"])
        self.assertIn("not the other way around.", by_id["ostrovsky-steel-04"]["text"]["en"])

    def test_no_script_cards_render_each_entry_and_its_own_language_link(self):
        for index, item in enumerate(self.content["quotes"]):
            for language, heading in (("zh-CN", "马克思主义名句"), ("en", "Marxist quotations")):
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

    def test_a_quote_cannot_use_the_other_languages_source_as_its_own(self):
        for language in ("zh-CN", "en"):
            content = copy.deepcopy(self.content)
            content["quotes"][0]["source_language"] = {"zh-CN": "zh-CN", "en": "en"}
            content["quotes"][0]["source_language"][language] = "en" if language == "zh-CN" else "zh-CN"
            with self.assertRaisesRegex(ValueError, "same language"):
                validate_content(content)

    def test_full_pool_daily_rotation_survives_midnight_and_future_dates(self):
        for day in (-1, 0, 429, 430, 431, 100000):
            expected = self.content["quotes"][day % len(self.content["quotes"])]
            html = render_brief_bottom(self.content, {}, "zh-CN", date(1970, 1, 1) + timedelta(days=day))
            self.assertIn(expected["text"]["zh-CN"], html)

    def test_quote_text_is_escaped_and_retired_card_is_absent(self):
        content = copy.deepcopy(self.content)
        content["quotes"][0]["text"]["en"] = '<script>alert("quotation")</script>'
        html = render_brief_bottom(content, {}, "en", date(1970, 1, 1))
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn('<script>alert', html)
        self.assertNotIn("own-quote", html)


def english_fixture():
    return {"version": 1, "quotes": [{"id": "fixture-quotation", "text": "All that glisters is not gold.",
            "translation": "闪光的未必都是金子。", "translation_source": {"type": "site"},
            "author_zh": "莎士比亚", "author_en": "William Shakespeare", "work_zh": "《威尼斯商人》",
            "work_en": "The Merchant of Venice", "locator_zh": "第二幕第七场", "first_published": 1600,
            "author_died": 1616, "url": "https://example.org/public-original", "note": "这是合成测试资料，非出处核对记录。"}]}


class EnglishQuotationTests(unittest.TestCase):
    def test_original_or_source_changes_require_a_new_review(self):
        data=english_fixture()
        item=data["quotes"][0]
        record={"id":item["id"],"text_sha256_lf":hashlib.sha256(item["text"].encode()).hexdigest(),
                "source_url":item["url"],"locator":"Synthetic fixture position", "checked_on":"2026-10-29",
                "method":"Synthetic fixture; not source evidence", "source_sha256_lf":"0"*64,
                "misattribution_check":"Synthetic direct-text fixture", "public_domain":{"first_published":1600,"author_died":1616,"basis":"Synthetic fixed-year test"}}
        with TemporaryDirectory(prefix="english-review-fixture-",dir=ROOT) as temporary:
            root=Path(temporary)
            folder=root/"home/brief";folder.mkdir(parents=True)
            (folder/"english-quotes-review.json").write_text(json.dumps({"version":1,"quotes":[record]}),encoding="utf-8")
            (folder/"english-quotes-sources.md").write_text("Synthetic fixture source index.",encoding="utf-8")
            path=folder/"english-quotes.json"
            path.write_text(json.dumps(data),encoding="utf-8")
            self.assertEqual(load_english_quotes(root,set(),today=date(2026,10,29)),data)
            for key,value in (("text","A different public-domain sentence."),("url","https://example.org/different-original")):
                changed=copy.deepcopy(data);changed["quotes"][0][key]=value
                path.write_text(json.dumps(changed),encoding="utf-8")
                with self.subTest(key=key),self.assertRaisesRegex(ValueError,"review"):
                    load_english_quotes(root,set(),today=date(2026,10,29))

    def test_fixed_year_public_domain_boundaries_and_types(self):
        data = english_fixture()
        data["quotes"][0].update(first_published=1930, author_died=1975)
        self.assertIs(validate_english_quotes(data, today=date(2026,10,29)), data)
        with self.assertRaises(ValueError):
            validate_english_quotes(data, today=date(2025,10,29))
        for field, value in (("first_published",1931),("author_died",1976),("author_died",True),("first_published",0)):
            invalid = copy.deepcopy(data)
            invalid["quotes"][0][field] = value
            with self.subTest(field=field,value=value), self.assertRaises(ValueError):
                validate_english_quotes(invalid,today=date(2026,10,29))

    def test_strict_fields_and_text_limits(self):
        for change in (lambda d:d.update(unknown=True),lambda d:d.update(version=True),
                       lambda d:d["quotes"][0].update(unknown=True),lambda d:d["quotes"][0].pop("translation_source"),
                       lambda d:d["quotes"][0].update(text="word "*46),lambda d:d["quotes"][0].update(translation="字"*121),
                       lambda d:d["quotes"][0].update(note="字"*161),lambda d:d["quotes"][0].update(note="D:/private/notes")):
            data = english_fixture()
            change(data)
            with self.assertRaises(ValueError):
                validate_english_quotes(data, today=date(2026,10,29))

    def test_unsafe_sources_and_normalized_duplicate_originals(self):
        for url in ("http://example.org", "https://user:password@example.org/", "https://127.0.0.1/a",
                    "https://[::1]/a", "https://example.local/a", "https://example.org/%0Aevil", "https://example.org/?token=secret"):
            data = english_fixture()
            data["quotes"][0]["url"] = url
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_english_quotes(data)
        data = english_fixture()
        data["quotes"].append({**data["quotes"][0],"id":"different-id","text":"ALL that glisters is not gold!"})
        with self.assertRaisesRegex(ValueError,"distinct"):
            validate_english_quotes(data)

    def test_related_card_must_exist_and_published_translator_must_qualify(self):
        data=english_fixture()
        data["quotes"][0]["related"]="/english/fixture-card/"
        validate_english_quotes(data,{"/english/fixture-card/"})
        with self.assertRaises(ValueError):
            validate_english_quotes(data,set())
        source={"type":"published","name":"Synthetic old translation","url":"https://example.org/translation","translator_died":1975}
        data["quotes"][0]["translation_source"]=source
        validate_english_quotes(data,today=date(2026,10,29))
        source["translator_died"]=1976
        with self.assertRaises(ValueError):
            validate_english_quotes(data,today=date(2026,10,29))

    def test_both_languages_share_content_with_hidden_small_buttons_and_language_tags(self):
        data=english_fixture()
        for language in ("zh-CN","en"):
            html=render_english_quote(data,language,date(2026,10,29))
            self.assertIn(data["quotes"][0]["text"],html)
            self.assertIn(data["quotes"][0]["translation"],html)
            self.assertIn('id="english-quote-text" lang="en"',html)
            self.assertIn('id="english-quote-translation" lang="zh-CN"',html)
            self.assertIn('class="quote-change"',html)
            self.assertIn('hidden>',html)
            self.assertIn("本站译文（AI 辅助",html)
            self.assertIn('href="/english/"',html)
        self.assertIn("Learn English (in Chinese)",render_english_quote(data,"en"))

    def test_two_cards_remain_independent_and_html_is_escaped(self):
        classic=json.loads((ROOT/"home/daily-content.json").read_text(encoding="utf-8"))
        english=english_fixture()
        english["quotes"][0]["text"]="A <script>alert('test')</script>."
        html=render_brief_bottom(classic,{"english_quotes":english},today=date(2026,10,29))
        self.assertEqual(html.count('<article class="yl-daily-card'),2)
        self.assertIn("&lt;script&gt;",html)
        self.assertLess(html.index('id="daily-quotation-card"'),html.index('id="english-quotation-card"'))
        self.assertIn('id="daily-quote-button"',html)
        self.assertIn('id="english-quote-button"',html)

    def test_server_rendering_keeps_reviewed_poetry_lines(self):
        data=english_fixture()
        data["quotes"][0].update(text="First line,\nSecond line.",translation="第一行，\n第二行。")
        html=render_english_quote(data,today=date(2026,10,29))
        self.assertIn("First line,<br>Second line.",html)
        self.assertIn("第一行，<br>第二行。",html)

    def test_quotation_whitespace_matches_browser_rules(self):
        for field,value in [('text','A\tliteral sentence.'),('text','First line,\r\nSecond line.'),
                            ('translation','甲\r\n乙'),('translation','甲\t乙'),('translation','甲\r乙\r丙\r丁\r戊')]:
            data=english_fixture();data['quotes'][0][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):
                validate_english_quotes(data)

    def test_production_pool_review_and_author_diversity(self):
        from english_corner import load_english_corner
        from collections import Counter
        corner=load_english_corner(ROOT,today=date(2026,10,29))
        routes={"/english/"+c["slug"]+"/" for c in corner["cards"]}
        data=load_english_quotes(ROOT,routes,today=date(2026,10,29))
        self.assertGreaterEqual(len(data["quotes"]),100)
        counts=Counter(q["author_en"] for q in data["quotes"])
        self.assertGreaterEqual(len(counts),12)
        self.assertLessEqual(max(counts.values()),12)
        for q in data["quotes"]:
            self.assertIn(q["translation_source"]["type"],{"site","published"})


if __name__ == "__main__":
    unittest.main()
