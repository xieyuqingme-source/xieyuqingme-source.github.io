"""Direct section navigation and accessible supplementary destinations, without a build."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

from site_i18n import localize_page

ROOT = Path(__file__).resolve().parent.parent
PAGE = '''<!doctype html><html lang="zh-CN"><head><title>Fixture</title></head><body>
<header class="site-header"><a class="brand" href="/">谢雨卿</a><nav class="site-nav">
<a data-preserve-language-link href="/articles/" lang="zh-CN">中文目录</a></nav>
<a class="site-language-switch" href="/en/">EN</a><button class="theme-toggle">Theme</button></header>
<main id="main"><p>Original content</p></main></body></html>'''


class Nodes(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.root = {"children": []}
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": [], "text": ""}
        self.stack[-1]["children"].append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        for node in self.stack[1:]:
            node["text"] += data

    def find(self, predicate, parent=None):
        nodes = []
        for child in (parent or self.root)["children"]:
            if predicate(child):
                nodes.append(child)
            nodes.extend(self.find(predicate, child))
        return nodes


class CompactHeaderTests(unittest.TestCase):
    def render(self, route="/map/", language="zh-CN"):
        return Nodes(localize_page(PAGE, ROOT, "https://example.test", route, language))

    def test_five_section_names_are_direct_links_in_both_languages(self):
        destinations = ["/", "/articles/", "/projects/", "/photos/", "/about/"]
        for language, labels in [("zh-CN", ["今日", "文章", "作品", "生活", "关于"]),
                                 ("en", ["Today", "Articles", "Projects", "Life", "About"])]:
            with self.subTest(language=language):
                tree = self.render(language=language)
                entries = tree.find(lambda node: node["attrs"].get("class") == "nav-entry")
                self.assertEqual([node["text"] for node in entries], labels)
                self.assertEqual([node["attrs"]["href"] for node in entries],
                                 [("/en" if language == "en" else "") + route for route in destinations])

    def test_secondary_destinations_have_separate_named_native_disclosures(self):
        tree = self.render(language="en")
        nav = tree.find(lambda node: node["tag"] == "nav")[0]
        links = tree.find(lambda node: node["tag"] == "a", nav)
        for route in ["/anthology/", "/game/", "/game/ranking/", "/game/footprints/", "/map/"]:
            self.assertIn("/en" + route, [node["attrs"]["href"] for node in links])
        summaries = tree.find(lambda node: node["tag"] == "summary" and "data-i18n-aria-label" in node["attrs"], nav)
        self.assertEqual(len(summaries), 3)
        for summary in summaries:
            self.assertTrue(summary["attrs"]["aria-label"].strip())
            self.assertEqual(tree.find(lambda node: node["tag"] == "a", summary), [])
        original = next(node for node in links if "data-preserve-language-link" in node["attrs"])
        self.assertEqual(original["attrs"]["href"], "/articles/")
        self.assertEqual(original["text"], "中文目录")

    def test_nested_destinations_highlight_their_section_and_keep_tools(self):
        for route, section in [("/articles/中文文章/example.html", "/articles/"),
                               ("/game/ranking/", "/projects/"), ("/map/", "/photos/")]:
            with self.subTest(route=route):
                tree = self.render(route)
                selected = tree.find(lambda node: node["attrs"].get("class") == "nav-item is-current")
                self.assertEqual(len(selected), 1)
                self.assertEqual(selected[0]["children"][0]["attrs"]["href"], section)
                self.assertEqual(len(tree.find(lambda node: node["attrs"].get("class") == "site-language-switch")), 1)
                self.assertEqual(len(tree.find(lambda node: node["attrs"].get("id") == "theme-control")), 1)


if __name__ == "__main__":
    unittest.main()
