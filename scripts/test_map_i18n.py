"""Focused bilingual map builder checks; outputs exist only in temporary folders."""
from copy import deepcopy
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest

from map_pages import build_map, load_display_metadata, read_document

ROOT=Path(__file__).resolve().parent.parent

class MapI18nTests(unittest.TestCase):
    def setUp(self):
        self.data=read_document(ROOT/'map/catalog.json')
        self.temp=TemporaryDirectory(prefix='map-i18n-')
        self.addCleanup(self.temp.cleanup)
        self.output=Path(self.temp.name)

    def build(self,language='zh-CN',data=None,preview=False):
        report=build_map(ROOT,self.output,'https://example.test',data or self.data,preview=preview,language=language)
        return report,(self.output/report['route']/'index.html').read_text(encoding='utf-8')

    def test_legacy_default_and_english_routes_share_original_payload(self):
        original=deepcopy(self.data)
        for language,route in [('zh-CN','map'),('en','en/map')]:
            report,page=self.build(language)
            self.assertEqual(report['route'],route)
            payload=json.loads(re.search(r'<script id="footprints-data"[^>]*>(.*?)</script>',page,re.S)[1])
            self.assertEqual(payload['records'],original['records'])
            self.assertEqual(payload['title'],original['title'])
        self.assertEqual(self.data,original)

    def test_english_initial_html_accessibility_and_metadata(self):
        _,page=self.build('en')
        self.assertIn('<html lang="en"',page)
        self.assertIn('https://example.test/en/map/',page)
        self.assertIn('My Footprints · Xie Yuqing',page)
        self.assertIn('aria-label="Close editor without saving"',page)
        self.assertIn('placeholder="For example: My student years in Beijing"',page)
        self.assertIn('id="map-svg-title" data-i18n="map.html.svgtitle">City footprints map</title>',page)
        self.assertIn('href="/assets/map-example.en.md"',page)
        self.assertLess(page.index('/assets/site-i18n.js'),page.index('/assets/map-i18n.js'))
        self.assertLess(page.index('/assets/map-i18n.js'),page.index('/assets/map-model.js'))
        self.assertNotIn('{{',re.sub(r'<script\b[^>]*>.*?</script>','',page,flags=re.S))

    def test_public_display_entries_preserve_facts_and_cover_author_records(self):
        metadata=load_display_metadata(ROOT,self.data)
        self.assertEqual(len(metadata['records']),len(self.data['records']))
        for record in self.data['records']:
            entry=metadata['records'][record['id']]
            self.assertEqual(set(entry['en']),{'city','region','country','title','description'})
            self.assertEqual(entry['source'],{key:record[key] for key in entry['source']})
            self.assertNotIn('start',entry['en']);self.assertNotIn('lat',entry['en'])

    def test_stale_author_display_text_fails_instead_of_using_old_translation(self):
        altered=deepcopy(self.data);altered['records'][0]['description']='Changed source description'
        with self.assertRaisesRegex(ValueError,'Stale'):load_display_metadata(ROOT,altered)

    def test_private_preview_never_embeds_author_display_records(self):
        _,page=self.build('en',preview=True)
        metadata=json.loads(re.search(r'<script id="footprints-display-data"[^>]*>(.*?)</script>',page,re.S)[1])
        self.assertEqual(metadata['records'],{})
        self.assertIn('noindex,nofollow',page)

    def test_unknown_catalog_is_never_translated_by_similar_text(self):
        data=deepcopy(self.data);data['records']=data['records'][:1];data['records'][0]['id']='visitor-like-id'
        metadata=load_display_metadata(ROOT,data)
        self.assertEqual(metadata['records'],{})

    def test_catalogue_parity_and_argument_names(self):
        data=json.loads((ROOT/'home/locales/map.json').read_text(encoding='utf-8'))
        self.assertEqual(set(data['zh-CN']),set(data['en']))
        for key in data['en']:
            self.assertEqual(set(re.findall(r'\{(\w+)\}',data['zh-CN'][key])),set(re.findall(r'\{(\w+)\}',data['en'][key])),key)

    def test_rejects_unknown_language_before_writing(self):
        with self.assertRaises(ValueError):self.build('fr')
        self.assertEqual(list(self.output.iterdir()),[])

if __name__=='__main__':unittest.main()
