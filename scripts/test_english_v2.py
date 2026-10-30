"""Reader-facing learning checks, without network access or private materials."""
from pathlib import Path
import inspect
import json
import re
import unittest

from english_corner import load_english_corner, load_intro, render_card, render_index, render_play, render_quote_library, render_word_map, word_map_data, render_numbers
from daily_brief import load_english_quotes, validate_english_quote_display
from site_i18n import NAV_GROUPS, FOOTER_LINKS
from site_i18n import version_shared_assets
from hashlib import sha256

ROOT = Path(__file__).resolve().parent.parent


class LearningReaderTests(unittest.TestCase):
    def test_shared_annotation_and_anthology_scripts_receive_source_cache_versions(self):
        names=['anthology.js','anthology-selection.js','reading-annotations.js','reading-annotations.css','english-speech.js','ranking-model.js','ranking-storage.js','ranking-export.js','ranking-images.js','ranking-view.js','ranking.js']
        html=''.join('<script src="/assets/'+name+'"></script>' for name in names)
        versioned=version_shared_assets(html,ROOT)
        for name in names:
            self.assertIn('/assets/'+name+'?v='+sha256((ROOT/'home/assets'/name).read_bytes()).hexdigest()[:12],versioned)

    def test_classic_annotations_and_optional_speech_preserve_reviewed_words(self):
        corner=load_english_corner(ROOT)
        for card in corner['cards']:
            with self.subTest(slug=card['slug']):
                html=render_card(card,corner)
                if card['column']=='classics':
                    self.assertEqual(html.count('data-reading-note-index='),len(corner['notes'][card['slug']]))
                    self.assertIn('<details class="ec-vocabulary">',html)
                    self.assertIn('data-reading-annotations',html)
                    self.assertIn('data-reading-area',html)
                    self.assertIn('data-speech-target="english-classic-text"',html)
                    self.assertIn('data-reading-note-popup role="dialog"',html)
                elif card['column']=='words':
                    self.assertIn('data-speech-text="'+card['headword']+'"',html)
                else:self.assertNotIn('data-english-speech',html)
        quotes=self.reviewed()[1]
        html=render_quote_library(quotes)
        self.assertEqual(html.count(' data-english-speech '),len(quotes['quotes']))
        self.assertEqual(html.count('data-english-speech-note'),1)

    def test_number_practice_has_no_script_fallback_and_native_controls(self):
        html=render_numbers()
        self.assertIn('data-number-practice hidden',html)
        self.assertIn('data-number-practice-answer type="text"',html)
        self.assertIn('data-number-practice-feedback role="status" aria-live="polite"',html)
        self.assertLess(html.index('data-number-practice hidden'),html.index('先记住这几个台阶'))
        self.assertIn('转换需要 JavaScript',html)
        self.assertNotIn('<form',html)

    def test_map_uses_each_reviewed_journey_without_inventing_stations_or_dates(self):
        corner=load_english_corner(ROOT)
        expected=[c for c in corner['cards'] if c.get('journey')]
        data=word_map_data(corner)
        self.assertEqual([w['slug'] for w in data['words']],[c['slug'] for c in expected])
        for word,card in zip(data['words'],expected):
            self.assertEqual(word['journey'],card['journey'])
            self.assertEqual(word['summary'],card['summary'])
            self.assertTrue(all(s['approximate'] is True for s in word['journey']))
        self.assertEqual(len(next(w for w in data['words'] if w['slug']=='long-time-no-see')['journey']),1)
        html=render_word_map(corner)
        self.assertIn('data-word-map-fallback',html)
        self.assertIn('不能据此推断真实旅行',html)
        payload=json.loads(re.search(r'id="english-word-map-data">(.*?)</script>',html,re.S).group(1))
        self.assertEqual(payload,data)
        for word in data['words']:
            self.assertIn('href="'+word['reading']+'"',html)

    def reviewed(self):
        corner=load_english_corner(ROOT)
        quotes=load_english_quotes(ROOT,{"/english/"+card["slug"]+"/" for card in corner["cards"]})
        return corner,quotes

    def test_library_renders_the_shared_pool_with_stable_permalinks_and_lines(self):
        corner,quotes=self.reviewed()
        html=render_quote_library(quotes)
        self.assertEqual(set(re.findall(r'id="quote-([a-z0-9-]+)"',html)),{q['id'] for q in quotes['quotes']})
        self.assertEqual(html.count('data-english-quote-row'),len(quotes['quotes']))
        self.assertIn('data-english-quote-filters hidden',html)
        self.assertGreaterEqual(html.count('<br>'),sum(q['text'].count('\n')+q['translation'].count('\n') for q in quotes['quotes']))
        self.assertTrue(all('id="quote-'+q['id']+'"' in html for q in quotes['quotes']))

    def test_quiz_embeds_derived_pools_and_has_no_script_reading_fallback(self):
        corner,quotes=self.reviewed()
        html=render_play(corner,quotes)
        payload=re.search(r'id="english-quiz-data">(.*?)</script>',html,re.S).group(1)
        pools=json.loads(payload)
        self.assertEqual(len(pools['authors']),len(quotes['quotes']))
        self.assertTrue(all(len(pools[mode])>=10 for mode in ['authors','etymology','origins']))
        self.assertIn('<noscript>',html)
        self.assertIn('data-quiz-feedback tabindex="-1" aria-live="polite"',html)
        self.assertIn('data-quiz-restart hidden>再来一轮</button>',html)
        self.assertIn('data-quiz-change-mode hidden>换一种玩法</button>',html)
        self.assertIn('<p data-quiz-error role="status" hidden>',html)

    def test_intro_is_data_and_matches_the_requested_copy(self):
        intro = load_intro(ROOT)
        self.assertEqual(intro["name"], "学英语")
        self.assertEqual(intro["english_name"], "Learn English")
        self.assertEqual(intro["intro"], "英语好啊，英语得学，我也想学英语。")
        self.assertNotIn(intro["intro"], inspect.getsource(render_index))
        self.assertIn(intro["intro"], render_index(load_english_corner(ROOT)))

    def test_difficulty_names_follow_familiar_english_exams(self):
        from english_corner import LEVELS
        self.assertEqual(LEVELS, {1: "高考", 2: "四六级", 3: "雅思"})
        corner = load_english_corner(ROOT)
        html = render_index(corner)
        for label in LEVELS.values():
            self.assertIn(f'aria-pressed="false">{label}</button>', html)
        for retired in ("入门", "进阶", "挑战"):
            self.assertNotIn(f'>{retired}</button>', html)
        card = corner["cards"][0]
        visible = re.sub(r'<[^>]+>', '', render_card(card, corner))
        self.assertIn(" · " + LEVELS[card["level"]] + " · ", visible)

    def test_works_menu_owns_the_learning_entrance(self):
        self.assertEqual(len(NAV_GROUPS), 4)
        self.assertFalse(any(group[0] in ("/english/", "/marx/") for group in NAV_GROUPS))
        projects = next(group for group in NAV_GROUPS if group[0] == "/projects/")
        self.assertEqual(projects[2], [("/today/", "today"), ("/world/", "world"), ("/english/", "english"), ("/marx/", "marx"),
                                       ("/projects/", "aiApps"), ("/game/", "games")])
        self.assertEqual(projects[3], ["/today/", "/world/", "/english/", "/marx/", "/projects/", "/game/"])
        self.assertEqual([(path, key) for path, key in FOOTER_LINKS
                          if path in ("/english/", "/marx/")],
                         [("/english/", "english"), ("/marx/", "marx")])

    def test_cards_explain_subjects_without_internal_or_author_copy(self):
        corner = load_english_corner(ROOT)
        forbidden = r"中国钩子|本站编写|英语专业|补课|站长|谢雨卿|我的文章|本轮修改|第一版卡片"
        for card in corner["cards"]:
            with self.subTest(card=card["slug"]):
                prose = card["title"] + card["summary"] + " ".join(card["tags"]) + card["body"]
                self.assertIsNone(re.search(forbidden, prose))
                html = render_card(card, corner)
                self.assertNotIn("中国钩子", html)
                self.assertEqual(html.count("例句为编写的示例。"), int("可以这样用" in card["sections"] or card["column"] == "mistakes"))
                if card["column"] == "classics":
                    # Source checking dates stay available, without cluttering the reading table.
                    self.assertIn('title="核对于', html)
                    self.assertNotRegex(html, r"<small> · 20\d\d-\d\d-\d\d</small>")

    def test_display_boundaries_and_poetry_are_checked(self):
        for text in ["A complete sentence.", "…a bounded excerpt…", "“A quotation.”", "First line,\nSecond line."]:
            validate_english_quote_display(text)
        for text in ["an unexplained fragment.", "A dangling clause,", " A sentence.", "A\n\nB.", "A\nB\nC\nD\nE."]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                validate_english_quote_display(text)
        quotes = load_english_quotes(ROOT, {"/english/" + card["slug"] + "/" for card in load_english_corner(ROOT)["cards"]})["quotes"]
        self.assertGreaterEqual(len(quotes), 200)
        self.assertGreaterEqual(sum("\n" in quote["text"] for quote in quotes), 15)
        self.assertTrue(all(not re.search(r"分句|节选|台词中的", quote["locator_zh"]) for quote in quotes))


if __name__ == "__main__":
    unittest.main()
