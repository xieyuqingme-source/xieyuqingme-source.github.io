"""Author/maker separation and verified public-photo associations."""
from copy import deepcopy
from html.parser import HTMLParser
import json,re,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from map_pages import build_map, public_photo_gallery, public_video_preview
from site_i18n import localize_page
ROOT=Path(__file__).resolve().parent.parent
class PersonalMapTests(unittest.TestCase):
    def setUp(self):
        self.source=json.loads((ROOT/'map/catalog.json').read_text(encoding='utf-8'))
        self.temp=TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.out=Path(self.temp.name)
    def payload(self,page):return json.loads(re.search(r'<script id="footprints-data"[^>]*>(.*?)</script>',page,re.S)[1])
    def test_author_records_are_exact_and_maker_never_embeds_them_in_either_language(self):
        before=deepcopy(self.source)
        for lang in ['zh-CN','en']:
            author=build_map(ROOT,self.out,'https://example.test',self.source,language=lang)
            public=(self.out/author['route']/'index.html').read_text(encoding='utf-8')
            maker=build_map(ROOT,self.out,'https://example.test',self.source,language=lang,maker=True)
            tool=(self.out/maker['route']/'index.html').read_text(encoding='utf-8')
            self.assertEqual(self.payload(public)['records'],before['records'])
            self.assertEqual(self.payload(tool)['records'],[])
            self.assertIn('data-map-scope="public"',public)
            self.assertIn('data-map-scope="maker"',tool)
            self.assertEqual(maker['route'],'en/game/footprints' if lang=='en' else 'game/footprints')
            self.assertNotIn('class="map-photo-grid"',tool)
        self.assertEqual(self.source,before)
    def test_photos_are_related_by_known_city_without_claiming_an_event(self):
        gallery=public_photo_gallery(ROOT,self.source)
        self.assertEqual(gallery.count('<figure '),12)
        self.assertEqual(gallery.count('data-city="北京"'),8)
        self.assertEqual(gallery.count('data-city="吉隆坡"'),4)
        self.assertNotIn('data-record-id',gallery)
        empty=deepcopy(self.source);empty['records']=[]
        self.assertEqual(public_photo_gallery(ROOT,empty),'')
        changed=deepcopy(self.source)
        for record in changed['records']:record['city']='unrelated-city'
        self.assertEqual(public_photo_gallery(ROOT,changed),'')
    def test_video_is_provenanced_and_hidden_when_its_source_changes(self):
        self.assertIn('map-author-malaysia.mp4',public_video_preview(ROOT,self.source))
        changed=deepcopy(self.source);changed['records'][-1]['description']='Changed original'
        self.assertEqual(public_video_preview(ROOT,changed),'')
    def test_five_direct_sections_keep_legacy_destinations_and_readable_single_language_brand(self):
        page=localize_page((ROOT/'home/map.template.html').read_text(encoding='utf-8'),ROOT,'https://example.test','/map/','en',modules=('map',))
        header=page.split('<header',1)[1].split('</header>',1)[0]
        self.assertEqual(header.count('class="nav-item'),5)
        self.assertEqual(header.count('class="nav-group'),3)
        for route in ['/articles/','/anthology/','/projects/','/photos/','/map/','/about/','/game/','/game/ranking/','/game/footprints/']:
            self.assertIn('href="/en'+route+'"',header)
        self.assertNotIn('Xie Yuqing · Carl',header)
        self.assertIn('class="header-tools"',header)
if __name__=='__main__':unittest.main()
