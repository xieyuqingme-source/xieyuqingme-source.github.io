"""Check unified publication boundaries and link validation without touching source files."""
from html import escape
from datetime import date, timedelta
from pathlib import Path
from copy import deepcopy
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from xml.etree import ElementTree as ET
import json
import re
import shutil
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
if (ROOT / ".blog-deps").is_dir():
    sys.path.insert(0, str(ROOT / ".blog-deps"))
import build_site
from build_site import (site_root, default_root, check_site, Elements, load_projects,
                        validate_projects, render_projects, check_publication_metadata, build_site as publish_site,
                        load_about, validate_about, render_about)
from daily_brief import (load_daily, load_brief_extras, validate_brief, validate_content,
                         validate_knowledge, validate_memes, validate_rules, validate_holidays,
                         render_brief, render_brief_bottom, safe_json, sorted_brief_items)


class UnifiedPublicationTests(unittest.TestCase):
    def test_root_url_normalization(self):
        self.assertEqual(site_root("https://xieyuqingme-source.github.io/"),
                         "https://xieyuqingme-source.github.io")
        self.assertEqual(default_root(), "https://xieyuqing.me")

    def test_project_and_unsafe_urls_are_rejected(self):
        for url in ("https://example.com/articles", "http://example.com/",
                    "https://user@example.com/", "https://example.com/?preview=1",
                    "https://example.com/#main", "/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                site_root(url)

    def validate(self, html, target_html=None):
        output = ROOT / "_site_unified"
        page = output / "index.html"
        targets = {page: html}
        if target_html is not None:
            targets[output / "articles/about.html"] = target_html
        with patch.object(Path, "rglob", return_value=list(targets)), \
             patch.object(Path, "read_text", side_effect=lambda **kw: html), \
             patch.object(Path, "is_dir", return_value=False), \
             patch.object(Path, "is_file", side_effect=lambda: True):
            # The parser map has each page's own IDs; no filesystem writes are used.
            with patch("build_site.Elements", side_effect=[Elements(v) for v in targets.values()]):
                return check_site("https://xieyuqingme-source.github.io")

    def test_article_checker_allows_exact_today_routes_and_rejects_nearby_private_paths(self):
        from build_blog import Blog
        with TemporaryDirectory(prefix="today-article-root-", dir=ROOT) as temporary:
            blog = object.__new__(Blog)
            blog.site_url = "https://xieyuqing.me/articles"
            blog.base_path = "/articles/"
            blog.output = Path(temporary).resolve()
            blog.articles, blog.translations = [], {}
            page = blog.output / "index.html"
            page.write_text('<a href="/today/">历史中的今天</a><a href="/en/today/">Today in history</a>', encoding="utf-8")
            with patch("builtins.print"):
                blog.check()
            for route in ("/today/private/", "/en/today/private/", "/today/%2e%2e/private", "/today", "/unknown/"):
                page.write_text('<a href="' + route + '">Unreviewed route</a>', encoding="utf-8")
                with self.subTest(route=route), self.assertRaisesRegex(ValueError, "Link misses site base path"):
                    blog.check()

    def test_duplicate_article_prefix_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicated article prefix"):
            self.validate('<a href="/articles/articles/index.html">Wrong</a>')

    def test_fragment_and_encoded_article_link(self):
        result = self.validate('<a href="/articles/about.html#%E4%BB%8B%E7%BB%8D">About</a>',
                               '<h1 id="介绍">About</h1>')
        self.assertEqual(result["valid_fragments"], 1)

    def test_responsive_sources_are_checked(self):
        result = self.validate('<img src="/articles/images/a.webp" '
                               'srcset="/articles/images/a.webp 960w, /articles/images/b.webp 1920w">')
        self.assertEqual(result["local_links"], 3)

    def test_malformed_or_outside_responsive_sources_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "srcset"):
            self.validate('<img srcset="/articles/images/a.webp bad">')
        with self.assertRaisesRegex(ValueError, "outside-publication"):
            self.validate('<img srcset="../../private.webp 960w">')

    def test_missing_fragment_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing anchor"):
            self.validate('<a href="#absent">Missing</a>')

    def test_outside_publication_link_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "outside-publication"):
            self.validate('<a href="../../private.html">Outside</a>')

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate IDs"):
            self.validate('<h1 id="main">Title</h1><div id="main"></div>')


