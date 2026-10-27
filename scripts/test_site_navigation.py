"""Regression checks for generated scoped scripts and safe publication paths."""
from pathlib import Path
import tempfile,unittest
import subprocess
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

    def test_lazy_home_scripts_are_scoped_and_late_responses_check_the_page_token(self):
        from site_navigation import original_page_script
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'assets/vendor').mkdir(parents=True)
            originals = {'assets/vendor/lunar-1.7.7.js': 'window.Lunar={};',
                         'assets/vendor/d3-7.9.0.min.js': 'window.d3={};',
                         'assets/home-earth.js': 'window.HomeEarth={};'}
            for name, source in originals.items():
                (root / name).write_text(source, encoding='utf-8')
            (root / 'index.html').write_text('<section data-lunar-src="/assets/vendor/lunar-1.7.7.js?v=one" '
                'data-d3-src="/assets/vendor/d3-7.9.0.min.js?v=two" data-earth-src="/assets/home-earth.js?v=three"></section>', encoding='utf-8')
            self.assertEqual(wrap_page_scripts(root)['page_scripts'], 3)
            for name, source in originals.items():
                wrapped = (root / name).read_text(encoding='utf-8')
                self.assertIn('document?.currentScript?.dataset?.homeScope', wrapped)
                self.assertIn('window.HomeBriefPageId', wrapped)
                self.assertEqual(original_page_script(wrapped), source)
            before = {name: (root / name).read_bytes() for name in originals}
            wrap_page_scripts(root)
            self.assertEqual(before, {name: (root / name).read_bytes() for name in originals})

    def test_wrapped_commonjs_entry_can_be_required_without_a_document(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'assets').mkdir()
            entry = root / 'assets/model.js'
            entry.write_text('module.exports={value:7};', encoding='utf-8')
            (root / 'index.html').write_text('<script src="/assets/model.js"></script>', encoding='utf-8')
            wrap_page_scripts(root)
            result = subprocess.run(['node', '-e',
                'const model=require(process.argv[1]);if(model.value!==7)throw Error("CommonJS export lost");',
                str(entry)], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_lazy_script_reference_cannot_escape_publication_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'index.html').write_text('<section data-earth-src="/../outside.js"></section>', encoding='utf-8')
            with self.assertRaises(ValueError):
                wrap_page_scripts(root)





class VersionedNavigation(unittest.TestCase):
    def test_cache_query_is_stripped_for_files_but_persistent_music_is_not_wrapped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'assets').mkdir();(root/'assets/page.js').write_text('window.Sample=1;',encoding='utf8');(root/'assets/site-music.js').write_text('window.SiteMusic={};',encoding='utf8')
            (root/'index.html').write_text('<script src="/assets/page.js?v=source123"></script><script src="/assets/site-music.js?v=audio456"></script>',encoding='utf8')
            self.assertEqual(wrap_page_scripts(root)['page_scripts'],1);self.assertIn('site-page-scope:v1',(root/'assets/page.js').read_text());self.assertEqual((root/'assets/site-music.js').read_text(),'window.SiteMusic={};')

if __name__=='__main__':unittest.main()
