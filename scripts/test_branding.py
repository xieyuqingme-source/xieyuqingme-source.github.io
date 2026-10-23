"""Brand contract: one Chinese wordmark, bilingual home links and native cat icon."""
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET
import argparse,json,unittest
from build_blog import Blog

ROOT=Path(__file__).resolve().parent.parent
class Brand(HTMLParser):
    def __init__(self,text):
        super().__init__();self.links=[];self.active=None;self.icons=[];self.feed(text)
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='a' and 'brand' in attrs.get('class','').split():
            self.active={'attrs':attrs,'text':[]};self.links.append(self.active)
        elif self.active is not None and (tag in {'img','svg'} or 'brand-mark' in attrs.get('class','').split()):self.icons.append(tag)
    def handle_data(self,text):
        if self.active is not None:self.active['text'].append(text)
    def handle_endtag(self,tag):
        if tag=='a':self.active=None

def check_brand(test,text,href=None):
    value=Brand(text);test.assertEqual(len(value.links),1);test.assertEqual(value.icons,[])
    link=value.links[0];name=' '.join(' '.join(link['text']).split())
    test.assertEqual(name,'谢雨卿 Xie Yuqing · Carl');test.assertEqual(name.count('谢雨卿'),1)
    test.assertTrue(link['attrs'].get('aria-label'))
    if href:test.assertEqual(link['attrs'].get('href'),href)
    return link

class BrandingTests(unittest.TestCase):
    def test_all_live_home_feature_templates_have_one_wordmark_and_correct_home(self):
        sources=sorted((ROOT/'home').glob('*.template.html'))+sorted((ROOT/'home/en').glob('*.template.html'))
        count=0
        for source in sources:
            text=source.read_text(encoding='utf8')
            if 'class="brand"' not in text:continue
            with self.subTest(source=source.name,parent=source.parent.name):
                check_brand(self,text,'/en/' if source.parent.name=='en' else '/');count+=1
        self.assertGreaterEqual(count,11)
    def test_blog_generated_chinese_and_english_brand_stays_chinese(self):
        blog=Blog('https://example.test/articles')
        for language,href in [('zh-CN','/'),('en','/en/')]:
            with self.subTest(language=language):check_brand(self,blog.document('Fixture','<p>Body</p>','fixture.html',language),href)
    def test_live_language_catalogues_keep_the_same_brand(self):
        catalog=json.loads((ROOT/'home/locales/common.json').read_text(encoding='utf8'))
        self.assertEqual(catalog['zh-CN']['common.brandName'],'谢雨卿');self.assertEqual(catalog['en']['common.brandName'],'谢雨卿')
    def test_favicon_is_local_vector_without_visible_text_or_external_resources(self):
        svg=ET.fromstring((ROOT/'home/assets/favicon.svg').read_text(encoding='utf8'))
        self.assertEqual(svg.get('viewBox'),'0 0 64 64')
        tags={node.tag.rsplit('}',1)[-1] for node in svg.iter()}
        self.assertFalse(tags & {'text','image','foreignObject','script','use'})
        for node in svg.iter():
            self.assertFalse(any('href' in key or 'url(' in value for key,value in node.attrib.items()))
        self.assertIn('#204535',ET.tostring(svg,encoding='unicode'));self.assertIn('#f7f5ee',ET.tostring(svg,encoding='unicode'))
        self.assertTrue((ROOT/'home/assets/favicon-monogram.svg').is_file())

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path);args,remaining=parser.parse_known_args()
    if args.site:
        case=unittest.TestCase();count=0
        for page in args.site.rglob('*.html'):
            text=page.read_text(encoding='utf8')
            if 'class="brand"' in text:check_brand(case,text);count+=1
        case.assertGreater(count,200)
        case.assertEqual((args.site/'assets/favicon.svg').read_bytes(),(ROOT/'home/assets/favicon.svg').read_bytes())
        print(json.dumps({'branded_pages_checked':count,'favicon_matches_source':True}))
    else:unittest.main(argv=[__file__]+remaining)
