"""Offline third-edition directory correspondence and content-boundary checks."""
from copy import deepcopy
from pathlib import Path
import json
import unittest

from marx_engels import (load_marx_engels, prose_characters, validate_capital,
                        validate_catalog)
from marx_checks import part_chapters, validate_part_links, validate_part_metadata


ROOT = Path(__file__).resolve().parent.parent


class ThirdEditionPartsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_marx_engels(ROOT)
        cls.parts = [item for item in cls.data['items'].values() if item['kind'] == 'parts']
        cls.bodies = {slug: item['body'] for slug, item in cls.data['items'].items()}

    def validate(self, catalog, bodies=None):
        return validate_catalog(catalog, self.bodies if bodies is None else bodies,
                                self.data['citations'], self.data['works'], self.data['chapters'])

    def test_all_ten_parts_and_eight_third_volume_chapters_are_published(self):
        expected = {(2, part) for part in range(1, 4)} | {(3, part) for part in range(1, 8)}
        self.assertEqual({(item['volume'], item['part']) for item in self.parts}, expected)
        self.assertEqual(len(self.parts), 10)
        self.assertTrue(all(item['status'] == 'published' and item['ai_assisted'] for item in self.parts))
        for item in self.parts:
            self.assertEqual(item['route'], f'/marx/capital/{item["volume"]}/part{item["part"]}/')
        guides = [item for item in self.data['items'].values() if item['kind'] == 'guides' and item['volume'] == 3]
        self.assertEqual({item['chapter'] for item in guides}, {9, 13, 14, 15, 23, 25, 27, 48})
        self.assertEqual(len(guides), 8)
        self.assertTrue(all(item['status'] == 'published' for item in guides))

    def test_chapter_notes_cover_the_real_seventy_three_chapters_and_enter_the_prose_count(self):
        seen = set()
        for item in self.parts:
            chapters = part_chapters(self.data['chapters'], item['volume'], item['part'])
            self.assertEqual([note['no'] for note in item['chapter_notes']], [chapter['no'] for chapter in chapters])
            for chapter in chapters:
                key = (item['volume'], chapter['no'])
                self.assertNotIn(key, seen)
                seen.add(key)
                self.assertEqual(chapter['part_no'], item['part'])
                self.assertEqual(chapter['part_guide'], item['slug'])
            notes = sum(prose_characters(note['text']) for note in item['chapter_notes'])
            self.assertEqual(item['prose_characters'], prose_characters(item['body']) + notes)
            self.assertTrue(700 <= item['prose_characters'] <= 1300)
        self.assertEqual(seen, {(2, chapter) for chapter in range(1, 22)} | {(3, chapter) for chapter in range(1, 53)})

    def test_directory_projection_does_not_mutate_original_chapter_data(self):
        capital = json.loads((ROOT / 'marx-engels/capital.json').read_text(encoding='utf-8'))
        original = deepcopy(capital)
        chapters = validate_capital(capital, self.data['works'])
        self.assertEqual(capital, original)
        self.assertEqual(len(chapters), 98)
        self.assertEqual([row['no'] for row in part_chapters(chapters, 2, 1)], list(range(1, 7)))
        for volume in capital['volumes']:
            for part in volume['parts']:
                for chapter in part['chapters']:
                    self.assertNotIn('part_no', chapter)
                    self.assertNotIn('part_guide', chapter)

    def test_notes_cannot_skip_reorder_duplicate_or_replace_original_chapter_sources(self):
        for mutation in ('missing', 'reverse', 'duplicate', 'other-part', 'boolean', 'unknown-source', 'private-path'):
            item = deepcopy(self.parts[0])
            notes = item['chapter_notes']
            if mutation == 'missing': notes.pop()
            if mutation == 'reverse': notes.reverse()
            if mutation == 'duplicate': notes[0]['no'] = notes[1]['no']
            if mutation == 'other-part': notes[0]['no'] = 21
            if mutation == 'boolean': notes[0]['no'] = True
            if mutation == 'unknown-source': notes[0]['url'] = 'https://example.org/replacement'
            if mutation == 'private-path': notes[0]['text'] = 'C:\\Users\\private'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_part_metadata(item, self.data['chapters'])

    def test_nonexistent_parts_and_unregistered_identifiers_fail(self):
        for field, value in [('volume', True), ('volume', 1), ('part', True), ('part', 4), ('slug', 'unregistered-part')]:
            item = deepcopy(self.parts[0])
            item[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_part_metadata(item, self.data['chapters'])
        for mutation in ('missing', 'not-a-list', 'unknown-field'):
            catalog = deepcopy(self.data['catalog'])
            if mutation == 'missing': catalog.pop('parts')
            if mutation == 'not-a-list': catalog['parts'] = {}
            if mutation == 'unknown-field': catalog['parts'][0]['internal_note'] = 'editor only'
            with self.subTest(catalog=mutation), self.assertRaises(ValueError): self.validate(catalog)

    def test_part_directory_links_are_registered_in_both_directions(self):
        validate_part_links(self.data['items'], self.data['chapters'])
        items = dict(self.data['items'])
        items.pop(self.parts[0]['slug'])
        with self.assertRaisesRegex(ValueError, '双向登记'):
            validate_part_links(items, self.data['chapters'])
        chapters = deepcopy(self.data['chapters'])
        selected = self.parts[0]
        for chapter in part_chapters(chapters, selected['volume'], selected['part']):
            chapter['part_guide'] = 'missing-part-guide'
        with self.assertRaisesRegex(ValueError, '双向登记'):
            validate_part_links(self.data['items'], chapters)

    def test_notes_cannot_hide_unregistered_quotations_or_exceed_the_total_word_limit(self):
        catalog = deepcopy(self.data['catalog'])
        catalog['parts'][0]['chapter_notes'][0]['text'] = '“这是一句没有登记引文来源的长原著文字。”'
        with self.assertRaisesRegex(ValueError, '长引号文字不属于所引原文'):
            self.validate(catalog)
        catalog = deepcopy(self.data['catalog'])
        for note in catalog['parts'][0]['chapter_notes']:
            note['text'] = '读' * 220
        with self.assertRaisesRegex(ValueError, '正文汉字数'):
            self.validate(catalog)


class ThirdEditionTruthQuizTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_marx_engels(ROOT)
        cls.questions = cls.data['v2']['questions']

    def test_the_full_deck_has_five_verdicts_and_follow_up_for_every_card(self):
        from collections import Counter
        from marx_engels import VERDICTS
        from marx_checks import validate_truth_quiz
        validate_truth_quiz(self.questions, self.data)
        self.assertGreaterEqual(len(self.questions), 32)
        self.assertEqual(len({question['id'] for question in self.questions}), len(self.questions))
        answers = Counter(question['answer'] for question in self.questions)
        self.assertEqual(set(answers), set(VERDICTS))
        self.assertGreaterEqual(sum(answers[value] for value in ('存疑', '部分正确', '张冠李戴')), 8)
        coverage = Counter(question['card'] for question in self.questions)
        myths = [item for item in self.data['items'].values() if item['category'] == 'myths' and item['status'] == 'published']
        self.assertGreaterEqual(len(myths), 14)
        self.assertTrue(all(coverage[item['slug']] >= 2 for item in myths))

    def test_a_thirty_one_question_deck_cannot_open(self):
        from marx_checks import validate_truth_quiz
        for questions in ([], self.questions[:31]):
            with self.subTest(count=len(questions)), self.assertRaisesRegex(ValueError, '至少32题'):
                validate_truth_quiz(questions, self.data)

    def test_each_verdict_is_required_and_seven_nonbinary_questions_are_not_enough(self):
        from collections import Counter
        from marx_checks import validate_truth_quiz
        questions = deepcopy(self.questions)
        for question in questions:
            if question['answer'] == '存疑': question['answer'] = '真'
        with self.assertRaisesRegex(ValueError, '五种判定'): validate_truth_quiz(questions, self.data)
        questions = deepcopy(self.questions)
        answers = Counter(question['answer'] for question in questions)
        total = sum(answers[value] for value in ('存疑', '部分正确', '张冠李戴'))
        for question in questions:
            answer = question['answer']
            if total > 7 and answer in ('存疑', '部分正确', '张冠李戴') and answers[answer] > 1:
                question['answer'] = '真'; answers[answer] -= 1; total -= 1
        self.assertEqual(total, 7)
        with self.assertRaisesRegex(ValueError, '至少8题'): validate_truth_quiz(questions, self.data)

    def test_one_question_cannot_stand_in_for_a_new_card(self):
        from marx_checks import validate_truth_quiz
        questions = deepcopy(self.questions)
        rows = [question for question in questions if question['card'] == 'senior-last-hour']
        self.assertEqual(len(rows), 2)
        rows[0]['card'] = 'capital-blood'
        with self.assertRaisesRegex(ValueError, '至少需要2题'): validate_truth_quiz(questions, self.data)

    def test_registered_english_sources_reach_the_pool_and_original_questions_keep_their_sources(self):
        from marx_quiz import build_pools
        from marx_extras import validate_extras
        from marx_checks import validate_question_source
        raw = {name: json.loads((ROOT/'marx-engels'/('topics/china.json' if name == 'china' else name+'.json')).read_text(encoding='utf-8'))
               for name in ('lab', 'quiz', 'quote-works', 'life', 'letters', 'china')}
        validate_extras(raw, self.data)
        pools = {question['id']: question for question in build_pools(self.data)['myth']}
        english = self.data['citations']['c-v2-manifesto-unite']['en']['url']
        overrides = {'v3-slogan-version', 'v3-slogan-translator'}
        self.assertEqual({question['id'] for question in self.questions if 'source' in question}, overrides)
        for question in self.questions:
            card = self.data['items'][question['card']]
            validate_question_source(question, self.data)
            expected = english if question['id'] in overrides else self.data['citations'][card['citations'][0]]['url']
            self.assertEqual(pools[question['id']]['source'], expected)
            self.assertEqual(pools[question['id']]['reading'], card['route'])
            self.assertEqual(pools[question['id']]['quotation'], '')
            self.assertEqual(pools[question['id']]['choices'], ['真', '假', '存疑', '部分正确', '张冠李戴'])

    def test_source_overrides_cannot_use_arbitrary_links_or_private_review_notes(self):
        from marx_checks import validate_question_source
        original = next(question for question in self.questions if question['id'] == 'v3-slogan-version')
        for mutation in ('unbound-mia', 'foreign-host', 'bad-date', 'unknown-field', 'private-locator', 'long-locator'):
            question = deepcopy(original)
            value = question['source']
            if mutation == 'unbound-mia': value['url'] = 'https://www.marxists.org/archive/marx/works/1848/communist-manifesto/ch01.htm'
            if mutation == 'foreign-host': value['url'] = 'https://example.org/english-source'
            if mutation == 'bad-date': value['checked_on'] = '2026-10-32'
            if mutation == 'unknown-field': value['private_note'] = 'editor only'
            if mutation == 'private-locator': value['locator'] = 'C:\\Users\\private'
            if mutation == 'long-locator': value['locator'] = '查' * 1201
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_question_source(question, self.data)

    def test_registered_chinese_citations_and_references_are_allowed_without_opening_other_links(self):
        from marx_checks import validate_question_source
        question = deepcopy(self.questions[0])
        card = self.data['items'][question['card']]
        question['source'] = {'url': self.data['citations'][card['citations'][0]]['url'], 'locator': '已核原文位置', 'checked_on': '2026-10-30'}
        validate_question_source(question, self.data)
        data = deepcopy(self.data)
        reference_url = 'https://www.marxists.org/chinese/marx-engels2/02/01.htm'
        data['items'][question['card']].setdefault('references', []).append({'level': 1, 'label': '测试用的已登记原著', 'url': reference_url, 'checked_on': '2026-10-30'})
        question['source']['url'] = reference_url
        validate_question_source(question, data)


class ShelfTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from marx_engels import load_marx_engels
        cls.data = load_marx_engels(ROOT)
        cls.shelf = [i for i in cls.data['items'].values() if i['category'] == 'shelf']

    def test_eight_literary_cards_have_their_own_column_and_structure(self):
        from marx_engels import HEADINGS
        self.assertGreaterEqual(len(self.shelf), 8)
        self.assertTrue({
            'shelf-timon-gold', 'shelf-faust-horses', 'shelf-dante-road',
            'shelf-robinson-account', 'shelf-rhodes-jump', 'shelf-balzac-realism',
            'shelf-don-quixote-property', 'shelf-achilles-expansion',
        } <= {i['slug'] for i in self.shelf})
        self.assertEqual(self.data['catalog']['columns'][-1]['id'], 'shelf')
        self.assertEqual(HEADINGS['shelf'], ('典故', '马恩怎样用', '可以接着读'))
        for item in self.shelf:
            self.assertTrue(item['ai_assisted'])
            self.assertEqual(item['status'], 'published')
            self.assertGreaterEqual(item['prose_characters'], 300)
            self.assertLessEqual(item['prose_characters'], 1000)

    def test_each_shelf_card_has_primary_text_and_precise_non_duplicated_excerpt(self):
        from marx_render import render_content
        for item in self.shelf:
            self.assertEqual(len(item['citations']), 1)
            citation = self.data['citations'][item['citations'][0]]
            rendered = render_content(self.data, item)
            self.assertIn(citation['url'], rendered)
            self.assertEqual(rendered.count('<blockquote>'), 1)
            self.assertEqual(self.data['budgets']['pages'][item['route']], len(citation['text']))
            self.assertIn('AI 辅助', rendered)

    def test_new_preface_and_letter_lengths_are_conservative_and_budgeted(self):
        for ident, count in (('v01-07', 9882), ('letter-230', 1610)):
            self.assertEqual(self.data['lengths'][ident]['characters'], count)
            budget = self.data['budgets']['works'][ident]
            self.assertGreater(budget['citation_characters'], 0)
            self.assertLessEqual(budget['displayed_characters'], budget['limit'])
        self.assertIn('1892', self.data['lengths']['v01-07']['method'])
        self.assertIn('不冒称全书长度', self.data['lengths']['v01-07']['method'])

    def test_home_exposes_two_readable_shelf_previews_and_a_full_column_link(self):
        from marx_render import render_index, render_directory
        home = render_index(self.data)
        directory = render_directory(self.data)
        self.assertEqual(home.count('data-column="shelf"'), 2)
        self.assertIn('/marx/cards/?column=shelf', home)
        self.assertEqual(directory.count('data-column="shelf"'), len(self.shelf))
        self.assertIn('data-me-column="shelf"', directory)

    def test_reading_cross_links_allow_real_sections_without_allowing_path_escape(self):
        from marx_engels import markdown_sections
        for href in ('/english/franklin-whistle/', '/anthology/dian-lun-lun-wen/', '/marx/commodity/'):
            self.assertIn('可以接着读', markdown_sections('## 可以接着读\n\n[接着读](' + href + ')'))
        for href in ('//example.com/english/', '/english/../private/', '/english/%2e%2e/private/', '/anthology/%5cprivate/', '/unregistered/'):
            with self.subTest(href=href), self.assertRaises(ValueError):
                markdown_sections('## 可以接着读\n\n[接着读](' + href + ')')

    def test_real_shelf_reading_links_target_published_entries(self):
        import json
        import re
        catalog = json.loads((ROOT / 'english-corner/catalog.json').read_text(encoding='utf-8'))
        destinations = {'/english/'} | {'/english/' + card['slug'] + '/' for card in catalog['cards'] if card['status'] == 'published'}
        anthology = json.loads((ROOT / 'anthology/catalog.json').read_text(encoding='utf-8'))
        destinations |= {'/anthology/'} | {'/anthology/' + work['slug'] + '/' for collection in anthology['collections'] for work in collection['works']}
        linked = set()
        for item in self.shelf:
            body = (ROOT / 'marx-engels/cards' / (item['slug'] + '.md')).read_text(encoding='utf-8')
            for route in re.findall(r'\]\((/(?:english|anthology)/[^)]*)\)', body):
                self.assertIn(route, destinations)
                linked.add(route)
        self.assertTrue({'/english/franklin-whistle/', '/english/twain-corn-pone/', '/english/shakespeare-invented-words/', '/anthology/dian-lun-lun-wen/'} <= linked)


if __name__ == '__main__':
    unittest.main()
