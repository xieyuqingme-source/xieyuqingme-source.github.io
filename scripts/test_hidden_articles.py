"""Publication exclusions must remove routes without changing source articles."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import json
import unittest

import build_blog
from build_blog import Blog


class HiddenArticleTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        (root / "blog/translations").mkdir(parents=True)
        (root / "中文文章").mkdir()
        (root / "English Articles").mkdir()
        config = Path(build_blog.ROOT) / "blog/config.json"
        (root / "blog/config.json").write_bytes(config.read_bytes())
        for name in ("2026-01-01-hidden.md", "2026-01-02-public.md"):
            (root / "中文文章" / name).write_text("# Title\n\nBody.\n", encoding="utf-8")
        hidden = "中文文章/2026-01-01-hidden.md"
        (root / "blog/hidden-articles.json").write_text(json.dumps({"version": 1, "articles": [
            {"file": hidden, "reason": "fixture"}]}), encoding="utf-8")
        # Hidden manifest entries are skipped, even when their old translation is unavailable.
        (root / "blog/translations/manifest.json").write_text(json.dumps({"version": 1, "translations": {
            hidden: {"status": "complete"}}}), encoding="utf-8")
        return root, hidden

    def test_hidden_original_is_absent_and_its_translation_is_skipped(self):
        with TemporaryDirectory() as tmp:
            root, hidden = self.fixture(tmp)
            before = (root / hidden).read_bytes()
            with patch.multiple(build_blog, ROOT=root, INTERACTION_DIR=root / "blog"):
                blog = Blog("https://site.test/articles")
                blog.collect()
                self.assertEqual([a.source.name for a in blog.articles], ["2026-01-02-public.md"])
                self.assertNotIn((root / hidden).resolve(), blog.pages)
                self.assertNotIn(hidden, blog.translations)
                self.assertNotIn(hidden, blog.translation_states)
                with self.assertRaisesRegex(ValueError, "outside published content"):
                    blog.rewrite("2026-01-01-hidden.md", root / "中文文章/2026-01-02-public.md")
            self.assertEqual((root / hidden).read_bytes(), before)

    def test_missing_path_names_the_json_line_and_entry(self):
        with TemporaryDirectory() as tmp:
            root, _ = self.fixture(tmp)
            (root / "blog/hidden-articles.json").write_text(
                '{\n  "version": 1,\n  "articles": [\n    {"file": "中文文章/missing.md", "reason": "fixture"}\n  ]\n}\n', encoding="utf-8")
            with patch.multiple(build_blog, ROOT=root, INTERACTION_DIR=root / "blog"):
                with self.assertRaisesRegex(ValueError, r"line 4 \(entry 1\).*中文文章/missing.md"):
                    Blog("https://site.test/articles").collect()


if __name__ == "__main__":
    unittest.main()
