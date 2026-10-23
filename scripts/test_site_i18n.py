"""Isolated server localization tests and all-catalogue parity checks."""
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest

from site_i18n import localize_page, localized_path, load_catalogues, check_site_languages

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = Path(os.environ.get("I18N_TEST_REFERENCE_ROOT", ROOT))
COMMON = {"common.nav.home": ("个人主页", "Home"), "common.nav.photos": ("摄影", "Photos"),
          "common.nav.map": ("足迹", "Map"), "common.nav.label": ("主导航", "Main navigation"),
          "common.skip": ("跳转到内容", "Skip to content"), "common.brandHome": ("个人主页", "Personal home"),
          "common.languageSwitch": ("EN", "中文"), "common.rss": ("RSS 订阅", "RSS feed"),
          "common.brandName": ("谢雨卿", "Xie Yuqing"), "common.shareImageAlt": ("分享图片", "Shared site image"),
          "common.theme.dark": ("深色", "Dark"), "common.theme.switchDark": ("切换为深色模式", "Switch to dark mode")}
PAGE = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Photo page</title>
<meta name="description" content="Xie's photo page"><meta property="og:title" content="Photo page"><meta property="og:description" content="Old"><meta property="og:url" content="https://old.test/photos/album/"><link rel="canonical" href="https://old.test/photos/album/">
<meta property="og:image:alt" content="原分享图片"><script src="/assets/photos.js" defer></script></head><body><a class="skip-link" href="#main">跳转到正文</a>
<header><a class="brand" href="/" aria-label="中文"><span class="brand-mark">谢</span><span>谢雨卿<small>CARL</small></span></a><nav class="site-nav" aria-label="中文"><a href="/photos/">摄影 <span>Photos</span></a><a href="/map/?year=2026#trip">足迹</a></nav></header>
<main id="main"><span data-i18n="photos.label">相册</span><button data-i18n-title="photos.title" data-i18n-aria-label="photos.title" title="旧" aria-label="旧">◯</button><input value="我的草稿" data-i18n-placeholder="photos.title"><img data-i18n-alt="photos.title" src="/photos/images/a.jpg"><blockquote>原文引用 Chinese source <a href="/articles/中文文章/a.html">原文</a></blockquote><pre>const user = "中文";</pre></main><footer><a href="/photos/">摄影</a><a href="/articles/feed.xml">RSS</a></footer></body></html>'''

class Tags(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.items = []; self.feed(text)
    def handle_starttag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))


class ServerLocalizationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="i18n-helper-fixture-", dir=ROOT)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "home/locales").mkdir(parents=True)
        common = {lang: {key: values[index] for key, values in COMMON.items()} for index, lang in enumerate(("zh-CN", "en"))}
        self.write_catalogue("common", common)
        self.write_catalogue("photos", {"zh-CN": {"photos.label": "相册", "photos.title": "打开相册"}, "en": {"photos.label": "Albums & stories", "photos.title": "Open album"}})

    def write_catalogue(self, name, data):
        (self.root / f"home/locales/{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def render(self, language="en", **kwargs):
        return localize_page(PAGE, self.root, "https://site.test", "/photos/album/", language, modules=("photos",), **kwargs)

    def test_explicit_feature_routes_preserve_state_parameters(self):
        for route in ("/", "/about/", "/projects/", "/photos/album/", "/map/", "/game/ranking/", "/anthology/work/"):
            english = "/en" + route
            self.assertEqual(localized_path(route + "?q=A%26B#中文", "en"), english + "?q=A%26B#中文")
            self.assertEqual(localized_path(english, "zh-CN"), route)
        for path in ("https://site.test/photos/", "//external.test/map/", "../README.md", "/articles/中文文章/a.html", "/en/articles/a.html", "/photos/images/a.webp", "/assets/map.js"):
            self.assertEqual(localized_path(path, "en"), path)

    def test_initial_chrome_text_attributes_and_original_content(self):
        text = self.render()
        self.assertIn('<html lang="en">', text)
        self.assertIn('Albums &amp; stories', text)
        self.assertIn('title="Open album"', text)
        self.assertIn('aria-label="Open album"', text)
        self.assertIn('placeholder="Open album"', text)
        self.assertIn('alt="Open album"', text)
        self.assertIn('aria-label="Main navigation"', text)
        self.assertIn('aria-label="Personal home"', text)
        self.assertIn('<span data-i18n="common.brandName">Xie Yuqing</span><small>CARL</small>', text)
        self.assertIn('<span class="brand-mark">谢</span>', text)
        self.assertIn('<meta property="og:image:alt" content="Shared site image">', text)
        self.assertIn('href="/en/photos/"', text)
        self.assertIn('href="/en/map/?year=2026#trip"', text)
        self.assertIn('Skip to content', text)
        self.assertIn('RSS feed', text)
        self.assertIn('value="我的草稿"', text)
        self.assertIn('<blockquote>原文引用 Chinese source <a href="/articles/中文文章/a.html">原文</a></blockquote>', text)
        self.assertIn('<pre>const user = "中文";</pre>', text)
        marked = PAGE.replace('<main id="main">', '<main id="main"><a data-i18n-link href="/game/ranking/?edit=1#list">Tool</a>')
        marked = localize_page(marked, self.root, 'https://site.test', '/photos/album/', 'en', modules=('photos',))
        self.assertIn('href="/en/game/ranking/?edit=1#list"', marked)
        preserved = PAGE.replace('</nav>', '<a class="article-directory-link" data-preserve-language-link data-i18n-link href="/articles/" lang="zh-CN" aria-label="English original; open Chinese directory">中文目录</a></nav>')
        preserved = localize_page(preserved, self.root, 'https://site.test', '/articles/English%20Articles/original.html', 'en', modules=('photos',))
        self.assertIn('href="/articles/" lang="zh-CN" aria-label="English original; open Chinese directory">中文目录</a>', preserved)

    def test_both_seo_languages_runtime_order_and_safe_json(self):
        text = self.render(title={"zh-CN": "相册", "en": "Carl's album"}, description={"zh-CN": "说明", "en": "</script><script>alert(1)</script>"})
        self.assertLess(text.index('charset="utf-8"'), 1024)
        self.assertLess(text.index('src="/assets/site-i18n.js"'), text.index('src="/assets/photos.js"'))
        encoded = re.search(r'id="site-i18n-data"[^>]*>(.*?)</script>', text, re.S).group(1)
        self.assertNotIn('<script>', encoded)
        data = json.loads(encoded)
        self.assertEqual(data["page"]["titles"]["en"], "Carl's album")
        self.assertEqual(data["page"]["switchMode"], "history")
        self.assertIn('href="https://site.test/en/photos/album/"', text)
        self.assertIn('hreflang="zh-CN" href="https://site.test/photos/album/"', text)

    def test_static_documents_navigate_and_original_metadata_survives(self):
        text = localize_page(PAGE, self.root, "https://site.test", "/about/", "en", modules=("photos",))
        data = json.loads(re.search(r'id="site-i18n-data"[^>]*>(.*?)</script>', text, re.S).group(1))
        self.assertEqual(data["page"]["switchMode"], "navigate")
        original = localize_page(PAGE, self.root, "https://site.test", "/articles/中文文章/a.html", "en", modules=("photos",))
        self.assertIn('href="https://old.test/photos/album/"', original)
        self.assertNotIn('hreflang=', original)

    def test_svg_title_identity_is_not_replaced_by_document_seo(self):
        source = PAGE.replace('<main id="main">', '<main id="main"><svg aria-labelledby="map-svg-title"><title id="map-svg-title" data-i18n="photos.title">原图标题</title></svg>')
        text = localize_page(source, self.root, 'https://site.test', '/photos/album/', 'en', modules=('photos',), title={'zh-CN': '文档', 'en': 'Document title'})
        self.assertIn('<title>Document title</title>', text)
        self.assertIn('<title id="map-svg-title" data-i18n="photos.title">Open album</title>', text)
        self.assertIn('aria-labelledby="map-svg-title"', text)

    def test_missing_keys_and_catalogue_collisions_fail(self):
        self.write_catalogue("photos", {"zh-CN": {}, "en": {}})
        with self.assertRaisesRegex(ValueError, "Missing en localization key"):
            self.render()
        self.write_catalogue("photos", {lang: {"common.nav.home": "Collision"} for lang in ("zh-CN", "en")})
        with self.assertRaisesRegex(ValueError, "collision"):
            load_catalogues(self.root, ("photos",))

    def test_relocalizing_is_idempotent_and_does_not_duplicate_runtime(self):
        initial = self.render()
        second = localize_page(initial, self.root, "https://site.test", "/photos/album/", "en", modules=("photos",))
        self.assertEqual(second.count('id="site-i18n-data"'), 1)
        self.assertEqual(second.count('src="/assets/site-i18n.js"'), 1)
        self.assertEqual(second.count('rel="canonical"'), 1)
        self.assertEqual(second.count('data-i18n="common.brandName"'), 1)
        chinese = localize_page(second, self.root, "https://site.test", "/photos/album/", "zh-CN", modules=("photos",))
        self.assertIn('<span data-i18n="common.brandName">谢雨卿</span><small>CARL</small>', chinese)

    def test_publication_checker_rejects_missing_bootstrap_and_runtime(self):
        output = self.root / "output"
        (output / "en/photos/album").mkdir(parents=True)
        page = output / "en/photos/album/index.html"
        page.write_text(self.render(), encoding="utf-8")
        (output / "assets").mkdir()
        (output / "assets/site-i18n.js").write_text("/* shared */", encoding="utf-8")
        self.assertEqual(check_site_languages(output, "https://site.test")["english_feature_pages"], 1)
        page.write_text(PAGE, encoding="utf-8")
        with self.assertRaises(ValueError):
            check_site_languages(output, "https://site.test")

    def test_all_repository_catalogues_have_language_and_placeholder_parity(self):
        sources = list((REFERENCE / "home/locales").glob("*.json"))
        self.assertTrue(sources, "The shared localization catalogue must exist.")
        for source in sources:
            with self.subTest(catalogue=source.name):
                data = json.loads(source.read_text(encoding="utf-8-sig"))
                self.assertEqual(set(data), {"zh-CN", "en"})
                self.assertEqual(set(data["zh-CN"]), set(data["en"]))
                for key in data["zh-CN"]:
                    self.assertIsInstance(data["zh-CN"][key], str)
                    self.assertIsInstance(data["en"][key], str)
                    placeholders = lambda value: set(re.findall(r"\{([A-Za-z][A-Za-z0-9_]*)\}", value))
                    self.assertEqual(placeholders(data["zh-CN"][key]), placeholders(data["en"][key]), key)


if __name__ == "__main__":
    unittest.main()
