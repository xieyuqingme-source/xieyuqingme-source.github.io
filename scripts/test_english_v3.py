"""Reader-facing third-version learning contracts and data boundaries."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

from english_corner import load_english_corner, render_index
from english_corner import render_play, render_quote_library
from english_corner import word_map_data, render_word_map, render_card, load_intro
from daily_brief import load_english_quotes, ENGLISH_QUOTE_THEMES

ROOT = Path(__file__).resolve().parent.parent


class Links(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.nodes = []
        self.active_link = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))
        if tag == 'a':
            self.active_link = {**dict(attrs), 'text': ''}
            self.links.append(self.active_link)

    def handle_data(self, data):
        if self.active_link is not None:
            self.active_link['text'] += data

    def handle_endtag(self, tag):
        if tag == 'a':
            self.active_link = None


class LearningThirdVersionTests(unittest.TestCase):
    def test_four_playing_entries_precede_the_directory_and_are_not_duplicated(self):
        html = render_index(load_english_corner(ROOT))
        match = re.search(r'<nav class="ec-quick-links".*?</nav>', html, re.S)
        self.assertIsNotNone(match)
        expected = ['/english/play/', '/game/ranking/?template=book', '/english/quotes/', '/english/map/']
        self.assertEqual([link['href'] for link in Links(match[0]).links], expected)
        self.assertLess(html.index(match[0]), html.index('class="ec-columns"'))
        self.assertLess(html.index(match[0]), html.index('data-ec-row'))
        all_links = [link.get('href') for link in Links(html).links]
        for href in expected:
            self.assertEqual(all_links.count(href), 1)
        self.assertNotIn('ec-play-entry', html)
        self.assertNotIn('ec-tool-entry', html)
        self.assertNotIn('在排行工具里选择', html)
        self.assertIn('/english/tools/numbers/', html)

    def test_home_signatures_link_to_the_chinese_learning_column(self):
        for file, english in [('home/index.template.html', False), ('home/en/index.template.html', True)]:
            html = (ROOT/file).read_text(encoding='utf-8')
            signature = re.search(r'<p class="hero-signature">(.*?)</p>', html, re.S)[1]
            links = Links(signature).links
            self.assertEqual(len(links), 1)
            self.assertEqual(links[0]['href'], '/english/')
            if english:
                self.assertEqual(links[0].get('hreflang'), 'zh-CN')
            self.assertIn('data-i18n="common.signature.1"', signature)

    def test_answers_are_native_details_and_keep_complete_reading_links(self):
        corner = load_english_corner(ROOT)
        html = render_index(corner)
        rows = re.findall(r'<article class="ec-row".*?</article>', html, re.S)
        self.assertEqual(len(rows), len(corner['cards']))
        for card, row in zip(corner['cards'], rows):
            with self.subTest(slug=card['slug']):
                self.assertIn('data-slug="' + card['slug'] + '"', row)
                self.assertIn('<details class="ec-answer"><summary>看答案</summary>', row)
                self.assertNotIn('<details class="ec-answer" open', row)
                links = [link['href'] for link in Links(row).links]
                self.assertEqual(links, ['/english/' + card['slug'] + '/'] * 2)
                self.assertIn('data-ec-read-flag hidden', row)
        self.assertIn('data-ec-read-tools hidden', html)
        self.assertIn('data-ec-random', html)

    def test_compact_category_tags_are_the_only_category_controls(self):
        corner = load_english_corner(ROOT)
        html = render_index(corner)
        tags = [link for link in Links(html).links if 'data-ec-filter' in link]
        self.assertEqual([link['data-ec-filter'] for link in tags], ['all'] + [c['id'] for c in corner['columns']])
        self.assertTrue(all(link['href'].startswith('#') for link in tags))
        self.assertNotIn('<legend>栏目</legend>', html)
        self.assertIn('<legend>难度</legend>', html)

    def test_clear_answer_cards_precede_uncertain_origins(self):
        cards = load_english_corner(ROOT)['cards']
        position = {card['slug']: n for n, card in enumerate(cards)}
        self.assertLess(position['ok'], position['posh'])
        self.assertLess(position['sos'], position['salary-salt'])
        self.assertLess(position['ketchup'], position['long-time-no-see'])
        self.assertLess(position['september'], position['black-tea'])

    def test_library_keeps_all_reviewed_rows_for_no_script_reading(self):
        corner = load_english_corner(ROOT)
        data = load_english_quotes(ROOT, {'/english/'+card['slug']+'/' for card in corner['cards']})
        html = render_quote_library(data)
        nodes = Links(html).nodes
        rows = {attrs['id']: attrs for tag, attrs in nodes if tag == 'article' and 'data-english-quote-row' in attrs}
        self.assertEqual(len(rows), len(data['quotes']))
        for quote in data['quotes']:
            attrs = rows['quote-'+quote['id']]
            self.assertNotIn('hidden', attrs)
            self.assertEqual(attrs['data-themes'].split(), quote['themes'])
            self.assertIn(quote['author_zh'], attrs['data-copy-source'])
            self.assertIn(quote['work_zh'], attrs['data-copy-source'])
        copies = [attrs for tag, attrs in nodes if tag == 'button' and 'data-english-quote-copy' in attrs]
        self.assertEqual(len(copies), len(data['quotes']))
        self.assertTrue(all('hidden' in attrs for attrs in copies))
        self.assertIn('id="ec-quote-more" hidden', html)
        self.assertIn('id="ec-quote-random" hidden', html)
        self.assertIn('id="ec-quote-theme"', html)
        for label in ENGLISH_QUOTE_THEMES.values():
            self.assertIn(label, html)

    def test_quiz_uses_four_reader_modes_and_warmups_from_the_same_pool(self):
        import json
        corner = load_english_corner(ROOT)
        quotes = load_english_quotes(ROOT, {'/english/'+card['slug']+'/' for card in corner['cards']})
        html = render_play(corner, quotes)
        modes = [attrs['data-quiz-mode'] for tag, attrs in Links(html).nodes if tag == 'button' and 'data-quiz-mode' in attrs]
        self.assertEqual(modes, ['origins', 'etymology', 'usage', 'authors'])
        pools = json.loads(re.search(r'id="english-quiz-data">(.*?)</script>', html, re.S)[1])
        self.assertEqual(len(pools['authors']), len(quotes['quotes']))
        self.assertGreaterEqual(len(pools['usage']), 10)
        self.assertTrue(all(2 <= len(question['choices']) <= 3 for question in pools['usage']))
        warmups = [question for question in pools['authors'] if question['warmup']]
        self.assertGreaterEqual(len({question['answer'] for question in warmups}), 3)
        self.assertTrue(all(question['hint'] and question['translation'] for question in pools['authors']))
        for hook in ('assistance', 'show-translation', 'show-hint', 'preview-translation', 'preview-hint', 'change-mode'):
            self.assertIn('data-quiz-'+hook, html)

    def test_expanded_cards_and_uncertain_origins_still_teach_specific_language(self):
        cards = {c['slug']: c for c in load_english_corner(ROOT)['cards']}
        self.assertGreaterEqual(len(cards), 64)
        self.assertGreaterEqual(sum(c['column'] == 'words' for c in cards.values()), 24)
        self.assertGreaterEqual(sum(c['column'] == 'mistakes' for c in cards.values()), 20)
        self.assertTrue(set(('algebra coffee robot tomato kindergarten tsunami safari shampoo pyjamas cookie sauna ski').split()).issubset(cards))
        for slug, useful in {'posh':'posh hotel', 'salary-salt':'annual salary', 'long-time-no-see':'how have you been', 'shakespeare-invented-words':'gloomy'}.items():
            self.assertIn(useful, cards[slug]['body'].lower())
            self.assertTrue(any('merriam-webster.com' in source['url'] for source in cards[slug]['sources']))

    def test_map_groups_representative_points_and_preserves_all_reviewed_stops(self):
        corner = load_english_corner(ROOT)
        source = {c['slug']: c for c in corner['cards'] if c.get('journey')}
        data = word_map_data(corner)
        self.assertGreaterEqual(len(data['words']), 22)
        self.assertEqual({w['slug'] for w in data['words']}, set(source))
        groups = {g['id'] for g in data['regions']}
        self.assertEqual(len(groups), len(data['regions']))
        for word in data['words']:
            self.assertIn(word['region'], groups)
            self.assertEqual(word['journey'], source[word['slug']]['journey'])
        words = {word['slug']: word for word in data['words']}
        self.assertEqual(words['pyjamas']['region'], 'west-asia-north-africa')
        self.assertEqual(words['long-time-no-see']['region'], 'uncertain')
        self.assertEqual(len(words['long-time-no-see']['journey']), 1)
        import copy
        new_word = copy.deepcopy(source['coffee'])
        new_word['slug'] = 'unknown-representative-point'
        new_word['journey'][0].update(lon=0, lat=0)
        self.assertEqual(word_map_data({'cards':[new_word]})['words'][0]['region'], 'other')

    def test_map_native_fallback_keeps_every_word_in_its_region(self):
        corner = load_english_corner(ROOT)
        data = word_map_data(corner)
        html = render_word_map(corner)
        nodes = Links(html).nodes
        groups = [attrs['data-word-map-group'] for tag, attrs in nodes if 'data-word-map-group' in attrs]
        expected = [group['id'] for group in data['regions']]
        self.assertEqual(groups, expected + expected)
        buttons = [attrs['data-word-map-slug'] for tag, attrs in nodes if 'data-word-map-slug' in attrs]
        self.assertEqual(set(buttons), {w['slug'] for w in data['words']})
        self.assertEqual(len(buttons), len(data['words']))
        self.assertTrue(any(tag == 'details' and attrs.get('id') == 'word-map-notes' for tag, attrs in nodes))
        self.assertIn('地点与连线均为示意。', html)
        self.assertIn('不能据此推断真实旅行、具体年代或唯一传播路线', html)
        fallback = next(attrs for tag, attrs in nodes if 'data-word-map-fallback' in attrs)
        self.assertNotIn('hidden', fallback)

    def test_reading_navigation_is_labelled_and_has_no_repeated_destination(self):
        corner = load_english_corner(ROOT)
        for index, card in enumerate(corner['cards']):
            html = render_card(card, corner)
            navigation = re.search(r'<nav class="ec-adjacent"[^>]*>(.*?)</nav>', html, re.S)[1]
            related = re.search(r'<aside class="ec-related"[^>]*>(.*?)</aside>', html, re.S)
            links = Links(navigation + (related[1] if related else '')).links
            hrefs = [link['href'] for link in links]
            self.assertEqual(len(hrefs), len(set(hrefs)), card['slug'])
            labels = [link['text'] for link in Links(navigation).links]
            self.assertEqual(sum('上一张：' in label for label in labels), int(index > 0))
            self.assertEqual(sum('下一张：' in label for label in labels), int(index+1 < len(corner['cards'])))

    def test_voice_information_is_on_controls_and_feedback_starts_empty(self):
        corner = load_english_corner(ROOT)
        quotes = load_english_quotes(ROOT, {'/english/'+c['slug']+'/' for c in corner['cards']})
        examples = [next(c for c in corner['cards'] if c['column'] == column) for column in ('words','classics')]
        pages = [render_card(card, corner) for card in examples] + [render_quote_library(quotes)]
        for html in pages:
            nodes = Links(html).nodes
            buttons = [attrs for tag, attrs in nodes if tag == 'button' and 'data-english-speech' in attrs]
            self.assertTrue(buttons)
            self.assertTrue(all('本地英语语音' in b['title'] and '再次点击停止' in b['aria-label'] for b in buttons))
            notes = [attrs for tag, attrs in nodes if 'data-english-speech-note' in attrs]
            self.assertEqual(len(notes), 1)
            self.assertEqual(notes[0]['role'], 'status')
            self.assertEqual(notes[0]['aria-live'], 'polite')
            self.assertIn('hidden', notes[0])
            self.assertRegex(html, r'data-english-speech-note[^>]*></p>')
            self.assertNotIn('朗读使用设备自带的本地英语语音，再次点击可停止。</p>', html)

    def test_difficulty_description_and_share_title_preserve_the_introduction(self):
        corner = load_english_corner(ROOT)
        intro = load_intro(ROOT)
        self.assertEqual(intro['name'], '学英语')
        self.assertEqual(intro['intro'], '英语好啊，英语得学，我也想学英语。')
        self.assertEqual(intro['title'], '学英语 · 词源、名著和英语冷知识')
        index = render_index(corner)
        self.assertIn('id="ec-level-help">按读懂所需的词汇量大致分级', index)
        self.assertIn('aria-describedby="ec-level-help"', index)
        for card in corner['cards']:
            self.assertIn('title="按读懂所需的词汇量大致分级"', render_card(card, corner))



if __name__ == '__main__':
    unittest.main()