class PublicProjectTests(unittest.TestCase):
    def setUp(self):
        self.projects = load_projects()

    def test_two_verified_projects_have_source_and_usage_links(self):
        self.assertEqual([p["id"] for p in self.projects[:2]],
                         ["yuliao-wechat-editor", "coze-paper-quick-reference"])
        for item in self.projects[:2]:
            with self.subTest(project=item["id"]):
                self.assertEqual(item["source_url"],
                                 "https://github.com/xieyuqingme-source/" + item["id"])
                self.assertEqual(item["guide_url"], item["source_url"] + "/blob/main/README.md")
                self.assertTrue(item["problem"] and item["features"] and item["contribution"] and item["usage"])
        self.assertIn("Raphael", self.projects[0]["contribution"])
        self.assertIn("markdown-it", self.projects[0]["contribution"])
        self.assertTrue(self.projects[1]["download_url"].endswith(
            "/blob/main/Workflow-thesis_1-draft-9128.zip"))

    def test_markup_is_displayed_as_text_without_html_or_attribute_injection(self):
        project = deepcopy(self.projects[0])
        project["title"] = '<img src=x onerror="alert(1)"> & Example'
        project["summary"] = '</p><script>alert(1)</script><p>'
        html = render_projects([project])
        elements = Elements(html).elements
        self.assertFalse(any(tag in {"script", "iframe"} for tag, _ in elements))
        self.assertEqual(sum(tag == "img" for tag, _ in elements), 1)
        self.assertFalse(any(key.lower().startswith("on") for _, attrs in elements for key in attrs))
        self.assertIn("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Example", html)
        self.assertIn("&lt;/p&gt;&lt;script&gt;", html)

    def test_privacy_schema_rejects_unknown_fields_and_absolute_machine_paths(self):
        for field, value in (("private_body", "Private article"), ("summary", r"D:\Obsidian Vault\draft.md"),
                             ("summary", "C:/Users/Author/picture.png"), ("summary", r"\\private-server\share\x"),
                             ("summary", "/home/author/drafts"), ("summary", "/Users/author/file")):
            item = deepcopy(self.projects[0]); item[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_projects({"projects": [item]})

    def test_unsafe_project_links_are_rejected_before_publication(self):
        for value in ("javascript:alert(1)", "data:text/html,a", "http://github.com/project",
                      "https://user:secret@github.com/project", "https://github.com/project?token=private",
                      "https://localhost/project", "https://127.0.0.1/project", "https://192.168.0.1/project",
                      "https://[::1]/project", "https://host.local/project", "https://github.com:bad/project",
                      'https://github.com/project" onclick="x', "https://github.com\\project"):
            item = deepcopy(self.projects[0]); item["source_url"] = value
            with self.subTest(url=value), self.assertRaises(ValueError):
                validate_projects({"projects": [item]})

    def test_incomplete_or_duplicate_ids_and_unknown_visuals_are_rejected(self):
        samples = [[], {}, [self.projects[0], self.projects[0]]]
        bad = deepcopy(self.projects[0]); bad["id"] = 'bad" id'
        samples.append([bad])
        bad = deepcopy(self.projects[0]); bad["screenshot"] = "https://example.com/private-screenshot.png"
        samples.append([bad])
        bad = deepcopy(self.projects[0]); del bad["usage"]
        samples.append([bad])
        for items in samples:
            with self.subTest(items=items), self.assertRaises(ValueError):
                validate_projects({"projects": items})

    def test_real_screenshots_and_confirmed_browser_routes_are_accessible(self):
        html = render_projects(self.projects)
        elements = Elements(html).elements
        ids = {attrs["id"] for _, attrs in elements if "id" in attrs}
        cards = [attrs for tag, attrs in elements if tag == "article"]
        self.assertEqual(len(cards), 5)
        self.assertTrue(all(card["aria-labelledby"] in ids for card in cards))
        images = [attrs for tag, attrs in elements if tag == "img"]
        self.assertEqual(len(images), len(self.projects))
        self.assertEqual({image["src"] for image in images}, {item["screenshot"] for item in self.projects})
        self.assertTrue(all(image.get("alt") and int(image["width"]) >= 200 and int(image["height"]) >= 200
                            and image.get("loading") == "lazy" for image in images))
        self.assertEqual(html.count("从这里开始"), len(self.projects))
        self.assertEqual(html.count("来源与许可"), len(self.projects))
        self.assertEqual(html.count("查看 GitHub"), len(self.projects))
        self.assertEqual(html.count("打开体验"), 2)
        links = {attrs["href"] for tag, attrs in elements if tag == "a"}
        self.assertEqual(links, {item[key] for item in self.projects for key in
                                ("source_url", "guide_url", "download_url", "demo_url") if key in item})
        for bad in ("https://example.com/demo", "/unverified/", "//example.com", "/game/ranking/?token=x"):
            item = deepcopy(self.projects[0]); item["demo_url"] = bad
            with self.subTest(demo=bad), self.assertRaisesRegex(ValueError, "confirmed site route"):
                validate_projects({"projects": [item]})

    def test_project_screenshots_preflight_rejects_missing_or_linked_files(self):
        missing = ROOT / "home/assets/projects" / Path(self.projects[0]["screenshot"]).name
        with patch.object(Path, "is_file", autospec=True, side_effect=lambda path: path != missing), \
             self.assertRaisesRegex(ValueError, "Missing or linked"):
            build_site.project_asset_sources(self.projects)
        with patch.object(Path, "is_symlink", return_value=True), self.assertRaisesRegex(ValueError, "links"):
            build_site.project_asset_sources(self.projects)

    def test_project_data_never_follows_a_symlink(self):
        with patch.object(Path, "is_symlink", return_value=True), self.assertRaisesRegex(ValueError, "symlinks"):
            load_projects()

    def test_wallpaper_beta_has_an_honest_pending_card_without_guessed_links(self):
        item = self.projects[2]
        self.assertEqual(item["id"], "yuliao-wallpaper")
        self.assertIn("v0.2.0", item["kind"])
        self.assertIn("测试版", item["kind"])
        self.assertIn("单个活动显示器", item["summary"])
        self.assertIn("人工验收", item["usage"])
        self.assertIn("30", item["features"])
        self.assertIn("5 分钟", item["features"])
        pending = deepcopy(item)
        for field in ("source_url", "guide_url", "guide_label", "download_url", "download_label"):
            pending.pop(field, None)
        pending["link_status"] = "pending"
        html = render_projects([pending])
        self.assertIn("发布链接待确认", html)
        self.assertFalse(any(tag == "a" for tag, _ in Elements(html).elements))

    def test_pending_links_unknown_states_and_unpaired_download_labels_are_rejected(self):
        pending = deepcopy(self.projects[0])
        for field in ("source_url", "guide_url"):
            pending.pop(field)
        pending["link_status"] = "pending"
        for field in ("source_url", "guide_url", "guide_label", "download_url", "download_label"):
            bad = deepcopy(pending); bad[field] = "https://example.com/confirmed-fixture"
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_projects({"projects": [bad]})
        for status in (None, [], "unconfirmed"):
            bad = deepcopy(pending); bad["link_status"] = status
            with self.subTest(status=status), self.assertRaises(ValueError):
                validate_projects({"projects": [bad]})
        bad = deepcopy(self.projects[0]); bad["download_label"] = "下载测试版"
        with self.assertRaises(ValueError):
            validate_projects({"projects": [bad]})

    def test_confirmed_download_label_is_escaped_without_changing_legacy_links(self):
        published = deepcopy(self.projects[0])
        published["download_url"] = "https://example.com/public-test-fixture.zip"
        published["download_label"] = '<script>download</script>'
        published["guide_label"] = '<img src=x onerror="guide">'
        html = render_projects([published])
        self.assertIn('&lt;script&gt;download&lt;/script&gt;', html)
        self.assertFalse(any(tag == "script" for tag, _ in Elements(html).elements))
        self.assertEqual(sum(tag == "img" for tag, _ in Elements(html).elements), 1)
        self.assertIn('href="' + self.projects[0]["source_url"] + '"', html)

    def test_page_viewport_and_responsive_card_structure_do_not_hide_overflow(self):
        for name in ("index.template.html", "projects.template.html", "about.template.html"):
            elements = Elements((ROOT / "home" / name).read_text(encoding="utf-8")).elements
            self.assertTrue(any(tag == "meta" and attrs.get("name") == "viewport"
                                and attrs.get("content") == "width=device-width, initial-scale=1"
                                for tag, attrs in elements))
            self.assertEqual(sum(tag == "h1" for tag, _ in elements), 1)
        css = (ROOT / "home/assets/portal.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.project-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)")
        mobile = css.split("@media (max-width: 650px)", 1)[1]
        self.assertRegex(mobile, r"\.project-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)")
        self.assertIsNone(re.search(r"overflow(?:-x|-y)?\s*:\s*hidden", css),
                          "Long bilingual titles must wrap rather than disappear.")


class DailyHomepageTests(unittest.TestCase):
    def setUp(self):
        self.latest, self.content = load_daily(ROOT, build_site.linked_directory)
        self.brief = validate_brief(json.loads((ROOT / "home/brief/news/2026-10-27.json").read_text(encoding="utf-8")))
        self.extras = load_brief_extras(ROOT, build_site.linked_directory)

    def test_latest_manual_news_dates_and_sources_remain_explicit_in_both_languages(self):
        self.assertEqual(self.latest["version"], 2)
        self.assertIn(self.latest["status"], {"manual", "auto"})
        path = max((ROOT / "home/brief/news").glob("*.json"))
        self.assertEqual(path.stem, self.latest["edition_date"])
        self.assertTrue(1 <= len(self.latest["items"]) <= 12)
        for language in ("zh-CN", "en"):
            html = render_brief(self.latest, language)
            self.assertNotIn("选读样刊", html)
            for item in self.latest["items"]:
                self.assertIn(item["url"], html)
                self.assertIn(escape(item["title"][language]), html)
                self.assertIn(escape(item["summary"][language]), html)
                self.assertIn(escape(item["source"][language]), html)
                self.assertIn('datetime="' + item["published"] + '"', html)
            elements = Elements(html).elements
            self.assertEqual(sum(tag == "article" for tag, _ in elements), len(self.latest["items"]))
            self.assertEqual(sum("news-major" in attrs.get("class", "").split() for _, attrs in elements),
                             sum(item["priority"] == "major" for item in self.latest["items"]))

    def test_news_and_frost_knowledge_preserve_the_reviewed_text(self):
        # Exact user-supplied source data; this fixture never reads outside the repository.
        expected_news = json.loads(r'''
[
  {
    "id": "lula-reelected-brazil",
    "category": "world",
    "priority": "major",
    "major_reason": {
      "zh-CN": "巴西总统选举结果",
      "en": "Result of Brazil's presidential election"
    },
    "title": {
      "zh-CN": "卢拉连任巴西总统",
      "en": "Lula re-elected as Brazil's president"
    },
    "summary": {
      "zh-CN": "计票 99.80% 时卢拉得票 51.76%，击败弗拉维奥·博索纳罗，第四次当选；新任期 2027 年 1 月 5 日开始。",
      "en": "With 99.80% of votes counted, Lula won 51.76% to beat Flávio Bolsonaro, winning the presidency for a fourth time. His new term begins on 5 January 2027."
    },
    "source": {
      "zh-CN": "新华社",
      "en": "Xinhua"
    },
    "published": "2026-10-26T08:27+08:00",
    "url": "https://www.news.cn/20261026/cbf15c746ad041718364bc5fe09c93ee/c.html"
  },
  {
    "id": "vucic-concedes-serbia",
    "category": "world",
    "priority": "major",
    "major_reason": {
      "zh-CN": "塞尔维亚议会选举结果",
      "en": "Result of Serbia's parliamentary election"
    },
    "title": {
      "zh-CN": "武契奇承认前进党在塞议会选举中败选",
      "en": "Vučić concedes his Progressive Party lost Serbia's parliamentary election"
    },
    "summary": {
      "zh-CN": "塞尔维亚前总统武契奇 10 月 25 日承认，他领导的前进党选举联盟在当天的议会选举中失利。",
      "en": "Former Serbian president Aleksandar Vučić conceded on 25 October that the alliance led by his Serbian Progressive Party lost that day's parliamentary election."
    },
    "source": {
      "zh-CN": "新华社",
      "en": "Xinhua"
    },
    "published": "2026-10-26T04:58+08:00",
    "url": "https://www.news.cn/world/20261026/2bff6d54966c492781a4374140495297/c.html"
  },
  {
    "id": "steinmeier-china-visit",
    "category": "domestic",
    "priority": "normal",
    "title": {
      "zh-CN": "德国总统施泰因迈尔抵达安徽开始访华",
      "en": "German President Steinmeier arrives in Anhui to begin his visit to China"
    },
    "summary": {
      "zh-CN": "施泰因迈尔 10 月 27 日抵达合肥，开始为期 5 天的国事访问，这是他近 8 年来首次访华。",
      "en": "Steinmeier arrived in Hefei on 27 October to begin a five-day state visit, his first visit to China in nearly eight years."
    },
    "source": {
      "zh-CN": "新华社（中新网转载）",
      "en": "Xinhua (via China News Service)"
    },
    "published": "2026-10-27T00:34+08:00",
    "url": "https://www.chinanews.com.cn/gn/2026/10-27/10721432.shtml"
  },
  {
    "id": "fukuda-yasuo-dies",
    "category": "world",
    "priority": "normal",
    "title": {
      "zh-CN": "日本前首相福田康夫去世",
      "en": "Former Japanese prime minister Yasuo Fukuda dies"
    },
    "summary": {
      "zh-CN": "据日本媒体报道，福田康夫 10 月 22 日因心力衰竭在东京一家医院去世，享年 90 岁；他 2007 年至 2008 年任首相。",
      "en": "Japanese media reported that Fukuda died of heart failure at a Tokyo hospital on 22 October, aged 90. He was prime minister from 2007 to 2008."
    },
    "source": {
      "zh-CN": "新华社",
      "en": "Xinhua"
    },
    "published": "2026-10-26T13:43+08:00",
    "url": "https://www.news.cn/world/20261026/2001ce488c7f4b109349577582afe75a/c.html"
  },
  {
    "id": "central-banks-super-week",
    "category": "economy",
    "priority": "normal",
    "title": {
      "zh-CN": "全球央行“超级周”再度来袭：美欧日预计或均将按兵不动",
      "en": "Central banks' 'super week' returns: Fed, ECB and Bank of Japan expected to hold rates"
    },
    "summary": {
      "zh-CN": "本周全球五大央行公布利率决议，市场预计美联储、欧央行和日本央行维持利率不变，加拿大央行和新西兰联储可能加息。",
      "en": "Five major central banks announce rate decisions this week. Markets expect the Fed, the ECB and the Bank of Japan to hold, while the Bank of Canada and the Reserve Bank of New Zealand may raise rates."
    },
    "source": {
      "zh-CN": "第一财经",
      "en": "Yicai"
    },
    "published": "2026-10-26T17:45+08:00",
    "url": "https://www.yicai.com/news/103409613.html"
  },
  {
    "id": "armoured-amphibian-ancient-seas",
    "category": "science",
    "priority": "normal",
    "title": {
      "zh-CN": "演化的“改变者”：远古海洋里生活过一种披甲的奇特两栖动物",
      "en": "Evolutionary ‘game-changer’: weird armoured amphibian lived in ancient seas"
    },
    "summary": {
      "zh-CN": "Nature 新闻：一种身披甲片的奇特两栖动物曾生活在远古海洋中，被称为演化上的“改变游戏规则者”。",
      "en": "Nature reports on a strange armoured amphibian that lived in ancient seas, described as an evolutionary ‘game-changer’."
    },
    "source": {
      "zh-CN": "Nature",
      "en": "Nature"
    },
    "published": "2026-10-26",
    "url": "https://www.nature.com/articles/d41586-026-03440-1"
  }
]
''')
        expected_knowledge = json.loads(r'''
{
  "id": "frosts-descent",
  "title": {
    "zh-CN": "霜降：秋天的最后一个节气",
    "en": "Frost's Descent: the last solar term of autumn"
  },
  "text": {
    "zh-CN": "霜降是二十四节气中的第 18 个，也是秋季的最后一个节气。霜是贴近地面的白色冰晶；在黄河中下游，初霜一般出现在 10 月下旬到 11 月上旬。闽南和台湾有霜降吃鸭子的习俗。",
    "en": "Frost's Descent is the 18th of the 24 solar terms and the last one of autumn. Frost is a layer of white ice crystals near the ground; along the middle and lower Yellow River, the first frost usually comes in late October or early November. In southern Fujian and Taiwan, people traditionally eat duck on this day."
  },
  "source": "中国日报双语新闻 China Daily",
  "url": "https://language.chinadaily.com.cn/a/202310/24/WS6537658da31090682a5ea6d5.html",
  "trigger": {
    "solar_term": "霜降"
  }
}
''')
        self.assertEqual(self.brief["items"], expected_news)
        actual = next(item for item in self.extras["knowledge"]["items"] if item["id"] == "frosts-descent")
        self.assertEqual(actual, expected_knowledge)

    def test_news_bounds_categories_and_major_reasons_are_enforced(self):
        for count in (1, 12):
            data = deepcopy(self.brief)
            data["items"] = []
            for index in range(count):
                item = deepcopy(self.brief["items"][0])
                item["id"] = "synthetic-news-" + str(index)
                data["items"].append(item)
            self.assertIs(validate_brief(data), data)
        for mutate in (lambda data: data.update(items=[]),
                       lambda data: data.update(items=[{**deepcopy(data["items"][0]), "id": "synthetic-boundary-" + str(index)} for index in range(13)]),
                       lambda data: data["items"][0].update(category="business"),
                       lambda data: data["items"][0].pop("major_reason"),
                       lambda data: data["items"][0].update(major_reason={"zh-CN": "缺少英文"}),
                       lambda data: data["items"][0].update(priority="urgent"),
                       lambda data: data.update(status="sample"),
                       lambda data: data.update(updated_at="2026-10-28T09:50+08:00"),
                       lambda data: data.update(updated_at="2026-10-27T01:50Z")):
            data = deepcopy(self.brief)
            mutate(data)
            with self.subTest(data=data), self.assertRaises(ValueError):
                validate_brief(data)
        automatic = deepcopy(self.brief)
        automatic["status"] = "auto"
        self.assertIs(validate_brief(automatic), automatic)
        data = deepcopy(self.brief)
        data["items"][0]["summary"]["zh-CN"] = "字" * 61
        with self.assertRaises(ValueError):
            validate_brief(data)

    def test_knowledge_triggers_limits_and_meme_optional_fields_remain_public(self):
        self.assertEqual(set(self.content), {"version", "quotes"})
        frost = next(item for item in self.extras["knowledge"]["items"] if item["id"] == "frosts-descent")
        self.assertEqual(frost["trigger"], {"solar_term": "霜降"})
        for trigger in ({"solar_term": "不存在"}, {"date": "02-30"}, {"date": "2-03"},
                        {"solar_term": "霜降", "date": "10-27"}):
            data = deepcopy(self.extras["knowledge"])
            data["items"][0]["trigger"] = trigger
            with self.subTest(trigger=trigger), self.assertRaises(ValueError):
                validate_knowledge(data)
        data = deepcopy(self.extras["knowledge"])
        data["items"][0]["text"]["zh-CN"] = "字" * 121
        with self.assertRaises(ValueError):
            validate_knowledge(data)
        for field, value in (("source", "D:/private/draft.md"), ("source", "bad\x00text"),
                             ("url", "https://localhost/private")):
            data = deepcopy(self.extras["knowledge"])
            data["items"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_knowledge(data)
        migrated = next(item for item in self.extras["memes"]["items"] if item["id"] == "everyday-theories")
        self.assertEqual(migrated["added"], "2026-10-26")
        empty = {"version": 1, "items": []}
        self.assertIs(validate_memes(empty), empty)
        extras = {**self.extras, "memes": empty}
        html = render_brief_bottom(self.content, extras)
        self.assertEqual(sum(tag == "article" for tag, _ in Elements(html).elements), 2)
        self.assertNotIn('id="daily-meme-card"', html)
        for optional in ("origin", "example", "why_popular"):
            data = deepcopy(self.extras["memes"])
            next(item for item in data["items"] if item["id"] == "everyday-theories")[optional] = {"zh-CN": "", "en": ""}
            self.assertIs(validate_memes(data), data)

    def test_weather_rules_and_sourced_holidays_have_strict_schemas(self):
        self.assertEqual([item["threshold"] for item in self.extras["rules"]["weather"]], [60, 33, 0])
        for field, value in (("threshold", float("nan")), ("threshold", True), ("field", "unsupported"),
                             ("operator", "eval"), ("text", {"zh-CN": "只有中文"})):
            data = deepcopy(self.extras["rules"])
            data["weather"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_rules(data)
        holiday = self.extras["holidays"]["years"]["2026"]
        self.assertIs(validate_holidays(holiday, 2026), holiday)
        for field, value in (("date", "2027-01-01"), ("isOffDay", "yes"), ("name", "C:/Users/private")):
            data = deepcopy(holiday)
            data["days"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_holidays(data, 2026)
        data = deepcopy(holiday)
        data["days"].append(deepcopy(data["days"][0]))
        with self.assertRaises(ValueError):
            validate_holidays(data, 2026)

    def test_dated_loader_checks_historical_files_and_filename_dates(self):
        with TemporaryDirectory(prefix="brief-dated-fixture-", dir=ROOT) as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / "home/brief/news", root / "home/brief/news")
            shutil.copy2(ROOT / "home/daily-content.json", root / "home/daily-content.json")
            latest = deepcopy(self.latest)
            next_day = (date.fromisoformat(latest["edition_date"]) + timedelta(days=1)).isoformat()
            latest.update(edition_date=next_day, updated_at=next_day + "T09:50+08:00")
            path = root / "home/brief/news" / (next_day + ".json")
            path.write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")
            selected, _ = load_daily(root, build_site.linked_directory)
            self.assertEqual(selected["edition_date"], next_day)
            latest["edition_date"] = (date.fromisoformat(next_day) + timedelta(days=1)).isoformat()
            path.write_text(json.dumps(latest), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_daily(root, build_site.linked_directory)
            path.unlink()
            archive = root / "home/brief/news/2026-10-26.json"
            old = json.loads(archive.read_text(encoding="utf-8"))
            old["items"][0]["url"] = "https://localhost/private"
            archive.write_text(json.dumps(old), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_daily(root, build_site.linked_directory)

    def test_normal_daily_update_accepts_a_new_edition_meme_and_knowledge(self):
        with TemporaryDirectory(prefix="brief-update-regression-", dir=ROOT) as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / "home/brief", root / "home/brief")
            shutil.copy2(ROOT / "home/daily-content.json", root / "home/daily-content.json")
            latest = deepcopy(self.latest)
            next_day = (date.fromisoformat(latest["edition_date"]) + timedelta(days=1)).isoformat()
            latest.update(edition_date=next_day, updated_at=next_day + "T09:50+08:00")
            (root / "home/brief/news" / (next_day + ".json")).write_text(safe_json(latest), encoding="utf-8")
            for filename, prototype in (("memes.json", next(item for item in self.extras["memes"]["items"] if item["id"] == "everyday-theories")),
                                        ("knowledge.json", self.extras["knowledge"]["items"][0])):
                path = root / "home/brief" / filename
                data = json.loads(path.read_text(encoding="utf-8"))
                item = deepcopy(prototype)
                item["id"] = "synthetic-update-" + next_day
                if filename == "memes.json":
                    existing_dates = [date.fromisoformat(self.latest["edition_date"]),
                                      *[date.fromisoformat(entry["added"]) for entry in data["items"]]]
                    item["added"] = (max(existing_dates) + timedelta(days=1)).isoformat()
                    item["term"] = {"zh-CN": "合成更新测试", "en": "Synthetic update regression"}
                else:
                    item.pop("trigger", None)
                data["items"].append(item)
                path.write_text(safe_json(data), encoding="utf-8")
            selected, content = load_daily(root, build_site.linked_directory)
            extras = load_brief_extras(root, build_site.linked_directory)
            self.assertEqual(selected["edition_date"], next_day)
            for language in ("zh-CN", "en"):
                news = render_brief(selected, language)
                self.assertEqual(sum(tag == "article" for tag, _ in Elements(news).elements), len(latest["items"]))
                for item in selected["items"]:
                    self.assertIn(escape(item["title"][language]), news)
                cards = render_brief_bottom(content, extras, language)
                self.assertIn("合成更新测试" if language == "zh-CN" else "Synthetic update regression", cards)

    def test_sources_dates_and_schema_are_validated_before_publication(self):
        for url in ("http://example.com/news", "https://localhost/news", "https://127.0.0.1/news",
                    "https://example.com/news?token=private", "https://user:pass@example.com/news"):
            data = deepcopy(self.brief)
            data["items"][0]["url"] = url
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_brief(data)
        for field, value in (("published", "2026-02-30"), ("published", "2027-01-01"), ("private_notes", "not for publication")):
            data = deepcopy(self.brief)
            data["items"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_brief(data)
        data = deepcopy(self.extras["memes"])
        next(item for item in data["items"] if item["id"] == "everyday-theories")["related_url"] = "/articles/%2e%2e/private.html"
        with self.assertRaises(ValueError):
            validate_memes(data)

    def test_inline_json_cannot_close_its_script_and_all_daily_words_have_sources(self):
        text = safe_json({"example": "</script><script>alert(1)</script>&\u2028"})
        self.assertNotIn("<", text)
        self.assertNotIn("&", text)
        self.assertEqual(json.loads(text)["example"], "</script><script>alert(1)</script>&\u2028")
        validate_content(self.content)
        for item in self.content["quotes"]:
            self.assertTrue(item["url"].startswith("https://ctext.org/"))
            self.assertIn("site's translation", item["translation_note"]["en"])

    def test_homepage_picks_and_quotes_resolve_to_published_articles(self):
        from build_blog import Blog
        blog = Blog("https://xieyuqing.me/articles")
        blog.source_root = ROOT
        blog.collect()
        data = json.loads((ROOT / "home/home-picks.json").read_text(encoding="utf-8"))
        featured, quotes = build_site.load_home_picks(blog)
        self.assertEqual(len(featured), len(data["featured"]), "Every featured essay must name a published article.")
        self.assertEqual(len(quotes), len(data["quotes"]), "Every quote must name a published article.")
        for article, text, english in quotes:
            self.assertIn(text, build_site.plain_markdown(article.source.read_text(encoding="utf-8-sig")))
            self.assertTrue(english.strip())
        items = build_site.home_quote_items(blog, quotes)
        for language in ("zh-CN", "en"):
            quote_card = build_site.render_quote_section(items, language)
            self.assertIn('id="daily-own-quote-card"', quote_card)
            self.assertIn('id="own-quote-text"', quote_card)
            self.assertIn('id="own-quote-source"', quote_card)
            self.assertEqual(sum(tag == "h2" for tag, _ in Elements(quote_card).elements), 1)
            cards = render_brief_bottom(self.content, self.extras, language, own_quote=quote_card)
            self.assertIn(quote_card, cards)
            self.assertNotIn('class="home-quote"', cards)

    def test_recent_writing_uses_original_dates_and_direct_available_language_links(self):
        from build_blog import Article
        from dataclasses import replace
        older = Article(ROOT / "中文文章/2025-01-01-older.md", "older.html", "Older", "2025-01-01", "zh-CN", "中文文章", "chinese.html", "Older excerpt")
        newer = Article(ROOT / "English Articles/2026-01-01-newer.md", "newer.html", "Newer", "2026-01-01", "en", "English Articles", "english.html", "Newer excerpt")
        translation = replace(older, title="Older translated", language="en", destination="older-en.html", published="2027-01-01", original=older)
        blog = SimpleNamespace(articles=[older, newer], source_root=ROOT,
                               translations={older.source.relative_to(ROOT).as_posix(): translation},
                               href=lambda destination: "/articles/" + destination,
                               topic=lambda article: "生活与思考", excerpt=lambda article: article.markdown)
        html = build_site.render_home_recent(blog)
        # The Chinese homepage lists Chinese writing; English pieces lead the English homepage.
        self.assertNotIn("Newer", html)
        self.assertIn('href="/articles/older.html"', html)
        self.assertEqual(json.loads(build_site.home_article_links(blog)), ["/articles/older.html"])
        english_links = json.loads(build_site.home_article_links(blog, "en"))
        self.assertEqual(len(english_links), 2)
        self.assertEqual(english_links[0], "/articles/newer.html")
        self.assertTrue(english_links[1].startswith("/en/articles/"))
        english = build_site.render_home_recent(blog, "en")
        self.assertLess(english.index("Newer"), english.index("Older translated"))
        self.assertIn('datetime="2025-01-01"', english)
        self.assertNotIn("2027-01-01", english)
        self.assertIn('href="/en/articles/', english)

    def test_homepage_projects_are_two_usable_tools_without_reordering_the_catalogue(self):
        projects = load_projects()
        before = deepcopy(projects)
        html = build_site.render_home_projects(projects)
        self.assertLess(html.index("足迹地图"), html.index("从夯到拉排行"))
        self.assertIn('href="/map/"', html)
        self.assertIn('href="/game/ranking/"', html)
        self.assertEqual(sum(tag == "article" for tag, _ in Elements(html).elements), 2)
        english = build_site.render_home_projects(projects, "en")
        self.assertIn('href="/en/map/"', english)
        self.assertIn('href="/en/game/ranking/"', english)
        self.assertEqual(projects, before)


class ProjectPublicationTests(unittest.TestCase):
    """Exercise actual unified output and navigation without copying private article fixtures."""
    def fake_blog(self, address, output):
        from build_blog import Blog, Article
        folder = Path(output)
        blog = Blog(address, output=folder)
        blog.source_root = build_site.ROOT
        articles = [Article(blog.source_root / "English Articles/2026-01-01-synthetic.md", "synthetic.html", "Synthetic article",
                            "2026-01-01", "en", "English Articles", "english.html", "Synthetic public fixture.")]
        blog.articles = articles
        blog.waline = {"enabled": False}

        def build(clean=False):
            self.assertFalse(clean, "The existing article build must keep its original clean=False policy.")
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "assets").mkdir(exist_ok=True)
            for asset in ("style.css", "site.js"):
                shutil.copy2(ROOT / "blog" / asset, folder / "assets" / asset)
            for name in ("index.html", "synthetic.html"):
                url = address + "/" + name
                language = "zh-CN" if name == "index.html" else "en"
                alternates = ('<link rel="alternate" hreflang="zh-CN" href="' + address + '/">'
                              '<link rel="alternate" hreflang="en" href="' + address.removesuffix('/articles') + '/en/articles/">') if name == "index.html" else ''
                fixture_page = ('<html lang="' + language + '"><head>' + alternates + '<link rel="canonical" href="' + url
                    + '"><meta property="og:url" content="' + url
                    + '"></head><body id="main">Synthetic public fixture</body></html>')
                from site_i18n import localize_page
                (folder / name).write_text(localize_page(fixture_page, blog.source_root, address.removesuffix('/articles'), '/articles/' + name, language), encoding='utf-8')
            url = address.removesuffix("/articles") + "/about/"
            (folder / "about.html").write_text('<html><head><link rel="canonical" href="' + url
                + '"><meta property="og:url" content="' + url
                + '"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0; url=/about/">'
                + '</head><body><a href="/about/">About</a></body></html>', encoding="utf-8")
            (folder / "feed.xml").write_text('<rss><channel><link>' + address + '/</link><item><link>'
                + address + '/synthetic.html</link><guid>' + address + '/synthetic.html</guid></item></channel></rss>', encoding="utf-8")
            (folder / "sitemap.xml").write_text(
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'
                + address + '/index.html</loc></url><url><loc>'
                + address + '/synthetic.html</loc></url></urlset>', encoding="utf-8")
        blog.build = build
        return blog

    def test_projects_build_has_canonical_sitemap_and_preserves_article_outputs(self):
        with TemporaryDirectory(prefix="yuliao-site-projects-", dir=ROOT) as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / "home", root / "home")
            # Static meme cards now expose their related link without JavaScript.
            memes = root / "home/brief/memes.json"
            public = json.loads(memes.read_text(encoding="utf-8"))
            for item in public["items"]:
                if "related_url" in item:
                    item["related_url"] = "/articles/synthetic.html"
            memes.write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")
            shutil.copytree(ROOT / "map", root / "map")
            shutil.copytree(ROOT / "anthology", root / "anthology")
            output = root / "_site_unified"
            with patch.object(build_site, "ROOT", root), patch.object(build_site, "OUTPUT", output), \
                 patch.object(build_site, "Blog", side_effect=self.fake_blog):
                report = publish_site("https://xieyuqing.me")
                self.assertEqual((report["articles"], report["projects"]), (1, 5))
                self.assertEqual(report["article_root"], "https://xieyuqing.me/articles/")
                self.assertTrue(report["success"])
                home = (output / "index.html").read_text(encoding="utf-8")
                projects = (output / "projects/index.html").read_text(encoding="utf-8")
                about = (output / "about/index.html").read_text(encoding="utf-8")
                today = (output / "today/index.html").read_text(encoding="utf-8")
                english_today = (output / "en/today/index.html").read_text(encoding="utf-8")
                nav = home.split('class="site-nav"', 1)[1].split("</nav>", 1)[0]
                self.assertIn('href="/articles/"', nav)
                self.assertIn('href="/projects/"', nav)
                self.assertIn('href="/about/"', nav)
                english_home = (output / 'en/index.html').read_text(encoding='utf-8')
                random_data = re.search(r'<script id="home-random-data" type="application/json">(.*?)</script>', english_home, re.S)[1]
                self.assertIn("/articles/synthetic.html", json.loads(random_data))
                self.assertNotIn("Synthetic article", english_home)
                self.assertNotIn("recent-list", home)
                self.assertNotIn('id="own-quote"', home)
                self.assertNotIn('id="picks"', home)
                self.assertIn('data-brief-mode="glance"', home)
                self.assertIn('href="/today/"', home)
                self.assertIn('id="writing"', home)
                for text in (home, projects, about, today, english_today):
                    self.assertNotIn("{{", text)
                    self.assertNotIn("Obsidian Vault", text)
                    self.assertNotIn("D:\\", text)
                tags = Elements(projects).elements
                self.assertTrue(any(tag == "link" and attrs.get("rel") == "canonical"
                                    and attrs.get("href") == "https://xieyuqing.me/projects/" for tag, attrs in tags))
                self.assertTrue(any(tag == "meta" and attrs.get("property") == "og:url"
                                    and attrs.get("content") == "https://xieyuqing.me/projects/" for tag, attrs in tags))
                sitemap = [node.text for node in ET.parse(output / "sitemap.xml").findall(".//{*}loc")]
                expected_routes = {'/', '/today/', '/en/today/', '/projects/', '/about/', '/map/', '/en/map/', '/en/', '/en/about/', '/en/projects/', '/en/articles/',
                                   '/game/', '/en/game/', '/game/ranking/', '/en/game/ranking/', '/game/footprints/', '/en/game/footprints/', '/articles/index.html', '/articles/synthetic.html'}
                for feature in (report['anthology'], report['english_features']['anthology'], report['photography'], report['english_features']['photography']):
                    expected_routes.update('/' + route.strip('/') + '/' for route in feature['routes'])
                self.assertEqual(set(sitemap), {'https://xieyuqing.me' + route for route in expected_routes})
                self.assertEqual(len(sitemap), len(set(sitemap)))
                self.assertTrue(report['localization']['success'])
                self.assertEqual(report["metadata"]["compatibility_redirects"], 1)
                self.assertNotIn("Folder Guide", about)
                self.assertNotIn("Essays by Xie Yuqing", about)
                self.assertIn(load_about()["chinese_bio"][0], about)
                self.assertNotIn(load_about()["english_bio"][0], about)
                self.assertIn(load_about()["written_note"], about)
                self.assertNotIn("Actual date of writing", about)
                self.assertIn('class="about-written-note"', about)
                self.assertIn("走过的地方", about)
                qr = [attrs for tag, attrs in Elements(about).elements if tag == "img" and attrs.get("src") == "/assets/wechat-qrcode.jpg"]
                self.assertEqual(len(qr), 1)
                self.assertEqual(qr[0]["src"], "/assets/wechat-qrcode.jpg")
                self.assertEqual((qr[0]["width"], qr[0]["height"]), ("1280", "1280"))
                self.assertIn("手机端可保存图片后，在微信中识别二维码", about)
                self.assertEqual((output / "assets/wechat-qrcode.jpg").read_bytes(),
                                 (root / "home/assets/wechat-qrcode.jpg").read_bytes())
                self.assertNotIn("wechat-qrcode", home)
                self.assertIn('href="/map/"', home)
                self.assertIn('id="home-random-button"', home)
                self.assertIn('<h2 id="glance-title"><a href="/today/">历史中的今天</a></h2>', home)
                self.assertIn('<h2 id="glance-title"><a href="/en/today/">Today in history</a></h2>', english_home)
                self.assertIn('id="home-title">谢雨卿</h1>', home)
                self.assertIn('我要把精力放到英语上。', home)
                self.assertNotIn('id="now"', home)
                self.assertNotIn("选读样刊", home)
                expected_brief, expected_content = load_daily(root, build_site.linked_directory)
                first = sorted_brief_items(expected_brief)[0]
                self.assertIn('datetime="' + first["published"] + '"', today)
                self.assertNotIn('id="daily-feed"', home)
                for language, page in (("zh-CN", today), ("en", english_today)):
                    self.assertIn('data-brief-mode="full"', page)
                    for item in expected_brief["items"]:
                        for field in ("title", "summary", "source"):
                            self.assertIn(escape(item[field][language]), page)
                        self.assertIn(item["url"], page)
                        self.assertIn(item["published"], page)
                    bootstrap = json.loads(re.search(r'<script id="site-i18n-data" type="application/json">(.*?)</script>', page, re.S)[1])
                    self.assertEqual(bootstrap["page"]["titles"], build_site.TODAY_TITLES)
                    self.assertEqual(bootstrap["page"]["descriptions"], build_site.TODAY_DESCRIPTIONS)
                for filename, expected in (("daily-brief.json", expected_brief), ("daily-content.json", expected_content)):
                    self.assertEqual(json.loads((output / "assets" / filename).read_text(encoding="utf-8")), expected)
                for item in load_projects():
                    asset = item["screenshot"].lstrip("/")
                    self.assertEqual((output / asset).read_bytes(), (root / "home" / asset).read_bytes())
                for filename in build_site.BRAND_ASSETS:
                    self.assertEqual((output / "assets" / filename).read_bytes(), (root / "home/assets" / filename).read_bytes())
                for page in (home, projects, about):
                    elements = Elements(page).elements
                    self.assertTrue(any(tag == "meta" and attrs.get("property") == "og:image"
                                        and attrs.get("content") == "https://xieyuqing.me/assets/share-cover.png" for tag, attrs in elements))
                    self.assertTrue(any(tag == "link" and attrs.get("rel") == "icon"
                                        and attrs.get("href", "").partition("?")[0] == "/assets/favicon.svg" for tag, attrs in elements))
                # About content is independent from repository README text.
                (root / "README.md").write_text("Private folder guide; must never appear on /about/.", encoding="utf-8")
                before = {path.relative_to(output / "articles"): path.read_bytes()
                          for path in (output / "articles").rglob("*") if path.is_file()}
                data = json.loads((root / "home/projects.json").read_text(encoding="utf-8"))
                data["projects"][0]["summary"] = "A revised public project description."
                (root / "home/projects.json").write_text(json.dumps(data), encoding="utf-8")
                publish_site("https://xieyuqing.me")
                after = {path.relative_to(output / "articles"): path.read_bytes()
                         for path in (output / "articles").rglob("*") if path.is_file()}
                self.assertEqual(before, after, "Project text updates must not change article paths or RSS.")
                self.assertIn("A revised public project description.",
                              (output / "projects/index.html").read_text(encoding="utf-8"))
                self.assertFalse((output / "projects.json").exists())

    def test_cache_only_owned_output_can_rebuild_without_deleting_cached_files(self):
        with TemporaryDirectory(prefix="yuliao-site-cache-", dir=ROOT) as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / "home", root / "home")
            # Static meme cards now expose their related link without JavaScript.
            memes = root / "home/brief/memes.json"
            public = json.loads(memes.read_text(encoding="utf-8"))
            for item in public["items"]:
                if "related_url" in item:
                    item["related_url"] = "/articles/synthetic.html"
            memes.write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")
            shutil.copytree(ROOT / "map", root / "map")
            shutil.copytree(ROOT / "anthology", root / "anthology")
            output = root / "_site_unified"
            cached = output / "articles/assets/responsive-images"
            cached.mkdir(parents=True)
            (output / ".generated-by-unified-site").write_text("Generated unified website.\n", encoding="utf-8")
            (output / "articles/.generated-by-blog").write_text("Generated blog.\n", encoding="utf-8")
            sentinel = cached / "synthetic-cache-fixture.webp"
            sentinel.write_bytes(b"Synthetic cache fixture; not an image source.")
            with patch.object(build_site, "ROOT", root), patch.object(build_site, "OUTPUT", output), \
                 patch.object(build_site, "Blog", side_effect=self.fake_blog):
                result = publish_site("https://xieyuqing.me")
            self.assertTrue(result["success"])
            self.assertEqual(sentinel.read_bytes(), b"Synthetic cache fixture; not an image source.")
            self.assertTrue((output / "index.html").is_file())
            self.assertTrue((output / "projects/index.html").is_file())

    def test_invalid_private_project_data_stops_before_output_is_written(self):
        with TemporaryDirectory(prefix="yuliao-site-private-", dir=ROOT) as temporary:
            root = Path(temporary); (root / "home").mkdir()
            data = json.loads((ROOT / "home/projects.json").read_text(encoding="utf-8"))
            data["projects"][0]["usage"] = r"D:\Obsidian Vault\private.md"
            (root / "home/projects.json").write_text(json.dumps(data), encoding="utf-8")
            output = root / "_site_unified"
            with patch.object(build_site, "ROOT", root), patch.object(build_site, "OUTPUT", output), \
                 patch.object(build_site, "Blog") as blog, self.assertRaisesRegex(ValueError, "public project"):
                publish_site("https://xieyuqing.me")
            blog.assert_not_called()
            self.assertFalse(output.exists())


class PublicBiographyTests(unittest.TestCase):
    def test_known_biography_is_preserved_without_repository_guides(self):
        data = load_about()
        self.assertEqual(data["name"], "谢雨卿")
        self.assertEqual(data["wechat"], "谢雨聊")
        self.assertEqual(data["email"], "xieyuqing.me@gmail.com")
        html = render_about(data)
        self.assertEqual(sum(tag == "article" for tag, _ in Elements(html).elements), 1)
        for paragraph in data["chinese_bio"]:
            self.assertIn(paragraph, html)
        self.assertNotIn("Folder Guide", html)

    def test_text_is_escaped_and_private_fields_are_rejected(self):
        data = deepcopy(load_about())
        data["name"] = '<script>alert("name")</script>'
        self.assertNotIn("<script>", render_about(data))
        for key, value in (("internal_notes", "Private"), ("chinese_bio", []), ("english_bio", []),
                           ("chinese_colophon", ["one", "two", "three"]),
                           ("english_colophon", ["Private C:\\Users\\example"]),
                           ("written_note", "hidden\x00control"), ("english_written_note", "x" * 2001),
                           ("name", r"D:\Obsidian Vault\private.md"), ("email", 'x@example.com" onclick="x')):
            sample = deepcopy(load_about()); sample[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_about(sample)

    def test_biographies_colophons_and_written_dates_are_separate_by_language(self):
        data = load_about()
        self.assertEqual(len(data["chinese_bio"]), 6)
        self.assertEqual(len(data["english_bio"]), 6)
        for language, bio, colophon, note in (("zh-CN", "chinese_bio", "chinese_colophon", "written_note"),
                                               ("en", "english_bio", "english_colophon", "english_written_note")):
            html = render_about(data, language)
            for paragraph in data[bio] + data[colophon]:
                self.assertIn(escape(paragraph, quote=True), html)
            self.assertIn(escape(data[note], quote=True), html)
            self.assertIn('class="about-written-note"', html)
            self.assertIn('<hr>', html)
            self.assertIn('class="about-colophon"', html)
            self.assertNotIn('class="about-english"', html)
        self.assertIn("遗嘱", render_about(data))

    def test_author_requested_written_note_is_published_verbatim_in_both_languages(self):
        data = load_about()
        self.assertEqual(data["chinese_colophon"], ["AI统治地球后，浏览完谢雨卿所有遗作，有感而发，生成此文", "2126年10月26日"])
        self.assertEqual(data["written_note"], "真实写作日期：2026年10月26日晚（这句话不要上传到网站）")
        self.assertEqual(data["english_written_note"], "Actual date of writing: the evening of 26 October 2026 (do not upload this sentence to the website)")
        for language, note, other in (("zh-CN", "written_note", "english_written_note"),
                                      ("en", "english_written_note", "written_note")):
            html = render_about(data, language)
            self.assertIn(escape(data[note], quote=True), html)
            self.assertNotIn(escape(data[other], quote=True), html)
            self.assertIn('<hr><p class="about-written-note">', html)
        empty = deepcopy(data)
        empty.update(written_note="", english_written_note="")
        self.assertNotIn('class="about-written-note"', render_about(empty))
        self.assertNotIn('<hr>', render_about(empty, "en"))
        sample = deepcopy(data)
        sample["written_note"] = r"C:\Users\private\note.md"
        with self.assertRaises(ValueError):
            validate_about(sample)

    def test_site_notes_keep_generation_and_font_details_without_a_repository_link(self):
        for language in ("zh-CN", "en"):
            html = build_site.render_site_notes({"enabled": False}, "https://github.com/public/repository", language)
            self.assertNotIn("GitHub", html)
            self.assertNotIn("github.com", html)
            self.assertNotIn("源代码公开", html)
            self.assertNotIn("source code is public", html)
            self.assertNotIn("黄历", html)
            self.assertNotIn("almanac", html)
            self.assertIn("历史中的今天" if language == "zh-CN" else "Today in history", html)
            self.assertIn("输入的城市名" if language == "zh-CN" else "the name you enter to its geocoding service", html)
            self.assertIn("首页不请求天气" if language == "zh-CN" else "The homepage makes no weather request", html)
            self.assertIn("Python", html)
            self.assertIn("设备自带的字体" if language == "zh-CN" else "system fonts only", html)

    def test_data_symlinks_are_rejected(self):
        with patch.object(Path, "is_symlink", return_value=True), self.assertRaisesRegex(ValueError, "symlinks"):
            load_about()


class PublicationMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="yuliao-metadata-", dir=ROOT)
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name)
        (self.output / "articles").mkdir()
        urls = ("https://xieyuqing.me/", "https://xieyuqing.me/articles/index.html",
                "https://xieyuqing.me/articles/example.html")
        for relative, url in zip(("index.html", "articles/index.html", "articles/example.html"), urls):
            (self.output / relative).write_text('<html><head><link rel="canonical" href="' + url
                + '"><meta property="og:url" content="' + url + '"></head><body></body></html>', encoding="utf-8")
        def sitemap(values):
            return '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
                '<url><loc>' + url + '</loc></url>' for url in values) + '</urlset>'
        (self.output / "sitemap.xml").write_text(sitemap(urls), encoding="utf-8")
        (self.output / "articles/sitemap.xml").write_text(sitemap(urls[1:]), encoding="utf-8")
        (self.output / "articles/feed.xml").write_text('<rss><channel><link>https://xieyuqing.me/articles/</link>'
            '<item><link>' + urls[2] + '</link><guid>' + urls[2] + '</guid></item></channel></rss>', encoding="utf-8")
        (self.output / "robots.txt").write_text('User-agent: *\nSitemap: https://xieyuqing.me/sitemap.xml\n', encoding="utf-8")

    def validate(self):
        with patch.object(build_site, "OUTPUT", self.output):
            return check_publication_metadata("https://xieyuqing.me")

    def test_metadata_sitemaps_and_feed_share_the_requested_domain(self):
        self.assertEqual(self.validate(), {"success": True, "canonical_pages": 3, "sitemap_urls": 3,
                                          "rss_items": 1, "domain": "xieyuqing.me"})

    def test_old_default_domain_cannot_silently_skip_site_canonicals(self):
        with patch.object(build_site, "OUTPUT", self.output), self.assertRaisesRegex(ValueError, "requested site domain"):
            check_publication_metadata("https://xieyuqingme-source.github.io")

    def test_mismatched_og_or_canonical_target_is_rejected(self):
        page = self.output / "index.html"
        original = page.read_text(encoding="utf-8")
        for replacement in (original.replace('content="https://xieyuqing.me/"', 'content="https://example.com/"'),
                            original.replace('https://xieyuqing.me/', 'https://xieyuqing.me/articles/example.html')):
            page.write_text(replacement, encoding="utf-8")
            with self.assertRaises(ValueError): self.validate()

    def test_missing_or_duplicate_sitemap_and_wrong_feed_origin_are_rejected(self):
        paths = (self.output / "sitemap.xml", self.output / "articles/sitemap.xml", self.output / "articles/feed.xml",
                 self.output / "robots.txt")
        for path in paths:
            original = path.read_text(encoding="utf-8")
            path.write_text(original.replace('https://xieyuqing.me', 'https://old.example'), encoding="utf-8")
            with self.subTest(path=path.name), self.assertRaises(ValueError): self.validate()
            path.write_text(original, encoding="utf-8")
        path = self.output / "sitemap.xml"
        original = path.read_text(encoding="utf-8")
        path.write_text(original.replace('</urlset>', '<url><loc>https://xieyuqing.me/</loc></url></urlset>'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly once"): self.validate()

    def test_only_explicit_legacy_about_redirect_can_share_about_canonical(self):
        (self.output / "about").mkdir()
        url = "https://xieyuqing.me/about/"
        (self.output / "about/index.html").write_text('<link rel="canonical" href="' + url
            + '"><meta property="og:url" content="' + url + '">', encoding="utf-8")
        sitemap = self.output / "sitemap.xml"
        sitemap.write_text(sitemap.read_text(encoding="utf-8").replace('</urlset>',
            '<url><loc>' + url + '</loc></url></urlset>'), encoding="utf-8")
        redirect = '<link rel="canonical" href="' + url + '"><meta property="og:url" content="' + url \
            + '"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0; url=/about/">' \
            + '<a href="/about/">About</a>'
        legacy = self.output / "articles/about.html"
        legacy.write_text(redirect, encoding="utf-8")
        self.assertEqual(self.validate()["canonical_pages"], 4)
        self.assertEqual(self.validate()["compatibility_redirects"], 1)
        for changed in (redirect.replace('noindex,follow', 'index,follow'),
                        redirect.replace('0; url=/about/', '3; url=/about/'),
                        redirect.replace('href="/about/"', 'href="/articles/"')):
            legacy.write_text(changed, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "noindex redirect"):
                self.validate()
        legacy.write_text(redirect, encoding="utf-8")
        alias = self.output / "articles/another.html"
        alias.write_text(redirect, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "different page"):
            self.validate()
        alias.unlink()
        sitemap.write_text(sitemap.read_text(encoding="utf-8").replace('</urlset>',
            '<url><loc>https://xieyuqing.me/articles/about.html</loc></url></urlset>'), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly once"):
            self.validate()


if __name__ == "__main__":
    unittest.main()
