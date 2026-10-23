"""Check public photo schema, escaping, image boundaries and withdrawal cleanup."""
from copy import deepcopy
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import unittest

from PIL import Image
from photo_pages import validate_catalog, render_album, build_photos

ROOT = Path(__file__).resolve().parent.parent


def catalog():
    photo_id = "p-" + "a" * 24
    return {"version": 1, "albums": [{"id": "test-album", "title": "相册原标题", "description": "", "date": "", "location": "", "photos": [{
        "id": photo_id, "title": "", "caption": "第一段\n\n第二段", "date": "2026-10-16", "date_text": "2026年10月16日", "time": "12:34", "location": "北京",
        "width": 160, "height": 100, "src": f"/photos/images/{photo_id}-{'b' * 16}-160.webp",
        "thumbnail": f"/photos/images/{photo_id}-{'b' * 16}-80.webp", "thumbnail_width": 80, "thumbnail_height": 50}]}]}


class PhotoPageTests(unittest.TestCase):
    def test_strict_public_schema_and_derivative_paths(self):
        self.assertEqual(validate_catalog(catalog()), catalog())
        cases = []
        for field, value in (("source", "D:/private.jpg"), ("src", "https://external.example/a.webp"),
                             ("src", "/photos/images/../private.webp"), ("title", "D:\\private\\original.jpg"),
                             ("thumbnail_width", True), ("width", 0), ("thumbnail_height", 20)):
            data = catalog(); data["albums"][0]["photos"][0][field] = value; cases.append(data)
        data = catalog(); data["albums"][0]["private_note"] = "secret"; cases.append(data)
        data = catalog(); data["albums"][0]["id"] = "images"; cases.append(data)
        data = catalog(); data["albums"].append(deepcopy(data["albums"][0])); cases.append(data)
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError): validate_catalog(data)

    def test_missing_titles_stay_missing_and_text_is_escaped(self):
        data = catalog(); photo = data["albums"][0]["photos"][0]
        photo["caption"] = '</p><script>alert("x")</script>\n\n第二段'
        html = render_album(data["albums"][0])
        self.assertNotIn('<script>alert(', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertIn('data-photo-index="0"', html)
        self.assertIn('href="' + photo["src"] + '"', html)
        self.assertIn("2026年10月16日", html)
        self.assertNotIn("<h2>照片", html)

    def test_complete_long_multi_paragraph_story_is_visible_in_grid_and_in_viewer_data(self):
        data = catalog(); photo = data["albums"][0]["photos"][0]
        story = "这张照片的完整故事。" * 500 + "\n\n" + "故事的第二段必须保留到最后一句。" * 150
        photo["caption"] = story
        validate_catalog(data)
        html = render_album(data["albums"][0])
        self.assertIn('<p class="photo-story-label" data-i18n="photos.story">照片故事</p>', html)
        self.assertIn('data-i18n="photos.photo.' + photo["id"] + '.caption">' + escape(story) + '</p>', html)
        class StoryData(HTMLParser):
            collecting = False
            content = ""
            def handle_starttag(self, tag, attrs):
                if tag == "script" and dict(attrs).get("id") == "photo-data": self.collecting = True
            def handle_endtag(self, tag):
                if tag == "script": self.collecting = False
            def handle_data(self, text):
                if self.collecting: self.content += text
        parser = StoryData(); parser.feed(html)
        self.assertEqual(json.loads(parser.content)[0]["caption"], story)
        css = (ROOT / "home/assets/photos.css").read_text(encoding="utf-8")
        self.assertIn("white-space: pre-line", css)
        self.assertNotIn("line-clamp", css)
        self.assertNotIn("text-overflow", css)
        self.assertIn("overflow: auto", css)

    def fixture(self):
        temporary = TemporaryDirectory(prefix="photo-pages-", dir=ROOT)
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "home/assets").mkdir(parents=True)
        for relative in ("home/photos.template.html", "home/assets/photos.css", "home/assets/photos.js"):
            shutil.copy2(ROOT / relative, root / relative)
        (root / "home/locales").mkdir(parents=True)
        for name in ("common", "photos"):
            source = ROOT / "home/locales" / (name + ".json")
            if source.is_file(): shutil.copy2(source, root / "home/locales" / source.name)
        (root / "photos/images").mkdir(parents=True)
        data = catalog()
        photo = data["albums"][0]["photos"][0]
        for key, size in (("src", (160, 100)), ("thumbnail", (80, 50))):
            Image.new("RGB", size, "#738274").save(root / photo[key].lstrip("/"), format="WEBP")
        (root / "photos/private.md").write_text("PRIVATE NOTE MUST NEVER BE COPIED", encoding="utf-8")
        (root / "photos/images/unreferenced.jpg").write_bytes(b"private-original")
        (root / "photos/catalog.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        locale_path = root / "home/locales/photos.json"
        locale = json.loads(locale_path.read_text(encoding="utf-8"))
        album = data["albums"][0]; prefix = "photos.album." + album["id"]
        locale["zh-CN"].update({prefix + "." + field: album[field] for field in ("title", "description", "date", "location")})
        locale["en"].update({prefix + ".title": "Original Album", prefix + ".description": "", prefix + ".date": "", prefix + ".location": "", prefix + ".page_title": "Original Album · Xie Yuqing"})
        locale["zh-CN"][prefix + ".page_title"] = "相册原标题 · 谢雨卿"
        prefix = "photos.photo." + photo["id"]
        locale["zh-CN"].update({prefix + "." + field: photo[field] for field in ("title", "caption", "date_text", "location")})
        locale["zh-CN"][prefix + ".alt"] = "北京"
        locale["en"].update({prefix + ".title": "", prefix + ".caption": "First paragraph\n\nSecond paragraph", prefix + ".date_text": "16 October 2026", prefix + ".location": "Beijing", prefix + ".alt": "A public photo in Beijing"})
        locale_path.write_text(json.dumps(locale, ensure_ascii=False), encoding="utf-8")
        return root, data

    def test_only_public_referenced_images_are_copied_and_withdrawal_removes_old_outputs(self):
        root, data = self.fixture()
        output = root / "_site_unified"
        report = build_photos(root, output, "https://preview.example")
        self.assertEqual(report, {"routes": ["photos", "photos/test-album"], "albums": 1, "photos": 1})
        self.assertEqual(len(list((output / "photos/images").glob("*.webp"))), 2)
        self.assertFalse((output / "photos/private.md").exists())
        self.assertFalse((output / "photos/images/unreferenced.jpg").exists())
        html = (output / "photos/test-album/index.html").read_text(encoding="utf-8")
        self.assertIn('href="https://preview.example/photos/test-album/"', html)
        self.assertNotIn(str(root), html)
        (root / "photos/catalog.json").write_text('{"version":1,"albums":[]}', encoding="utf-8")
        report = build_photos(root, output, "https://preview.example")
        self.assertEqual(report["photos"], 0)
        self.assertFalse((output / "photos/test-album/index.html").exists())
        self.assertEqual(list((output / "photos/images").glob("*.webp")), [])
        self.assertTrue((root / "photos/private.md").is_file())

    def test_bad_image_or_unowned_output_fails_before_copying(self):
        root, data = self.fixture()
        output = root / "_site_unified"
        source = root / data["albums"][0]["photos"][0]["src"].lstrip("/")
        source.write_bytes(b"not-an-image")
        with self.assertRaises(OSError): build_photos(root, output, "https://preview.example")
        self.assertFalse(output.exists())
        Image.new("RGB", (160, 100)).save(source, format="WEBP")
        (output / "photos").mkdir(parents=True)
        private = output / "photos/unknown.txt"; private.write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unrecognized"): build_photos(root, output, "https://preview.example")
        self.assertEqual(private.read_text(encoding="utf-8"), "preserve")

    def test_absent_catalog_still_builds_empty_photography_index(self):
        root, _ = self.fixture(); (root / "photos/catalog.json").unlink()
        report = build_photos(root, root / "_site_unified", "https://preview.example")
        self.assertEqual(report, {"routes": ["photos"], "albums": 0, "photos": 0})

    def test_unknown_files_in_owned_output_are_preserved_and_block_build(self):
        root, _ = self.fixture(); output = root / "_site_unified"
        build_photos(root, output, "https://preview.example")
        unknown = output / "photos/images/private-original.jpg"
        unknown.write_bytes(b"must-preserve")
        with self.assertRaisesRegex(ValueError, "unknown"):
            build_photos(root, output, "https://preview.example")
        self.assertEqual(unknown.read_bytes(), b"must-preserve")

    def test_english_routes_share_original_images_and_translate_full_content_and_seo(self):
        root, data = self.fixture(); output = root / "_site_unified"
        source_bytes = (root / "photos/catalog.json").read_bytes()
        build_photos(root, output, "https://preview.example")
        report = build_photos(root, output, "https://preview.example", language="en")
        self.assertEqual(report, {"routes": ["en/photos", "en/photos/test-album"], "albums": 1, "photos": 1})
        html = (output / "en/photos/test-album/index.html").read_text(encoding="utf-8")
        self.assertIn('<html lang="en"', html)
        self.assertIn('<title>Original Album · Xie Yuqing</title>', html)
        self.assertIn('rel="canonical" href="https://preview.example/en/photos/test-album/"', html)
        self.assertIn('hreflang="zh-CN" href="https://preview.example/photos/test-album/"', html)
        self.assertIn('hreflang="en" href="https://preview.example/en/photos/test-album/"', html)
        self.assertIn('href="/en/photos/"', html)
        self.assertIn('First paragraph\n\nSecond paragraph', html)
        self.assertIn('aria-label="View photo 1"', html)
        self.assertIn('aria-label="Previous photo"', html)
        self.assertIn('data-site-language-switch="toggle"', html)
        self.assertIn('href="' + data["albums"][0]["photos"][0]["src"] + '"', html)
        self.assertFalse((output / "en/photos/images").exists())
        self.assertEqual(len(list((output / "photos/images").glob("*.webp"))), 2)
        self.assertEqual((root / "photos/catalog.json").read_bytes(), source_bytes)
        self.assertLess(html.index('/assets/site-i18n.js'), html.index('/assets/photos.js'))
        index = (output / "en/photos/index.html").read_text(encoding="utf-8")
        self.assertIn('href="/en/photos/test-album/"', index)
        self.assertIn('1 photo', index)

    def test_missing_or_stale_english_metadata_blocks_only_english_before_output(self):
        root, data = self.fixture(); output = root / "_site_unified"
        data["albums"][0]["photos"][0]["caption"] = "更新后的故事"
        (root / "photos/catalog.json").write_text(json.dumps(data), encoding="utf-8")
        build_photos(root, output, "https://preview.example")
        with self.assertRaisesRegex(ValueError, "missing or stale"):
            build_photos(root, output, "https://preview.example", language="en")
        self.assertFalse((output / "en/photos").exists())
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            build_photos(root, output, "https://preview.example", language="fr")

    def test_english_withdrawal_is_owned_and_cannot_remove_chinese_pages_or_images(self):
        root, data = self.fixture(); output = root / "_site_unified"
        build_photos(root, output, "https://preview.example")
        build_photos(root, output, "https://preview.example", language="en")
        (root / "photos/catalog.json").write_text('{"version":1,"albums":[]}', encoding="utf-8")
        build_photos(root, output, "https://preview.example", language="en")
        self.assertFalse((output / "en/photos/test-album/index.html").exists())
        self.assertTrue((output / "photos/test-album/index.html").is_file())
        self.assertEqual(len(list((output / "photos/images").glob("*.webp"))), 2)
        self.assertIn('The albums are being prepared.', (output / "en/photos/index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
