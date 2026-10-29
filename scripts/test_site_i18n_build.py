"""Synthetic two-article integration fixture for bilingual build orchestration.

Feature builders are contract stubs; their owners test the full applications.
This never invokes the full publication or private map/photo export workflows.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import json
import os
import shutil
import unittest
from xml.etree import ElementTree as ET

import build_blog
import build_site
from site_i18n import localize_page, localized_path

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = Path(os.environ.get("I18N_TEST_REFERENCE_ROOT", ROOT))


def copy_corner_fixture(root):
    """Only the Chinese-first index/tool belong to this two-article contract fixture."""
    folder = root/'english-corner'
    folder.mkdir()
    columns = json.loads((ROOT/'english-corner/catalog.json').read_text(encoding='utf-8'))['columns']
    (folder/'catalog.json').write_text(json.dumps({'version':1,'columns':columns,'cards':[]},ensure_ascii=False),encoding='utf-8')
    (folder/'notes.json').write_text('{"version":1,"works":{}}',encoding='utf-8')
    (folder/'quiz.json').write_text('{"version":1,"questions":[]}',encoding='utf-8')
    quotes = root/'home/brief/english-quotes.json'
    data = json.loads(quotes.read_text(encoding='utf-8'))
    for item in data['quotes']: item.pop('related',None)
    quotes.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    shutil.copytree(ROOT/'marx-engels',root/'marx-engels')
    # Second-edition life pages reuse only these two reviewed public profiles.
    (root/'map/people').mkdir(parents=True,exist_ok=True)
    for person in ('marx','engels'):
        shutil.copy2(ROOT/'map/people'/(person+'.md'),root/'map/people'/(person+'.md'))

    # This fixture has two synthetic essays. Real QA targets are verified in
    # test_marx_engels; no link here should point to an absent real article.
    (root/'marx-engels/qa-index.json').write_text('{"version":1,"items":[]}',encoding='utf-8')


class BilingualBuildContractTests(unittest.TestCase):
    def test_two_languages_share_assets_and_cover_complete_sitemap(self):
        with TemporaryDirectory(prefix="i18n-build-fixture-", dir=ROOT) as temporary:
            root = Path(temporary)
            output = root / '_site_unified'
            shutil.copytree(REFERENCE / 'home', root / 'home')
            copy_corner_fixture(root)
            memes = root / 'home/brief/memes.json'
            public = json.loads(memes.read_text(encoding='utf-8'))
            for item in public['items']:
                if 'related_url' in item:
                    item['related_url'] = '/articles/index.html'
            memes.write_text(json.dumps(public, ensure_ascii=False), encoding='utf-8')
            (root / 'blog').mkdir()
            for name in ('config.json', 'publication-dates.json', 'style.css', 'site.js', 'comment-avatar.svg'):
                shutil.copy2(REFERENCE / 'blog' / name, root / 'blog' / name)
            (root / 'blog/waline.json').write_text('{"enabled": false}', encoding='utf-8')
            (root / '中文文章').mkdir()
            (root / 'English Articles').mkdir()
            (root / '中文文章/2026-01-02-fixture.md').write_text('# 合成中文文章\n\n公开测试正文。\n', encoding='utf-8')
            (root / 'English Articles/2026-01-01-fixture.md').write_text('# Synthetic English original\n\nPublic test body.\n', encoding='utf-8')
            calls = []

            def feature(name, language):
                calls.append((name, language))
                route = '/' + name + '/'
                selected = localized_path(route, language)
                title = {'zh-CN': '合成测试', 'en': 'Synthetic fixture'}
                page = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Fixture</title><meta name="description" content="Public fixture"><link rel="canonical" href="https://site.test' + route + '"><meta property="og:url" content="https://site.test' + route + '"></head><body><header><nav class="site-nav"><a href="/map/">足迹</a><a href="/photos/">摄影</a></nav></header><main>Public contract fixture.</main></body></html>'
                page = localize_page(page, root, 'https://site.test', route, language, title=title)
                target = output / selected.strip('/') / 'index.html'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(page, encoding='utf-8')
                return {'routes': [selected]}

            def photos(*args, language='zh-CN', **kwargs):
                return {**feature('photos', language), 'albums': 0, 'photos': 0}
            def footprints(*args, language='zh-CN', **kwargs):
                return feature('game/footprints' if kwargs.get('maker') else 'map', language)
            def anthology(*args, language='zh-CN', **kwargs):
                return {**feature('anthology', language), 'works': 0, 'collections': 0}

            with patch.multiple(build_blog, ROOT=root, INTERACTION_DIR=root/'blog'), \
                 patch.multiple(build_site, ROOT=root, OUTPUT=output), \
                 patch.object(build_site, 'load_map', return_value={}), \
                 patch.object(build_site, 'load_anthology', return_value=[]), \
                 patch.object(build_site, 'load_glossary', return_value={}), \
                 patch.object(build_site, 'build_photos', side_effect=photos), \
                 patch.object(build_site, 'build_map', side_effect=footprints), \
                 patch.object(build_site, 'build_anthology', side_effect=anthology):
                report = build_site.build_site('https://site.test')
            self.assertEqual(calls, [('photos', 'zh-CN'), ('map', 'zh-CN'), ('anthology', 'zh-CN'),
                                     ('photos', 'en'), ('map', 'en'), ('anthology', 'en'), ('game/footprints', 'zh-CN'), ('game/footprints', 'en')])
            self.assertEqual(report['articles'], 2)
            self.assertEqual(report['english']['complete'], 0)
            self.assertEqual(report['english']['pending'], 1)
            self.assertEqual(report['english']['english_originals'], 1)
            self.assertTrue(report['metadata']['success'])
            self.assertTrue(report['localization']['success'])
            self.assertEqual(report['localization']['english_feature_pages'], 11)
            for route in ('/photos/', '/map/', '/anthology/', '/game/', '/game/ranking/', '/', '/today/', '/about/', '/projects/', '/articles/'):
                for language in ('zh-CN', 'en'):
                    page = output / localized_path(route, language).strip('/') / 'index.html'
                    self.assertTrue(page.is_file(), str(page))
            english_home = (output/'en/index.html').read_text(encoding='utf-8')
            for feature_route in ('photos', 'map', 'game', 'anthology'):
                self.assertIn(f'href="/en/{feature_route}/"', english_home)
            english_projects = (output/'en/projects/index.html').read_text(encoding='utf-8')
            self.assertIn('href="/en/map/"', english_projects)
            self.assertIn('href="/en/game/ranking/"', english_projects)
            self.assertFalse((output/'en/assets').exists())
            sitemap = [node.text for node in ET.parse(output/'sitemap.xml').findall('.//{*}loc')]
            self.assertEqual(len(sitemap), len(set(sitemap)))
            for route in ('/en/today/', '/en/photos/', '/en/map/', '/en/anthology/', '/en/game/', '/en/game/ranking/'):
                self.assertIn('https://site.test' + route, sitemap)
            self.assertIn('https://site.test/english/',sitemap)
            self.assertIn('https://site.test/english/tools/numbers/',sitemap)
            self.assertNotIn('https://site.test/en/english/',sitemap)
            self.assertFalse((output/'en/english').exists())
            self.assertIn('https://site.test/marx/',sitemap)
            self.assertNotIn('https://site.test/en/marx/',sitemap)
            self.assertFalse((output/'en/marx').exists())
            self.assertIn('href="/english/"',english_home)
            rss = ET.parse(output/'articles/feed.xml').findall('./channel/item')
            self.assertEqual(len(rss), 2)
            self.assertFalse(any('/en/articles/' in item.findtext('link') for item in rss))


if __name__ == '__main__':
    unittest.main()
