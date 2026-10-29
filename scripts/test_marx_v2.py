"""Offline second-edition content, cross-reference and negative-schema regression checks."""
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import json
import unittest

from marx_engels import load_marx_engels, validate_catalog
from marx_v2 import ROUTES, validate_v2, render_tool, render_life, render_letters, render_china
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
            self.assertGreaterEqual(len(pool),16 if mode=='myth' else 10)
            self.assertEqual(len({q['id'] for q in pool}),len(pool))
            for q in pool:
                self.assertEqual(len(q['choices']),len(set(q['choices'])))
                self.assertIn(q['answer'],q['choices'])
                self.assertTrue(q['explanation'])
                self.assertTrue(q['source'].startswith('https://www.marxists.org/'))
                self.assertTrue(q['reading'].startswith('/marx/'))
        self.assertEqual(len(pools['myth']),16)
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
        self.assertNotIn(62,[r['no'] for r in letters])
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

    def test_negative_schema_does_not_accept_partial_or_mislinked_v2_inputs(self):
        cases=['tool-missing','original-numbers','bad-date','missing-quotes','wrong-author','fake-letter','short-letter','topic-missing','wrong-topic-source','bad-history-id','unknown-field','too-few-myths']
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
            elif case=='too-few-myths':raw['quiz']['questions']=raw['quiz']['questions'][:15]
            with self.subTest(case=case),self.assertRaises(ValueError):validate_v2(raw,self.data)


if __name__=='__main__':unittest.main()
