"""Regression checks for generated scoped scripts and safe publication paths."""
from pathlib import Path
import tempfile,unittest
from site_navigation import wrap_page_scripts

class NavigationBuild(unittest.TestCase):
    def test_only_page_scripts_are_scoped_once_and_exports_remain_entry_local(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'assets').mkdir();(root/'articles/assets').mkdir(parents=True)
            page=root/'assets/page.js';page.write_text('window.Sample={value:1};',encoding='utf-8')
            music=root/'assets/site-music.js';music.write_text('window.SiteMusic={};',encoding='utf-8')
            comments=root/'articles/assets/waline-integration.js';comments.write_text('export function stablePath(){return 1;}\nvoid stablePath();',encoding='utf-8')
            (root/'index.html').write_text('<script src="/assets/site-music.js"></script><script src="/assets/page.js"></script><script type="module" src="/articles/assets/waline-integration.js"></script>',encoding='utf-8')
            self.assertEqual(wrap_page_scripts(root)['page_scripts'],2)
            first=page.read_bytes();wrap_page_scripts(root);self.assertEqual(page.read_bytes(),first)
            self.assertEqual(music.read_text(),'window.SiteMusic={};')
            self.assertIn('SiteNavigation.environment()',page.read_text())
            self.assertNotIn('export function',comments.read_text())
    def test_page_script_cannot_escape_publication_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'index.html').write_text('<script src="/../outside.js"></script>',encoding='utf-8')
            with self.assertRaises(ValueError):wrap_page_scripts(root)




class VersionedNavigation(unittest.TestCase):
    def test_cache_query_is_stripped_for_files_but_persistent_music_is_not_wrapped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'assets').mkdir();(root/'assets/page.js').write_text('window.Sample=1;',encoding='utf8');(root/'assets/site-music.js').write_text('window.SiteMusic={};',encoding='utf8')
            (root/'index.html').write_text('<script src="/assets/page.js?v=source123"></script><script src="/assets/site-music.js?v=audio456"></script>',encoding='utf8')
            self.assertEqual(wrap_page_scripts(root)['page_scripts'],1);self.assertIn('site-page-scope:v1',(root/'assets/page.js').read_text());self.assertEqual((root/'assets/site-music.js').read_text(),'window.SiteMusic={};')

if __name__=='__main__':unittest.main()
