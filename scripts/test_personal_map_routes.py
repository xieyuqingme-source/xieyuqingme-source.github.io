"""Author/maker separation and verified public-photo associations."""
from copy import deepcopy
from html.parser import HTMLParser
import json,re,unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from map_pages import build_map, public_photo_gallery, public_video_preview, remove_retired_map_video, ASSETS
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
    def test_retired_excerpt_has_no_markup_or_published_assets(self):
        self.assertEqual(public_video_preview(ROOT,self.source),'')
        self.assertNotIn('map-author-malaysia.mp4',ASSETS)
        self.assertNotIn('map-author-malaysia.jpg',ASSETS)
        assets=self.out/'assets';assets.mkdir()
        for name in ['map-author-malaysia.mp4','map-author-malaysia.jpg','keep-other.mp4']:
            (assets/name).write_bytes(b'old generated fixture')
        remove_retired_map_video(self.out)
        self.assertEqual([item.name for item in assets.iterdir()],['keep-other.mp4'])
        for name in ['map-author-malaysia.mp4','map-author-malaysia.jpg']:
            self.assertTrue((ROOT/'home/assets'/name).is_file(),'Historical source media is unchanged')

    def test_public_downloads_are_maker_only_and_tool_starts_with_explicit_preview(self):
        for language in ['zh-CN','en']:
            public_report=build_map(ROOT,self.out,'https://example.test',self.source,language=language)
            author=(self.out/public_report['route']/'index.html').read_text(encoding='utf-8')
            self.assertNotIn('author-video',author)
            self.assertNotIn('map-author-malaysia',author)
            self.assertIn('data-maker-only id="map-download-image"',author)
            self.assertIn('data-maker-only id="video-options"',author)
            tool_report=build_map(ROOT,self.out,'https://example.test',self.source,language=language,maker=True)
            tool=(self.out/tool_report['route']/'index.html').read_text(encoding='utf-8')
            self.assertIn('id="map-maker-toggle"',tool)
            self.assertIn('aria-pressed="false"',tool)
            self.assertIn('data-maker-state="preview"',tool)
            self.assertNotIn('id="mode-mine"',tool)
            main=tool.split('<main',1)[1].split('</main>',1)[0]
            self.assertNotIn('href="'+('/en/map/' if language=='en' else '/map/')+'"',main)
            mode=re.search(r'<div class="map-mode">(.*?)</div>',main,re.S)[1]
            self.assertNotIn('谢雨卿的足迹',mode)
            self.assertNotIn('Xie Yuqing’s footprints',mode)
            self.assertIn('href="'+('/en/game/' if language=='en' else '/game/')+'"',main)
            self.assertEqual(self.payload(tool)['records'],[])

    def test_retired_media_cleanup_refuses_links_and_directories(self):
        from unittest.mock import patch
        target=self.out/'assets/map-author-malaysia.mp4';target.parent.mkdir();target.mkdir()
        with self.assertRaises(ValueError):remove_retired_map_video(self.out)
        target.rmdir()
        with patch.object(Path,'is_symlink',return_value=True),self.assertRaises(ValueError):
            remove_retired_map_video(self.out)

    def test_three_menu_buttons_keep_section_destinations_and_bilingual_brand(self):
        page=localize_page((ROOT/'home/map.template.html').read_text(encoding='utf-8'),ROOT,'https://example.test','/map/','en',modules=('map',))
        header=page.split('<header',1)[1].split('</header>',1)[0]
        self.assertEqual(header.count('class="nav-item'),4)
        self.assertEqual(header.count('class="nav-group'),3)
        for route in ['/articles/','/anthology/','/projects/','/photos/','/map/','/about/','/game/']:
            self.assertIn('href="/en'+route+'"',header)
        self.assertIn('Xie Yuqing · Carl',header)
        self.assertEqual(header.count('<summary class="nav-entry"'),3)
        self.assertIn('data-nav-group="map"',header)
        self.assertIn('class="header-tools"',header)
if __name__=='__main__':unittest.main()
