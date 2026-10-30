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

    def test_three_section_names_are_menu_buttons_and_about_remains_a_link(self):
        for language, labels in [("zh-CN", ["文章", "作品", "足迹", "关于"]),
                                 ("en", ["Articles", "Projects", "Footprints", "About"])]:
            with self.subTest(language=language):
                tree = self.render(language=language)
                entries = tree.find(lambda node: node["attrs"].get("class") == "nav-entry")
                self.assertEqual([node["text"].replace("⌄", "") for node in entries], labels)
                self.assertEqual([node["tag"] for node in entries], ["summary", "summary", "summary", "a"])
                for entry in entries[:3]:
                    self.assertNotIn("href", entry["attrs"])
                    self.assertEqual(tree.find(lambda node: node["tag"] in {"a", "button"}, entry), [])
                self.assertEqual(entries[-1]["attrs"]["href"], ("/en" if language == "en" else "") + "/about/")

    def test_each_native_menu_contains_its_two_destinations_and_keeps_original_links(self):
        for language, labels in [("zh-CN", [["我的文章", "古今名作"], ["今天", "看世界", "学英语", "读马恩", "AI应用", "小游戏"], ["我的足迹", "我的照片"]]),
                                 ("en", [["My articles", "Literary classics"], ["Today", "World (Chinese)", "Learn English (中文)", "Reading Marx & Engels (中文)", "AI applications", "Games"], ["My footprints", "My photos"]])]:
            tree = self.render(language=language)
            nav = tree.find(lambda node: node["tag"] == "nav")[0]
            groups = tree.find(lambda node: node["tag"] == "details", nav)
            self.assertEqual(len(groups), 3)
            expected = [["/articles/", "/anthology/"], ["/today/", "/world/", "/english/", "/marx/", "/projects/", "/game/"], ["/map/", "/photos/"]]
            for group, routes, names in zip(groups, expected, labels):
                links = tree.find(lambda node: node["tag"] == "a" and "data-preserve-language-link" not in node["attrs"], group)
                self.assertEqual([node["attrs"]["href"] for node in links], [("/en" if language == "en" and route not in ("/world/", "/english/", "/marx/") else "") + route for route in routes])
                self.assertEqual([node["text"] for node in links], names)
                summary = tree.find(lambda node: node["tag"] == "summary", group)[0]
                self.assertTrue(summary["attrs"]["aria-label"].strip())
            original = tree.find(lambda node: "data-preserve-language-link" in node["attrs"], nav)[0]
            self.assertEqual(original["attrs"]["href"], "/articles/")
            self.assertEqual(original["text"], "中文目录")

    def test_header_keeps_both_names_and_homepage_brief_heading_is_a_real_link(self):
        for language in ("zh-CN", "en"):
            tree = self.render(language=language)
            brand = tree.find(lambda node: node["attrs"].get("class") == "brand")[0]
            self.assertEqual(brand["text"], "谢雨卿 Xie Yuqing · Carl")
            self.assertEqual(brand["attrs"]["href"], "/en/" if language == "en" else "/")
        for file, route, label in (("home/index.template.html", "/today/", "今天"), ("home/en/index.template.html", "/en/today/", "Today")):
            tree = Nodes((ROOT / file).read_text(encoding="utf-8"))
            heading = tree.find(lambda node: node["attrs"].get("id") == "glance-title")[0]
            links = tree.find(lambda node: node["tag"] == "a", heading)
            self.assertEqual([(node["attrs"].get("href"), node["text"]) for node in links], [(route, label)])

    def test_nested_destinations_highlight_their_section_and_keep_tools(self):
        for route, section in [("/articles/中文文章/example.html", "articles"),
                               ("/game/ranking/", "projects"), ("/today/", "projects"), ("/world/sources/", "projects"), ("/photos/", "map")]:
            with self.subTest(route=route):
                tree = self.render(route)
                selected = tree.find(lambda node: node["attrs"].get("class") == "nav-item is-current")
                self.assertEqual(len(selected), 1)
                self.assertEqual(selected[0]["attrs"]["data-nav-group"], section)
                self.assertEqual(len(tree.find(lambda node: node["attrs"].get("class") == "site-language-switch")), 1)
                toggles = tree.find(lambda node: node["attrs"].get("id") == "theme-toggle")
                self.assertEqual(len(toggles), 1)
                self.assertEqual(toggles[0]["tag"], "button")
                self.assertEqual(tree.find(lambda node: "data-skin-choice" in node["attrs"]), [])

    def test_home_route_highlights_no_section_and_every_page_ends_with_one_footer(self):
        tree = self.render("/")
        self.assertEqual(tree.find(lambda node: node["attrs"].get("class") == "nav-item is-current"), [])
        page = PAGE.replace("</main>", '</main><footer class="site-footer container"><p>Old footer</p></footer>')
        for language, prefix in (("zh-CN", ""), ("en", "/en")):
            with self.subTest(language=language):
                tree = Nodes(localize_page(page, ROOT, "https://example.test", "/projects/", language))
                footers = tree.find(lambda node: node["tag"] == "footer")
                self.assertEqual(len(footers), 1)
                self.assertNotIn("Old footer", footers[0]["text"])
                brand = tree.find(lambda node: node["attrs"].get("class") == "footer-brand", footers[0])[0]
                self.assertEqual(brand["text"], "谢雨卿")
                self.assertEqual([child["tag"] for child in brand["children"]], ["img", "span"])
                marks = tree.find(lambda node: node["tag"] == "img", brand)
                self.assertEqual([(mark["attrs"].get("class"), mark["attrs"].get("src"), mark["attrs"].get("alt")) for mark in marks],
                                 [("footer-mark", "/assets/favicon.svg?v=qinghuan-1", "")])
                self.assertEqual(tree.find(lambda node: node["attrs"].get("class") == "footer-yuliao"), [])
                links = [node["attrs"]["href"] for node in tree.find(lambda node: node["tag"] == "a", footers[0])]
                for route in ("/today/", "/articles/", "/projects/", "/map/", "/photos/", "/about/"):
                    self.assertIn(prefix + route, links)
                self.assertEqual(links[0], prefix + "/today/")
                self.assertIn(prefix + "/about/#site", links)
                self.assertTrue(any(href.startswith("mailto:") for href in links))


if __name__ == "__main__":
    unittest.main()
