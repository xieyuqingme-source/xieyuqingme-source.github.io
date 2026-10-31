"""Offline second-edition content, cross-reference and negative-schema regression checks."""
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import json
import re
import unittest

from marx_engels import load_marx_engels, validate_catalog
from marx_extras import ROUTES, LIFE_TAGS, LIFE_PERIODS, validate_extras, render_tool, render_life, render_letters, render_china, render_quotes, chinese_date
from marx_quiz import build_pools, quote_groups

ROOT=Path(__file__).resolve().parent.parent


class SecondEditionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_marx_engels(ROOT)
        cls.raw={name:json.loads((ROOT/'marx-engels'/('topics/china.json' if name=='china' else name+'.json')).read_text(encoding='utf-8')) for name in ('lab','quiz','quote-works','life','letters','china')}

    def test_original_presets_and_static_fallbacks(self):
        tools={t['id']:t for t in self.data['v2']['tools']}
        self.assertEqual(set(tools),{'value-form','working-day','reproduction'})
        self.assertEqual([p['values'] for p in tools['working-day']['presets']],[[7,6],[9,6],[12,6]])
        self.assertEqual(tools['reproduction']['presets'][0]['values'],[4000,1000,1000,2000,500,500])
        for ident in tools:
            html=render_tool(self.data,ident)
            self.assertIn('这个工具怎么来的',html)
            self.assertIn(tools[ident]['source']['url'],html)
        self.assertEqual(render_tool(self.data,'value-form').count('data-lab-step>'),4)
        self.assertIn('<table',render_tool(self.data,'working-day'))
        self.assertIn('9000',render_tool(self.data,'reproduction'))

    def test_shared_quotes_are_complete_without_a_copied_corpus(self):
        mappings=self.data['v2']['quote_works']
        pool={q['id'] for q in self.data['daily_quotes'] if q['author']['zh-CN'] in ('马克思','恩格斯','马恩')}
        self.assertEqual({q['id'] for q in mappings},pool)
        self.assertEqual(len(mappings),250)
        self.assertTrue(all(set(q)=={'id','work','author','year','work_id'} for q in mappings))
        self.assertEqual(sum(map(len,quote_groups(self.data).values())),250)
        self.assertGreaterEqual(len(quote_groups(self.data)),35)

    def test_question_modes_have_unique_questions_explanations_and_reading_links(self):
        pools=build_pools(self.data)
        for mode,pool in pools.items():
            self.assertGreaterEqual(len(pool),32 if mode=='myth' else 10)
            self.assertEqual(len({q['id'] for q in pool}),len(pool))
            for q in pool:
                self.assertEqual(len(q['choices']),len(set(q['choices'])))
                self.assertIn(q['answer'],q['choices'])
                self.assertTrue(q['explanation'])
                self.assertTrue(q['source'].startswith('https://www.marxists.org/'))
                self.assertTrue(q['reading'].startswith('/marx/'))
        self.assertEqual(len(pools['myth']),len(self.raw['quiz']['questions']))
        for q in pools['source']:
            self.assertEqual(len(q['choices']),4)
            self.assertEqual(len(q['distractors']),3)
            self.assertTrue(all(d['author']==q['author'] and type(d['year']) is int for d in q['distractors']))

    def test_chronology_preserves_date_precision_and_history_review(self):
        events=self.data['v2']['events']
        self.assertTrue(60<=len(events)<=100)
        self.assertEqual({e['precision'] for e in events},{'year','month','day'})
        self.assertEqual(len([e for e in events if 'history_id' in e]),50)
        for e in events:
            if e['precision']!='day':self.assertNotIn('history_id',e)
        history=json.loads((ROOT/'home/brief/history.json').read_text(encoding='utf-8'))['items']
        review=json.loads((ROOT/'home/brief/history-review.json').read_text(encoding='utf-8'))
        scope=next(s for s in review['additional_scopes'] if s['id']=='marx-engels-v2')
        self.assertEqual(set(scope['ids']),{e['history_id'] for e in events if 'history_id' in e})
        for e in events:
            if 'history_id' not in e:continue
            h=next(h for h in history if h['id']==e['history_id'])
            self.assertEqual(h['month_day'],e['date'][5:])
            self.assertEqual(h['verification'],'source_review')
            self.assertEqual(h['year'],int(e['date'][:4]))
        self.assertIn('data-me-person="both"',render_life(self.data))

    def test_letters_and_topic_keep_authors_and_publication_order(self):
        letters=self.data['v2']['letters'];china=self.data['v2']['china']
        self.assertTrue(30<=len(letters)<=40)
        self.assertTrue({61,62}<={r['no'] for r in letters})
        self.assertIn('全部精选书信',render_letters(self.data))
        self.assertEqual({r['work'] for r in china},{f'v02-{n:02}' for n in range(14,26)})
        self.assertEqual([r['date'] for r in china],sorted(r['date'] for r in china))
        self.assertEqual({r['work'] for r in china if self.data['works'][r['work']]['author']=='engels'},{'v02-17','v02-21'})
        self.assertIn('第二次鸦片战争发生于1856—1860年',render_china(self.data))

    def test_two_new_columns_keep_their_own_structure_and_english_cross_links(self):
        for column in ('passage','between'):
            rows=[i for i in self.data['items'].values() if i['category']==column]
            self.assertEqual(len(rows),6)
            for item in rows:
                self.assertNotIn('verdict',item)
                if column=='between':
                    self.assertIn('](/english/)',item['body'])
                    self.assertTrue(any('en' in self.data['citations'][cid] for cid in item['citations']))

    def test_reader_dates_tags_and_reference_lines(self):
        self.assertEqual(chinese_date('1818-05-05'), '1818年5月5日')
        self.assertEqual(chinese_date('1830-10'), '1830年10月')
        self.assertEqual(chinese_date('1845'), '1845年')
        events = {row['id']: row for row in self.data['v2']['events']}
        self.assertEqual({tag for row in events.values() for tag in row['tags']}, set(LIFE_TAGS))
        for ident in ('life-1846-12-28', 'life-1852-03-05', 'life-1859-12-12', 'life-1881-03-08'):
            self.assertEqual(events[ident]['tags'], ['书信'])
        for ident in ('life-1845-2', 'life-1853-06-14', 'life-1873-01-24', 'life-1878', 'life-1891-04-30'):
            self.assertEqual(events[ident]['tags'], ['著作'])
        self.assertEqual(events['life-1864-11-01']['tags'], ['组织'])
        self.assertEqual(events['life-1842-10-15']['tags'], ['生活'])
        self.assertEqual(events['life-1895-08-27']['errata'], ['engels-ashes-date'])
        life = render_life(self.data)
        for tag in LIFE_TAGS:
            self.assertIn('data-me-tag="' + tag + '"', life)
        self.assertIn('data-tag="书信"', life)
        self.assertIn('据年表1818年条', life)
        self.assertIn('/marx/sources/#errata-engels-ashes-date', life)
        for html in (life, render_letters(self.data), render_china(self.data), render_quotes(self.data), *(render_tool(self.data, ident) for ident in ('value-form', 'working-day', 'reproduction'))):
            for forbidden in ('精度', '首次发表日', '另读', '电子录入', '字符', 'CID'):
                self.assertNotIn(forbidden, html)
        self.assertIn('载于1853年6月14日《纽约每日论坛报》第3794号', render_china(self.data))

    def test_quote_work_order_and_index_keep_every_group_reachable(self):
        groups = quote_groups(self.data)
        years = {}
        for row in self.data['v2']['quote_works']:
            if row['year'] is not None:
                years[row['work']] = min(years.get(row['work'], row['year']), row['year'])
        ordered = list(groups)
        self.assertEqual(ordered, sorted(ordered, key=lambda work: (years.get(work, 9999), -len(groups[work]), work)))
        html = render_quotes(self.data)
        self.assertIn('aria-label="著作索引"', html)
        for index, (work, quotes) in enumerate(groups.items()):
            self.assertIn('href="#quote-work-' + str(index) + '"', html)
            self.assertIn('id="quote-work-' + str(index) + '"', html)
            self.assertIn(str(len(quotes)) + '句', html)
        self.assertEqual(html.count('data-me-quote-group'), len(groups))

    def test_lab_reading_and_external_arrows_are_unambiguous(self):
        from marx_render import link
        html = render_tool(self.data, 'working-day')
        self.assertIn('约16.7%', html)
        self.assertIn('50%', html)
        self.assertNotIn('16.667%', html)
        self.assertEqual(render_tool(self.data, 'value-form').count('原文用大括号合写为一组等式，这里逐行展开。'), 2)
        external = link('https://www.marxists.org/chinese/marx-engels2/01/01.htm', '沿作品接着读 →', True)
        self.assertNotIn('→', external)
        self.assertEqual(external.count('↗'), 1)
        self.assertNotRegex(render_life(self.data), r'→\s*<span[^>]*>↗')

    def test_cards_directory_carries_the_full_pool_and_home_keeps_two_per_column(self):
        from marx_render import render_directory, render_index, render_content
        from test_marx_engels import Tags
        from marx_engels import RESERVED
        cards = [row for row in self.data['items'].values() if row['kind'] == 'cards' and row['status'] == 'published']
        home, directory = render_index(self.data), render_directory(self.data)
        self.assertIn('/marx/cards/', ROUTES)
        self.assertIn('cards', RESERVED)
        self.assertNotIn('data-me-filters', home)
        self.assertNotIn('data-me-row', home)
        self.assertIn('看全部 ' + str(len(cards)) + ' 张卡片', home)
        self.assertEqual(directory.count(' data-me-row '), len(cards))
        featured = [attributes for tag, attributes in Tags(home).nodes if tag == 'article' and 'data-me-featured' in attributes]
        for column in self.data['catalog']['columns']:
            self.assertEqual(sum(row['data-column'] == column['id'] for row in featured), min(2, sum(card['column'] == column['id'] for card in cards)))
            self.assertIn('data-me-column="' + column['id'] + '"', directory)
        for card in cards:
            self.assertIn('href="' + card['route'] + '"', directory)
            content = render_content(self.data, card)
            self.assertIn('href="/marx/cards/#directory"', content)
            self.assertIn('data-me-columns="' + ' '.join(column['id'] for column in self.data['catalog']['columns']) + '"', content)

    def test_native_periods_decades_and_capital_return_links_preserve_complete_contents(self):
        from marx_render import render_wenji_volume, render_capital_volume
        from test_marx_engels import Tags
        life = render_life(self.data)
        periods = [attrs for tag, attrs in Tags(life).nodes if tag == 'details' and 'data-me-life-period' in attrs]
        self.assertEqual(len(periods), len(LIFE_PERIODS))
        self.assertEqual(sum('open' in attrs for attrs in periods), 1)
        self.assertIn('open', periods[0])
        for event in self.data['v2']['events']:
            self.assertEqual(life.count('id="' + event['id'] + '"'), 1)
            self.assertEqual(sum(start <= int(event['date'][:4]) <= end for start, end, _ in LIFE_PERIODS), 1)
        letters = render_wenji_volume(self.data, self.data['wenji']['volumes'][9])
        for letter in self.data['wenji']['volumes'][9]['letters']:
            self.assertEqual(letters.count('id="letter-' + str(letter['no']).zfill(3) + '"'), 1)
        decades = {letter['year'] // 10 for letter in self.data['wenji']['volumes'][9]['letters']}
        self.assertEqual(letters.count('class="me-decade"'), len(decades))
        self.assertEqual(letters.count('href="#letter-year-index"'), len(decades))
        for volume in self.data['capital']['volumes']:
            html = render_capital_volume(self.data, volume)
            self.assertIn('id="capital-parts"', html)
            self.assertEqual(html.count('href="#capital-parts"'), len(volume['parts']))
            for part in volume['parts']:
                self.assertIn('href="#part-' + str(part['no']) + '"', html)

    def test_second_and_third_volume_part_guides_render_real_chapters_once(self):
        from html import escape
        from marx_render import render_content, render_capital_volume
        from marx_checks import part_chapters
        expected = {(volume, part['no']) for volume in (2, 3) for part in self.data['capital']['volumes'][volume - 1]['parts']}
        guides = [item for item in self.data['items'].values() if item['kind'] == 'parts' and item['status'] == 'published']
        self.assertEqual({(item['volume'], item['part']) for item in guides}, expected)
        self.assertEqual(len(guides), 10)
        for item in guides:
            html = render_content(self.data, item)
            self.assertEqual(item['route'], '/marx/capital/' + str(item['volume']) + '/part' + str(item['part']) + '/')
            for title in ('一句话', '这一篇在全书中的位置', '各章怎么读', '关键概念', '常见误读', '原文片段', '英文对应'):
                self.assertEqual(html.count('<h2>' + title + '</h2>'), 1)
            chapters = part_chapters(self.data['chapters'], item['volume'], item['part'])
            self.assertEqual([note['no'] for note in item['chapter_notes']], [chapter['no'] for chapter in chapters])
            for note, chapter in zip(item['chapter_notes'], chapters):
                self.assertIn(escape(chapter['title']), html)
                self.assertIn('href="' + chapter['mia'] + '"', html)
                self.assertIn(escape(note['text']), html)
                for english in chapter.get('en', []):
                    self.assertIn('href="' + english['url'] + '"', html)
            self.assertEqual(html.count('data-citation='), len(item['citations']))
            self.assertIn('href="/marx/capital/' + str(item['volume']) + '/#part-' + str(item['part']) + '"', html)
        for volume in self.data['capital']['volumes'][1:]:
            html = render_capital_volume(self.data, volume)
            self.assertEqual(html.count('本篇导读'), len(volume['parts']))

    def test_third_volume_chapter_guides_return_to_their_own_volume(self):
        from marx_render import render_content
        guides = [item for item in self.data['items'].values() if item['kind'] == 'guides' and item['status'] == 'published' and item['volume'] == 3]
        self.assertEqual({item['chapter'] for item in guides}, {9, 13, 14, 15, 23, 25, 27, 48})
        for item in guides:
            html = render_content(self.data, item)
            self.assertIn('href="/marx/capital/3/#ch' + str(item['chapter']).zfill(2) + '"', html)
            self.assertIn('本卷目录与英文对应', html)
            self.assertNotIn('完整中英章号对应', html)
            self.assertEqual(html.count('data-citation='), len(item['citations']))

    def test_negative_schema_does_not_accept_partial_or_mislinked_extra_inputs(self):
        cases=['tool-missing','original-numbers','bad-date','missing-quotes','wrong-author','fake-letter','short-letter','topic-missing','wrong-topic-source','bad-history-id','unknown-field','too-few-myths','unknown-life-tag','repeated-life-tag','unknown-life-errata']
        for case in cases:
            raw=deepcopy(self.raw)
            if case=='tool-missing':raw['lab']['tools'].pop()
            elif case=='original-numbers':raw['lab']['tools'][2]['presets'][0]['values']=[1,1,1,2,1,1]
            elif case=='bad-date':raw['life']['events'][0]['date']='1818-02-30'
            elif case=='missing-quotes':raw['quote-works']['items'].pop()
            elif case=='wrong-author':raw['quote-works']['items'][0]['author']='engels' if raw['quote-works']['items'][0]['author']=='marx' else 'marx'
            elif case=='fake-letter':raw['letters']['letters'][0]['source']['url']=raw['letters']['letters'][1]['source']['url']
            elif case=='short-letter':raw['letters']['letters'][0]['summary']='太短'
            elif case=='topic-missing':raw['china']['items'].pop()
            elif case=='wrong-topic-source':raw['china']['items'][0]['source']['url']=raw['china']['items'][1]['source']['url']
            elif case=='bad-history-id':raw['life']['events'][0]['history_id']='private path'
            elif case=='unknown-field':raw['letters']['letters'][0]['private_path']='hidden'
            elif case=='too-few-myths':raw['quiz']['questions']=raw['quiz']['questions'][:31]
            elif case=='unknown-life-tag':raw['life']['events'][0]['tags']=['杂项']
            elif case=='repeated-life-tag':raw['life']['events'][0]['tags']=['生活','生活']
            elif case=='unknown-life-errata':raw['life']['events'][0]['errata']=['not-reviewed']
            with self.subTest(case=case),self.assertRaises(ValueError):validate_extras(raw,self.data)


if __name__=='__main__':unittest.main()
