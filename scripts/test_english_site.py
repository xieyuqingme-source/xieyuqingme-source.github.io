"""Focused synthetic English publication tests; no private sources or network."""
from copy import deepcopy
from datetime import date
from hashlib import sha256
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import json
import os
import re
import shutil
import unittest
from urllib.parse import unquote
from xml.etree import ElementTree as ET

import build_blog
import build_site
from build_blog import Blog
from daily_brief import load_daily, load_brief_extras, render_brief_bottom, safe_json
from news_snapshot import load_snapshot, load_sources, render_snapshot, timestamp, visible_items, CHINA
from history_today import load_history, render_history, history_items
from english_site import (build_english_site, check_english_publication, collect_translations,
                          english_archive, english_article_url, source_sha256, translation_report)
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = Path(os.environ.get("EN_TEST_REFERENCE_ROOT", ROOT))

CHINESE = '''# 中文标题 & 特殊字符

这是完整的第一段，图像与链接必须原样保留。

## 原始章节

这里是第二段。[章节](#原始章节)，[作者](../README.md)。

![示意图](../images/diagram.png)

| 项目 | 内容 |
| --- | --- |
| 第一项 | 第一行<br>第二行 |

- 一个项目
- 另一个项目

```python
print("same code")
```
'''
ENGLISH = '''# A very long English title & special characters: why paths, dates and discussions must stay stable

This is the complete first paragraph; images and link targets must be preserved.

## Translated section

Here is the complete second paragraph. [Section](#原始章节), [author](../README.md).

![Diagram](../images/diagram.png)

| Item | Content |
| --- | --- |
| First | First line<br>Second line |

- One item
- Another item

```python
print("same code")
```
'''


class EnglishPublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix="english-site-fixture-", dir=ROOT)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.output = self.root / "_site_unified"
        for name in ("blog", "中文文章", "English Articles", "images", "附属资料", "home/assets/projects"):
            (self.root / name).mkdir(parents=True)
        for name in ("config.json", "publication-dates.json"):
            shutil.copy2(REFERENCE / "blog" / name, self.root / "blog" / name)
        for name in ("style.css", "site.js", "waline-integration.js"):
            shutil.copy2(ROOT / "blog" / name, self.root / "blog" / name)
        (self.root / "blog/comment-avatar.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
        (self.root / "blog/waline-integration.css").write_text("", encoding="utf-8")
        (self.root / "blog/vendor/waline").mkdir(parents=True)
        (self.root / "blog/vendor/waline/waline.js").write_text("", encoding="utf-8")
        (self.root / "blog/vendor/waline/waline.css").write_text("", encoding="utf-8")
        (self.root / "blog/waline.json").write_text(json.dumps({"enabled": True, "backendVerified": True,
            "serverURL": "https://comments.public.test", "hostingProvider": "Test host", "databaseProvider": "Test database"}), encoding="utf-8")
        (self.root / "README.md").write_text("# Public fixture", encoding="utf-8")
        Image.new("RGB", (20, 20), "white").save(self.root / "images/diagram.png")
        self.source = self.root / "中文文章/2026-01-03-中文 & 标题.md"
        self.source.write_text(CHINESE, encoding="utf-8")
        (self.root / "中文文章/2026-01-02-等待翻译.md").write_text("# 等待翻译\n\n另一篇完整原文。\n", encoding="utf-8")
        (self.root / "English Articles/2026-01-01-original.md").write_text("# Original English article\n\nAn original English essay.\n", encoding="utf-8")
        shutil.copytree(ROOT / "home/en", self.root / "home/en")
        if (REFERENCE / "home/locales").is_dir():
            shutil.copytree(REFERENCE / "home/locales", self.root / "home/locales")
        for name in ("projects.json", "about.json", "daily-content.json"):
            shutil.copy2(REFERENCE / "home" / name, self.root / "home" / name)
        shutil.copytree(REFERENCE / "home/brief", self.root / "home/brief")
        memes = self.root / "home/brief/memes.json"
        public = json.loads(memes.read_text(encoding="utf-8"))
        for item in public["items"]:
            if "related_url" in item:
                item["related_url"] = "/articles/index.html"
        memes.write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")
        for source in (REFERENCE / "home/assets/projects").glob("*.webp"):
            shutil.copy2(source, self.root / "home/assets/projects" / source.name)
        for module, values in ((build_blog, {"ROOT": self.root, "INTERACTION_DIR": self.root / "blog"}),
                               (build_site, {"ROOT": self.root, "OUTPUT": self.output})):
            context = patch.multiple(module, **values)
            context.start()
            self.addCleanup(context.stop)
        self.key = self.source.relative_to(self.root).as_posix()
        self.translation = self.root / "blog/translations/en" / self.source.name
        self.translation.parent.mkdir(parents=True)
        self.translation.write_text(ENGLISH, encoding="utf-8")
        self.entry = {"file": self.translation.relative_to(self.root).as_posix(), "source_sha256": source_sha256(self.source),
                      "title": ENGLISH.splitlines()[0][2:], "status": "complete", "method": "AI-assisted translation"}
        self.manifest = self.root / "blog/translations/manifest.json"
        self.write_manifest(self.entry)

    def write_manifest(self, entry):
        self.manifest.write_text(json.dumps({"version": 1, "translations": {self.key: entry}}, ensure_ascii=False), encoding="utf-8")

    def blog(self):
        blog = Blog("https://public.test/articles", output=self.output / "articles")
        blog.collect()
        return blog

    def build_fixture(self):
        blog = Blog("https://public.test/articles", output=self.output / "articles")
        blog.build(clean=False)
        values = {"site_url": "https://public.test", "project_total": "5", "article_total": "3", "chinese_total": "2", "english_total": "1", "photo_album_total": "0", "photo_total": "0", "anthology_total": "0"}
        brief, daily_content = load_daily(self.root, build_site.linked_directory)
        extras = load_brief_extras(self.root, build_site.linked_directory)
        self.snapshot = load_snapshot(self.root)
        self.news_sources = load_sources(self.root)
        self.public_news_sources = {"sources": [{"name": source["name"], "home_url": source["home_url"]} for source in self.news_sources["sources"]]}
        self.news_now = timestamp(self.snapshot["collected_at"])
        self.history = load_history(self.root, build_site.linked_directory)
        self.history_day = date(2026, 10, 28)
        projects = build_site.load_projects()
        # This fixture calls the English publisher directly, so supply the same
        # homepage inputs that the unified builder normally passes to it.
        values.update({
            "today_date_title": "2026年10月28日", "today_date_title_en": "28 October 2026",
            "daily_content_data": safe_json(daily_content),
            "news_snapshot_data": safe_json(self.snapshot), "news_sources_data": safe_json(self.public_news_sources),
            "news_snapshot_feed": render_snapshot(self.snapshot, "zh-CN", self.news_sources, now=self.news_now, include_sources=False, include_stamp=False),
            "news_snapshot_feed_en": render_snapshot(self.snapshot, "en", self.news_sources, now=self.news_now, include_sources=False, include_stamp=False),
            "news_checked_label": escape("最近检查：" + self.snapshot["collected_at"]),
            "news_checked_label_en": escape("Last checked: " + self.snapshot["collected_at"]),
            "news_source_links": " ".join('<a href="' + escape(source["home_url"], quote=True) + '">' + escape(source["name"]) + '</a>' for source in self.news_sources["sources"]),
            "news_source_links_en": " ".join('<a href="' + escape(source["home_url"], quote=True) + '">' + escape(source["name"]) + '</a>' for source in self.news_sources["sources"]),
            "history_data": safe_json(self.history),
            "history_today": render_history(self.history, "zh-CN", self.history_day),
            "history_today_en": render_history(self.history, "en", self.history_day),
            "home_photos": "", "home_photos_en": "",
            "home_article_links": build_site.home_article_links(blog), "home_article_links_en": build_site.home_article_links(blog, "en"),
            "home_avatar": build_site.render_home_avatar(), "home_avatar_en": build_site.render_home_avatar("en"),
            "brief_rules_data": safe_json(extras["rules"]), "brief_holidays_data": safe_json(extras["holidays"]),
            "brief_bottom_cards": render_brief_bottom(daily_content, extras),
            "brief_bottom_cards_en": render_brief_bottom(daily_content, extras, "en"),
            "home_recent_articles": build_site.render_home_recent(blog),
            "home_recent_articles_en": build_site.render_home_recent(blog, "en"),
            "home_project_cards": build_site.render_home_projects(projects),
            "home_project_cards_en": build_site.render_home_projects(projects, "en"),
            "home_photo_src": "/assets/home-ink.webp",
            "home_photo_alt": "合成首页水墨背景", "home_photo_alt_en": "Synthetic homepage ink background",
            "home_photo_caption": "合成公开首页", "home_photo_caption_en": "Synthetic public homepage",
            "home_photo_srcset": "/assets/home-ink.webp 2172w",
            "site_notes": build_site.render_site_notes(blog.waline, blog.config["repository_url"]),
            "site_notes_en": build_site.render_site_notes(blog.waline, blog.config["repository_url"], "en"),
        })
        for name, route in (("index", "index.html"), ("today", "today/index.html"), ("about", "about/index.html"), ("projects", "projects/index.html")):
            page = (ROOT / f"home/{name}.template.html").read_text(encoding="utf-8")
            for key, value in {**values, "about_content": "<p>Fixture biography</p>", "project_cards": "", "recent_articles": ""}.items():
                page = page.replace("{{" + key + "}}", value)
            if name == "today":
                page = build_site.localize_page(page, self.root, "https://public.test", "/today/", "zh-CN",
                    title=build_site.TODAY_TITLES, description=build_site.TODAY_DESCRIPTIONS)
            target = self.output / route
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(page, encoding="utf-8")
        self.english_report = build_english_site(blog, self.output, "https://public.test", projects, build_site.load_about(), values)
        return blog

    def test_bilingual_today_has_readable_news_history_and_one_reading_card_without_scripts(self):
        blog = self.build_fixture()
        _, daily_content = load_daily(self.root, build_site.linked_directory)
        for language, route in (("zh-CN", "today/index.html"), ("en", "en/today/index.html")):
            with self.subTest(language=language):
                text = (self.output / route).read_text(encoding="utf-8")
                self.assertNotIn("{{", text)
                for element_id, expected in (("news-snapshot-data", self.snapshot), ("news-sources-data", self.public_news_sources),
                                             ("daily-history-data", self.history), ("daily-content-data", daily_content)):
                    script = re.search(r'<script id="' + element_id + r'"[^>]*>(.*?)</script>', text, re.S)
                    self.assertIsNotNone(script)
                    self.assertEqual(json.loads(script[1]), expected)
                # Restrict assertions to visible server-rendered news. Matching
                # the inert JSON alone would not prove no-JavaScript readability.
                feed = re.search(r'<div id="daily-feed"[^>]*>(.*?)</div>', text, re.S)
                self.assertIsNotNone(feed)
                elements = build_site.Elements(feed[1]).elements
                links = {attrs.get("href") for tag, attrs in elements if tag == "a"}
                for item in visible_items(self.snapshot, self.news_sources, self.news_now):
                    self.assertIn(escape(item["title"]), feed[1])
                    self.assertIn(escape(item["source"]), feed[1])
                    self.assertIn(item["url"], links)
                    self.assertIn(timestamp(item["published"]).astimezone(CHINA).strftime("%Y-%m-%d %H:%M +08:00"), feed[1])
                    self.assertIn('lang="' + item["lang"] + '"', feed[1])
                self.assertNotIn('class="news-summary"', feed[1])
                self.assertNotIn('id="daily-brief-data"', text)
                source_links = re.search(r'<div id="news-source-links">(.*?)</div>', text, re.S)[1]
                for source in self.news_sources["sources"]:
                    self.assertIn(escape(source["home_url"], quote=True), source_links)
                history = re.search(r'<div id="daily-history-list">(.*?)</div><p', text, re.S)[1]
                self.assertIn('data-history-date="2026-10-28"', history)
                for item in history_items(self.history, "10-28")[:3]:
                    self.assertIn(escape(item["title"][language]), history)
                    self.assertIn(escape(item["url"], quote=True), history)
                self.assertIn('id="daily-quotation-card"', text)
                self.assertNotIn('own-quote', text)
                self.assertIn('id="daily-quote-button"', text)
                self.assertNotIn('id="daily-meme-card"', text)
                self.assertNotIn('id="daily-concept-title"', text)
                self.assertIn('/assets/daily-reading.js', text)
                self.assertNotIn('/assets/home-now.js', text)
        english = (self.output / "en/index.html").read_text(encoding="utf-8")
        self.assertNotIn('class="yl-article-list', english)
        self.assertNotIn('id="daily-feed"', english)
        self.assertNotIn('id="daily-brief-data"', english)
        self.assertIn('data-brief-mode="glance"', english)
        self.assertIn('href="/en/today/"', english)
        random = re.search(r'<script id="home-random-data"[^>]*>(.*?)</script>', english, re.S)
        self.assertIsNotNone(random)
        urls = json.loads(random[1])
        self.assertIn(english_article_url(blog, blog.translations[self.key]), urls)
        pending = next(a for a in blog.articles if a.language == "zh-CN" and a.source != self.source)
        self.assertNotIn(blog.href(pending.destination), urls)
        self.assertIn("2 pieces in English", english)

    def test_full_brief_routes_have_their_own_metadata_and_language_pair(self):
        self.build_fixture()
        self.assertIn("/en/today/", self.english_report["routes"])
        for language, relative, route in (("zh-CN", "today/index.html", "/today/"),
                                           ("en", "en/today/index.html", "/en/today/")):
            with self.subTest(language=language):
                text = (self.output / relative).read_text(encoding="utf-8")
                elements = build_site.Elements(text).elements
                self.assertEqual([attrs.get("lang") for tag, attrs in elements if tag == "html"], [language])
                self.assertEqual([attrs.get("href") for tag, attrs in elements if tag == "link" and attrs.get("rel") == "canonical"], ["https://public.test" + route])
                self.assertEqual([attrs.get("content") for tag, attrs in elements if tag == "meta" and attrs.get("property") == "og:url"], ["https://public.test" + route])
                self.assertEqual([attrs.get("content") for tag, attrs in elements if tag == "meta" and attrs.get("name") == "description"], [build_site.TODAY_DESCRIPTIONS[language]])
                self.assertIn("<title>" + escape(build_site.TODAY_TITLES[language]) + "</title>", text)
                alternates = [(attrs.get("hreflang"), attrs.get("href")) for tag, attrs in elements if tag == "link" and attrs.get("rel") == "alternate" and attrs.get("hreflang")]
                self.assertCountEqual(alternates, [("zh-CN", "https://public.test/today/"), ("en", "https://public.test/en/today/")])
                self.assertEqual(sum(tag == "h1" for tag, _ in elements), 1)
                self.assertIn('data-brief-mode="full"', text)
                self.assertNotIn('id="brief-toggle"', text)

    def test_counts_dates_and_complete_body_are_preserved(self):
        blog = self.blog()
        self.assertEqual(len(blog.articles), 3)
        self.assertEqual(len(blog.translations), 1)
        translation = blog.translations[self.key]
        self.assertIs(translation.source, translation.original.source)
        self.assertEqual(translation.published, "2026-01-03")
        self.assertIn("complete second paragraph", translation.markdown)
        self.assertEqual(translation_report(blog)["pending"], 1)
        with self.assertRaisesRegex(ValueError, "coverage is incomplete"):
            translation_report(blog, require_complete=True)

    def test_lf_and_crlf_checkouts_share_one_fresh_translation_without_source_writes(self):
        lf = CHINESE.encode("utf-8")
        canonical = sha256(lf).hexdigest()
        self.write_manifest({**self.entry, "source_sha256": canonical})
        for raw in (lf, lf.replace(b"\n", b"\r\n"), lf):
            with self.subTest(crlf=b"\r\n" in raw):
                self.source.write_bytes(raw)
                self.assertEqual(source_sha256(self.source), canonical)
                blog = self.blog()
                self.assertEqual(blog.translation_states[self.key], "complete")
                self.assertIn(self.key, blog.translations)
                self.assertEqual(self.source.read_bytes(), raw)

    def test_real_text_changes_still_invalidate_both_line_endings(self):
        lf = CHINESE.encode("utf-8")
        self.write_manifest({**self.entry, "source_sha256": sha256(lf).hexdigest()})
        changed = CHINESE.replace("这是完整的第一段", "这是修改后的第一段").encode("utf-8")
        self.assertNotEqual(changed, lf)
        for raw in (changed, changed.replace(b"\n", b"\r\n")):
            with self.subTest(crlf=b"\r\n" in raw):
                self.source.write_bytes(raw)
                blog = self.blog()
                self.assertEqual(blog.translation_states[self.key], "stale")
                self.assertNotIn(self.key, blog.translations)
                self.assertEqual(self.source.read_bytes(), raw)

    def test_hash_keeps_whitespace_and_final_newline_changes_significant(self):
        lf = CHINESE.encode("utf-8")
        self.write_manifest({**self.entry, "source_sha256": sha256(lf).hexdigest()})
        for raw in (lf + b" ", lf.rstrip(b"\n")):
            with self.subTest(raw=raw[-30:]):
                self.source.write_bytes(raw)
                self.assertNotEqual(source_sha256(self.source), self.entry["source_sha256"])
                self.assertEqual(self.blog().translation_states[self.key], "stale")

    def test_source_change_is_stale_and_never_published_as_english(self):
        self.source.write_text(CHINESE + "\n新增加的段落。\n", encoding="utf-8")
        blog = self.blog()
        self.assertEqual(blog.translations, {})
        self.assertEqual(blog.translation_states[self.key], "stale")
        listing = english_archive(blog)
        self.assertIn("Translation out of date", listing)
        self.assertIn(blog.href(blog.articles[0].destination), listing)
        self.assertNotIn(english_article_url(blog, blog.articles[0]) + '" lang="en"', listing)

    def test_pending_and_missing_manifest_are_honest_directory_states(self):
        self.write_manifest({"status": "pending"})
        blog = self.blog()
        self.assertFalse(blog.translations)
        self.assertEqual(translation_report(blog)["pending"], 2)
        self.assertIn("Read Chinese original", english_archive(blog))
        self.manifest.unlink()
        self.assertEqual(translation_report(self.blog())["pending"], 2)

    def test_unsafe_manifest_target_and_unknown_original_are_rejected(self):
        entry = {**self.entry, "file": "../../private.md"}
        self.write_manifest(entry)
        with self.assertRaisesRegex(ValueError, "match its original basename"):
            self.blog()
        self.manifest.write_text(json.dumps({"version": 1, "translations": {"English Articles/original.md": self.entry}}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "no Chinese original"):
            self.blog()

    def test_changed_code_links_images_tables_or_sections_are_rejected(self):
        variants = [ENGLISH.replace('print("same code")', 'print("changed")'),
                    ENGLISH.replace('../images/diagram.png', '../images/other.png'),
                    ENGLISH.replace('[author](../README.md)', 'author'),
                    ENGLISH.replace('## Translated section\n', ''),
                    ENGLISH.replace('| First | First line<br>Second line |\n', '')]
        for text in variants:
            with self.subTest(text=text[:30]):
                self.translation.write_text(text, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "preserve links, images, code and block structure"):
                    self.blog()

    def test_untranslated_chinese_body_cannot_claim_english(self):
        self.translation.write_text(CHINESE, encoding="utf-8")
        self.write_manifest({**self.entry, "title": CHINESE.splitlines()[0][2:]})
        with self.assertRaisesRegex(ValueError, "title does not match|full English body"):
            self.blog()

    def test_static_pair_original_identity_media_and_anchor_preservation(self):
        blog = self.build_fixture()
        translated = blog.translations[self.key]
        page = self.output / "en/articles" / translated.destination
        text = page.read_text(encoding="utf-8")
        original = blog.href(translated.original.destination)
        self.assertIn('<html lang="en"', text)
        self.assertIn('Original / 中文原文', text)
        self.assertIn('data-article-path="' + original + '"', text)
        self.assertIn('data-stats-path="' + original + '"', text)
        self.assertIn('/articles/images/diagram.png', text)
        self.assertIn('id="原始章节"', text)
        self.assertNotIn('id="translated-section"', text)
        self.assertIn('href="#原始章节"', text)
        self.assertIn('same code', text)
        self.assertIn('Contents position', text)
        self.assertIn('View original image', text)
        self.assertIn('A very long English title &amp; special characters', text)
        original_text = (self.output / 'articles' / translated.original.destination).read_text(encoding="utf-8")
        self.assertIn('hreflang="en"', original_text)
        self.assertIn('href="' + english_article_url(blog, translated) + '"', original_text)
        for page_text, paired_href in ((text, original), (original_text, english_article_url(blog, translated))):
            switches = [attrs for tag, attrs in build_site.Elements(page_text).elements
                        if tag == "a" and "site-language-switch" in attrs.get("class", "").split()]
            self.assertEqual(len(switches), 1)
            self.assertEqual(switches[0]["href"], paired_href)
            self.assertNotIn("data-preserve-language-link", switches[0])
        self.assertEqual(self.source.read_text(encoding="utf-8"), CHINESE)
        pending = next(a for a in blog.articles if a.language == "zh-CN" and a.source != self.source)
        pending_page = (self.output / "articles" / pending.destination).read_text(encoding="utf-8")
        self.assertIn("英文翻译待完成", pending_page)
        self.assertNotIn("Originally written in English", pending_page)
        report = check_english_publication(blog, self.output, "https://public.test")
        self.assertEqual(report["directory_entries"], 3)
        self.assertEqual(report["language_metadata_pages"], 12)
        self.assertEqual(ET.parse(self.output / 'articles/feed.xml').findall('./channel/item').__len__(), 3)
        self.assertNotIn('/en/', (self.output / 'articles/feed.xml').read_text(encoding="utf-8"))

    def test_article_statistics_notice_follows_body_before_comments_in_both_languages(self):
        blog = self.build_fixture()
        translated = blog.translations[self.key]
        original = translated.original
        english_original = next(a for a in blog.articles if a.language == "en")
        pages = ((self.output / "articles" / original.destination, "浏览与评论统计请求"),
                 (self.output / "en/articles" / translated.destination, "View and comment counts"),
                 (self.output / "articles" / english_original.destination, "View and comment counts"))
        for page, label in pages:
            with self.subTest(page=page.name):
                text = page.read_text(encoding="utf-8")
                notice = text.index('<p class="statistics-notice"')
                body = text.index('<div class="article-body" id="article-content">')
                comments = text.index('<section class="article-comments"')
                self.assertEqual(text.count('<p class="statistics-notice"'), 1)
                self.assertGreater(notice, body)
                self.assertLess(notice, comments)
                self.assertEqual(text[notice - len("</div>\n"):notice], "</div>\n")
                self.assertIn(label, text[notice:comments])
                self.assertIn("Test host", text[notice:comments])
                self.assertIn("Test database", text[notice:comments])
                self.assertNotIn('class="statistics-notice"', text[:body])

    def test_existing_english_original_has_english_ui_at_only_its_old_url(self):
        blog = self.build_fixture()
        article = next(a for a in blog.articles if a.language == 'en')
        text = (self.output / 'articles' / article.destination).read_text(encoding='utf-8')
        self.assertIn('<html lang="en"', text)
        self.assertIn('Originally written in English.', text)
        self.assertIn('id="theme-toggle"', text)
        footer = text.split("<footer", 1)[1].split("</footer>", 1)[0]
        self.assertNotIn('I’m putting my energy into English.', footer)
        self.assertIn('I’m working hard on a few questions.', footer)
        self.assertNotIn('data-skin-choice', text)
        self.assertIn('An original English essay.', text)
        elements = build_site.Elements(text).elements
        directories = [attrs for tag, attrs in elements if tag == "a" and "data-preserve-language-link" in attrs]
        self.assertEqual(len(directories), 1)
        self.assertEqual(directories[0]["href"], "/articles/")
        self.assertEqual(directories[0]["lang"], "zh-CN")
        self.assertIn("originally written in English", directories[0]["aria-label"])
        self.assertIn("Chinese article directory", directories[0]["aria-label"])
        self.assertNotIn("data-site-language-switch", directories[0])
        self.assertIn('>中文目录</a>', text)
        self.assertFalse(any(tag == "a" and "site-language-switch" in attrs.get("class", "").split()
                             for tag, attrs in elements))
        self.assertFalse(any("hreflang" in attrs for _, attrs in elements))
        self.assertTrue(any(tag == "link" and attrs.get("rel") == "canonical"
                            and attrs.get("href") == blog.canonical(article.destination) for tag, attrs in elements))
        identity = blog.href(article.destination)
        self.assertIn('data-article-path="' + identity + '"', text)
        self.assertIn('data-stats-path="' + identity + '"', text)
        self.assertFalse((self.output / 'en/articles' / article.source.with_suffix('.html').name).exists())

    def test_stale_generated_translation_is_removed_without_deleting_other_files(self):
        blog = self.build_fixture()
        translated = self.output / 'en/articles' / blog.translations[self.key].destination
        sentinel = self.output / 'en/keep.txt'
        sentinel.write_text('Keep unrelated output.', encoding='utf-8')
        self.source.write_text(CHINESE + '\nNew source paragraph.\n', encoding='utf-8')
        blog = self.build_fixture()
        self.assertFalse(translated.exists())
        self.assertEqual(sentinel.read_text(encoding='utf-8'), 'Keep unrelated output.')
        self.assertEqual(check_english_publication(blog, self.output, 'https://public.test')['stale'], 1)

    def test_english_project_descriptions_retain_scope_and_chinese_tool_hints(self):
        self.build_fixture()
        page = (self.output / 'en/projects/index.html').read_text(encoding='utf-8')
        for phrase in ('No hosted online version', 'There is no hosted online version', 'support Chinese and English', 'not been fully tested', 'Sources &amp; licensing'):
            if phrase == 'No hosted online version':
                continue
            self.assertIn(phrase, page)
        self.assertIn('href="/en/map/"', page)
        self.assertIn('href="/en/game/ranking/"', page)

    def test_reciprocal_metadata_and_shared_comment_identity_fail_when_tampered(self):
        blog = self.build_fixture()
        translated = self.output / 'en/articles' / blog.translations[self.key].destination
        text = translated.read_text(encoding='utf-8')
        translated.write_text(text.replace('data-article-path="/articles/', 'data-article-path="/en/articles/'), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'reuse the exact original path'):
            check_english_publication(blog, self.output, 'https://public.test')
        translated.write_text(text.replace('hreflang="zh-CN"', 'hreflang="fr"'), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'reciprocal|exactly Chinese and English'):
            check_english_publication(blog, self.output, 'https://public.test')


if __name__ == '__main__':
    unittest.main()
