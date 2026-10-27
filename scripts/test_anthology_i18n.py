"""Bilingual anthology chrome must never translate or rewrite a source work."""
from pathlib import Path
from tempfile import TemporaryDirectory
from html.parser import HTMLParser
from hashlib import sha256
import json
import unittest
from anthology_pages import build_anthology, load_anthology, load_glossary

ROOT = Path(__file__).resolve().parent.parent

class Original(HTMLParser):
    def __init__(self, page):
        super().__init__(convert_charrefs=True); self.inside=False; self.depth=0; self.text=[]; self.lang=None; self.feed(page)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='section' and attrs.get('id')=='original': self.inside=True; self.depth=1; self.lang=attrs['lang']
        elif self.inside and tag=='section': self.depth+=1
    def handle_endtag(self, tag):
        if self.inside and tag=='section':
            self.depth-=1
            if not self.depth:self.inside=False
    def handle_data(self, value):
        if self.inside:self.text.append(value)

class AnthologyLocalizationTests(unittest.TestCase):
    def test_both_route_sets_have_corresponding_metadata_and_identical_originals(self):
        before={p:sha256(p.read_bytes()).hexdigest() for p in (ROOT/'anthology/content').glob('*.md')}
        with TemporaryDirectory() as tmp:
            out=Path(tmp)
            zh=build_anthology(ROOT,out,'https://example.test')
            en=build_anthology(ROOT,out,'https://example.test',language='en')
            self.assertEqual((len(zh['routes']),len(en['routes'])),(14,14))
            self.assertEqual(en['routes'],['/en'+r for r in zh['routes']])
            catalogue = json.loads((ROOT/'home/locales/anthology.json').read_text(encoding='utf8'))
            self.assertEqual(catalogue['zh-CN']['anthology.tagline'], '这些是谢雨卿推崇的名篇，涵盖古今中外各种文学体裁，他已倒背如流，也推荐你们阅读')
            for code, route in (('zh-CN', 'anthology/index.html'), ('en', 'en/anthology/index.html')):
                self.assertIn(catalogue[code]['anthology.tagline'], (out/route).read_text(encoding='utf8'))
            for work in load_anthology(ROOT):
                route='anthology/'+work['slug']+'/index.html'
                a=(out/route).read_text(encoding='utf8');b=(out/'en'/route).read_text(encoding='utf8')
                self.assertIn('<html lang="en"',b)
                self.assertIn('href="https://example.test/en/anthology/'+work['slug']+'/"',b)
                self.assertIn('hreflang="zh-CN"',b);self.assertIn('hreflang="en"',b)
                self.assertEqual(Original(a).text,Original(b).text)
                self.assertEqual(Original(b).lang,work['language'])
                self.assertIn('data-site-language-switch="zh-CN"',b)
                self.assertIn('Copy</span></button>',b)
                self.assertNotIn('anthology-lookup',b)
                if not work['credit']:self.assertIn('Author not specified in the source · Date not specified',b)
                payload=json.loads(b.split('id="site-i18n-data" type="application/json">',1)[1].split('</script>',1)[0])
                self.assertEqual(payload['page']['route'],'/anthology/'+work['slug']+'/')
                self.assertEqual(payload['page']['switchMode'],'history')
            self.assertEqual(before,{p:sha256(p.read_bytes()).hexdigest() for p in before})

    def test_metadata_and_contextual_notes_are_complete_but_do_not_add_credits(self):
        data=json.loads((ROOT/'home/locales/anthology.json').read_text(encoding='utf8'))
        self.assertEqual(set(data['zh-CN']),set(data['en']))
        for work in load_anthology(ROOT):
            prefix='anthology.work.'+work['slug']+'.'
            for key in ('title','credit','guide','pageTitle','readLabel'):self.assertTrue(data['en'][prefix+key])
            if not work['credit']:self.assertEqual(data['en'][prefix+'credit'],'Author not specified in the source · Date not specified')
        for slug,entries in load_glossary(ROOT,load_anthology(ROOT)).items():
            for i,entry in enumerate(entries):
                for field in ('label','explanation','source','edition'):
                    self.assertTrue(data['en'][f'anthology.note.{slug}.{i}.{field}'])

if __name__=='__main__':unittest.main()
