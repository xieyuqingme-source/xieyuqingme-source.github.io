"""Anthology parsing, reviewed content boundaries, portable newlines and static output."""
from pathlib import Path
from html.parser import HTMLParser
from tempfile import TemporaryDirectory
import json
import shutil
import unittest

from anthology_pages import load_anthology, load_glossary, normalized_hash, parse_source, render_work, build_anthology
from build_site import Elements

ROOT = Path(__file__).resolve().parent.parent


class AnthologyTests(unittest.TestCase):
    def test_source_inventory_and_only_explicit_credits(self):
        works = load_anthology(ROOT)
        self.assertEqual(len(works), 13)
        self.assertEqual(len({w['source'] for w in works}), 5)
        self.assertEqual([w['title'] for w in works if not w['credit']], ['原毁', 'Gettysburg Address', 'La Marseillaise'])
        self.assertEqual(next(w['credit'] for w in works if w['title'] == '与朱元思书'), '南朝·梁 吴均')
        self.assertEqual({w['language'] for w in works}, {'zh-CN', 'en', 'fr'})

    def test_lf_and_crlf_have_identical_meaning_and_review_hash(self):
        for path in (ROOT/'anthology/content').glob('*.md'):
            lf = path.read_bytes().replace(b'\r\n', b'\n')
            self.assertEqual(normalized_hash(lf), normalized_hash(lf.replace(b'\n', b'\r\n')))
            self.assertEqual(parse_source(lf.decode('utf-8')), parse_source(lf.replace(b'\n', b'\r\n').decode('utf-8')))

    def test_sections_are_preserved_without_inventing_missing_material(self):
        works = parse_source('## 测试\n\n原文第一行\n第二行\n\n### 注释\n\n已有注释\n\n唐·原署名\n\n---\n')
        rendered, sections = render_work(works[0])
        self.assertIn('原文第一行<br', rendered)
        self.assertIn('已有注释', rendered)
        self.assertEqual(sections, [('original', '原文'), ('section-1', '注释')])
        self.assertNotIn('译文', rendered)
        self.assertNotIn('赏析', rendered)
        rendered, _ = render_work({'body':'<script>alert(1)</script>'})
        self.assertNotIn('<script>', rendered)

    def test_review_mismatch_duplicate_route_and_private_path_fail(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT/'anthology', root/'anthology')
            path = root/'anthology/catalog.json'
            original = json.loads(path.read_text(encoding='utf-8'))
            for change in ('hash', 'route', 'path'):
                data = json.loads(json.dumps(original))
                group = data['collections'][0]
                if change == 'hash': group['sha256_lf'] = '0'*64
                elif change == 'route': group['works'][1]['slug'] = group['works'][0]['slug']
                else: group['file'] = '../private.md'
                path.write_text(json.dumps(data), encoding='utf-8')
                with self.subTest(change=change), self.assertRaises(ValueError): load_anthology(root)

    def test_glossary_is_contextual_and_only_verified_notes_are_rendered(self):
        public = load_glossary(ROOT, load_anthology(ROOT))
        self.assertEqual((len(public), sum(map(len, public.values()))), (3, 8))
        self.assertTrue(all(e['source_url'].startswith('https://dict.revised.moe.edu.tw/') and e['edition']
                            for entries in public.values() for e in entries))
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'anthology').mkdir()
            path = root/'anthology/glossary.json'
            # Synthetic data tests context and provenance; no real literary gloss is supplied.
            first = {'term':'same term', 'explanation':'Synthetic context A', 'source':'Synthetic test fixture', 'source_url':'https://example.org/dictionary', 'verification':'verified', 'edition':'fixture-v1', 'page':'1'}
            second = {**first, 'explanation':'Unreviewed synthetic context B', 'verification':'pending'}
            data = {'version':1, 'works':{'fixture-a':[first], 'fixture-b':[second]}}
            path.write_text(json.dumps(data), encoding='utf-8')
            works = [{'slug':'fixture-a', 'body':'same term'}, {'slug':'fixture-b', 'body':'same term'}]
            self.assertEqual(load_glossary(root, works), {'fixture-a':[first]})
            first['source'] = ''
            path.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'actual source'): load_glossary(root, works)
            first['source'] = 'Synthetic test fixture'
            for url in ('javascript:alert(1)', 'http://example.org/', 'https://127.0.0.1/', 'https://user:secret@example.org/'):
                first['source_url'] = url
                path.write_text(json.dumps(data), encoding='utf-8')
                with self.subTest(url=url), self.assertRaisesRegex(ValueError, 'public HTTPS'): load_glossary(root, works)

    def test_inline_markers_preserve_every_visible_character_and_only_reviewed_context(self):
        class Text(HTMLParser):
            def __init__(self, html): super().__init__(); self.parts=[]; self.feed(html)
            def handle_data(self, value): self.parts.append(value)
        works = load_anthology(ROOT)
        glossary = load_glossary(ROOT, works)
        marked = 0
        for work in works:
            original, _ = render_work(work)
            rendered, _ = render_work(work, glossary.get(work['slug'], []))
            self.assertEqual(''.join(Text(original).parts), ''.join(Text(rendered).parts))
            count = rendered.count('data-note-index=')
            self.assertEqual(count, len(glossary.get(work['slug'], [])))
            marked += count
        self.assertEqual(marked, 8)

    def test_each_work_gets_own_canonical_and_index_search_text(self):
        with TemporaryDirectory() as temporary:
            output = Path(temporary)
            report = build_anthology(ROOT, output, 'https://public.test')
            self.assertEqual((report['works'], len(report['routes'])), (13, 14))
            self.assertEqual(len(list(output.rglob('*.html'))), 14)
            index = (output/'anthology/index.html').read_text(encoding='utf-8')
            self.assertEqual(index.count(' data-work '), 13)
            self.assertIn('落霞与孤鹜齐飞', index)
            for route in report['routes']:
                text = (output/route.lstrip('/')/'index.html').read_text(encoding='utf-8')
                tags = Elements(text).elements
                self.assertEqual([a['href'] for t,a in tags if t=='link' and a.get('rel')=='canonical'], ['https://public.test'+route])
                self.assertEqual(sum(t=='h1' for t,a in tags), 1)
                self.assertNotIn('{{', text)
                self.assertNotIn('Obsidian Vault', text)
                self.assertNotIn('data-article-path', text)
                self.assertNotIn('waline', text.lower())
            long_work = (output/'anthology/teng-wang-ge-xu/index.html').read_text(encoding='utf-8')
            self.assertIn('请洒潘江，各倾陆海云尔', long_work)
            self.assertIn('槛外长江空自流', long_work)
            self.assertIn('"term": "潦水"', long_work)
            self.assertIn('aria-modal="false"', long_work)
            self.assertNotIn('anthology-lookup', long_work)
            self.assertNotIn('输入本篇词语', long_work)
            menu = long_work.split('id="anthology-selection"',1)[1].split('</div>',1)[0]
            self.assertEqual(menu.count('<button '), 2)
            self.assertIn('打开 Google 外部搜索新页', menu)
            self.assertNotIn('未收录', menu)


if __name__ == '__main__': unittest.main()
