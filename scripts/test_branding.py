"""Brand contract: one Chinese wordmark, bilingual home links and native water icon."""
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET
import argparse,json,unittest,re,struct
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
        ids={node.get('id')for node in svg.iter()if node.get('id')}
        for node in svg.iter():
            for key,value in node.attrib.items():
                self.assertNotIn('href',key)
                if 'url(' in value:
                    self.assertRegex(value,r'^url\(#[a-zA-Z][a-zA-Z0-9_-]*\)$');self.assertIn(value[5:-1],ids)
        self.assertIn('#49BDF4',ET.tostring(svg,encoding='unicode'));self.assertIn('#249FDF',ET.tostring(svg,encoding='unicode'))
        self.assertEqual(ids, {'sky-top', 'sky-left', 'sky-bottom'})
        self.assertIn('清环', svg.find('{http://www.w3.org/2000/svg}title').text)
        self.assertEqual((ROOT/'home/assets/favicon-cat.svg').read_text(encoding='utf8').count('Yuliao Cat'),1)
        self.assertTrue((ROOT/'home/assets/favicon-monogram.svg').is_file())

    def test_png_and_ico_retain_transparent_center_and_sky_gradients(self):
        from PIL import Image
        png=Image.open(ROOT/'home/assets/favicon.png').convert('RGBA')
        self.assertEqual(png.size,(256,256));self.assertEqual(png.getpixel((128,128))[3],0);self.assertEqual(png.getpixel((0,0))[3],0)
        ico=Image.open(ROOT/'home/assets/favicon.ico');self.addCleanup(ico.close)
        self.assertEqual(ico.ico.sizes(),{(16,16),(32,32),(48,48)})
        for size in (16,32,48):
            frame=ico.ico.getimage((size,size)).convert('RGBA')
            self.assertEqual(frame.getpixel((size//2,size//2))[3],0)
            self.assertGreater(len(set(frame.get_flattened_data())),20)

    def test_ico_fallback_contains_real_pngs_at_small_sizes(self):
        data=(ROOT/'home/assets/favicon.ico').read_bytes();self.assertEqual(struct.unpack_from('<HHH',data),(0,1,3))
        for index,size in enumerate((16,32,48)):
            width,height,_,_,planes,bits,length,offset=struct.unpack_from('<BBBBHHII',data,6+16*index)
            self.assertEqual((width,height,planes,bits),(size,size,1,32));self.assertEqual(data[offset:offset+8],b'\x89PNG\r\n\x1a\n');self.assertLessEqual(offset+length,len(data))
    def test_every_live_template_uses_the_water_version_and_local_fallback(self):
        for source in sorted((ROOT/'home').rglob('*.template.html')):
            text=source.read_text(encoding='utf8')
            if 'favicon.svg'not in text:continue
            self.assertIn('/assets/favicon.svg?v=qinghuan-1',text);self.assertIn('/assets/favicon.ico?v=qinghuan-1',text);self.assertNotIn('yuliao-cat-1',text)

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
