"""Offline schema, provenance, derived-author and production quiz checks."""
from collections import Counter
from copy import deepcopy
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from english_corner import load_english_corner
from english_quiz import build_quiz_pools, load_quiz, load_quiz_options, validate_quiz


ROOT = Path(__file__).resolve().parent.parent
TODAY = date(2026, 10, 29)


def fixture():
    source = {"label": "Synthetic source for schema tests", "url": "https://example.org/etymology", "checked_on": "2026-10-29"}
    cards = [{"slug": "fixture-card", "status": "published", "sources": [deepcopy(source)]}]
    question = {"id": "fixture-question", "mode": "etymology", "text": "Synthetic evidence question?",
                "choices": ["真", "假", "存疑", "部分正确"], "answer": "存疑",
                "explanation": "Synthetic explanations must be explicit, public and useful. This fixture tests the schema only; it does not claim to be researched material.",
                "card": "fixture-card", "sources": [deepcopy(source)]}
    return {"version": 1, "questions": [question]}, cards


def quotation(identifier, author, year, **changes):
    """Synthetic quote records test derivation, never published as literature."""
    item = {"id": identifier, "text": "Synthetic quotation " + identifier + ".", "translation": "用于测试的自编句子。",
            "translation_source": {"type": "site"}, "author_zh": "测试作者" + author, "author_en": "Synthetic Author " + author,
            "work_zh": "《测试作品》", "work_en": "Synthetic Work " + identifier, "locator_zh": "测试位置",
            "first_published": year, "author_died": 1950, "url": "https://example.org/works/" + identifier,
            "note": "测试记录用于核对派生规则，不代表真实引文。"}
    item.update(changes)
    return item


def label(item):
    return item["author_zh"] + "（" + item["author_en"] + "）"


class QuizValidationTests(unittest.TestCase):
    def assert_bad(self, change):
        data, cards = fixture()
        change(data, cards)
        with self.assertRaises(ValueError):
            validate_quiz(data, cards)

    def test_valid_schema_copies_records_and_empty_fixture_is_supported(self):
        data, cards = fixture()
        before = deepcopy(data)
        questions = validate_quiz(data, cards)
        self.assertEqual(questions, data["questions"])
        self.assertIsNot(questions, data["questions"])
        questions[0]["sources"][0]["label"] = "Changed returned copy"
        self.assertEqual(data, before)
        self.assertEqual(validate_quiz({"version": 1, "questions": []}, []), [])

    def test_unknown_and_missing_fields_cannot_silently_publish(self):
        changes = [lambda d, c: d.update(extra=True), lambda d, c: d.pop("questions"),
                   lambda d, c: d["questions"][0].update(extra=True), lambda d, c: d["questions"][0].pop("answer"),
                   lambda d, c: d["questions"][0]["sources"][0].update(extra=True),
                   lambda d, c: d["questions"][0]["sources"][0].pop("checked_on")]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                self.assert_bad(change)

    def test_version_question_list_modes_and_public_ids_are_strict(self):
        for version in [True, "1", 0, 2]:
            with self.subTest(version=version):
                self.assert_bad(lambda d, c: d.update(version=version))
        for questions in [None, {}, "questions", [None]]:
            with self.subTest(questions=questions):
                self.assert_bad(lambda d, c: d.update(questions=questions))
        for mode in ["authors", "unknown", None, []]:
            with self.subTest(mode=mode):
                self.assert_bad(lambda d, c: d["questions"][0].update(mode=mode))
        for identifier in ["a", "../private", "Question", "bad_id", "a" * 65, None]:
            with self.subTest(identifier=identifier):
                self.assert_bad(lambda d, c: d["questions"][0].update(id=identifier))
        self.assert_bad(lambda d, c: d["questions"].append(deepcopy(d["questions"][0])))

    def test_four_unique_visible_choices_and_exact_answer_are_required(self):
        for choices in [None, "abcd", [], ["a", "b", "c"], ["a", "b", "c", "d", "e"],
                        ["a", "b", "c", "c"], ["A", "a", "b", "c"], ["a", "Ａ", "b", "c"],
                        ["a", "b", "c", None], ["a", "b", "c", " "], ["a", "b", "c", " d"]]:
            with self.subTest(choices=choices):
                self.assert_bad(lambda d, c: d["questions"][0].update(mode="origins", choices=choices, answer="a"))
        self.assert_bad(lambda d, c: d["questions"][0].update(answer="不确定"))
        self.assert_bad(lambda d, c: d["questions"][0].update(answer="存疑 "))
        self.assert_bad(lambda d, c: d["questions"][0].update(choices=["真", "假", "部分正确", "存疑"]))

    def test_private_paths_controls_and_unhelpful_explanations_fail(self):
        for value in ["C:/Users/private.txt", "D:\\private\\note.md", "Obsidian Vault/notes", "a\nb", "a\x7fb", " ", None]:
            with self.subTest(value=value):
                self.assert_bad(lambda d, c: d["questions"][0].update(text=value))
        for explanation in ["Too brief.", "字" * 221, " " + "字" * 100, "字" * 100 + "\n"]:
            with self.subTest(explanation=explanation):
                self.assert_bad(lambda d, c: d["questions"][0].update(explanation=explanation))

    def test_only_existing_published_cards_can_be_reading_targets(self):
        self.assert_bad(lambda d, c: d["questions"][0].update(card="unknown-card"))
        self.assert_bad(lambda d, c: d["questions"][0].update(card="https://example.org/card"))
        self.assert_bad(lambda d, c: d["questions"][0].update(card="../private"))
        self.assert_bad(lambda d, c: c[0].update(status="draft"))
        self.assert_bad(lambda d, c: c.append(deepcopy(c[0])))

    def test_sources_must_be_safe_distinct_and_belong_to_the_linked_card(self):
        for url in ["http://example.org/source", "file:///private.txt", "https://localhost/source", "https://127.0.0.1/source",
                    "https://10.1.2.3/source", "https://example.org/source?token=private", "https://user:pass@example.org/source",
                    "https://example.org/source%0a", "https://example.org/Obsidian%20Vault/source", "https://other.example.org/source"]:
            with self.subTest(url=url):
                self.assert_bad(lambda d, c: d["questions"][0]["sources"][0].update(url=url))
        self.assert_bad(lambda d, c: d["questions"][0].update(sources=[]))
        self.assert_bad(lambda d, c: d["questions"][0]["sources"].append(deepcopy(d["questions"][0]["sources"][0])))
        self.assert_bad(lambda d, c: d["questions"][0]["sources"][0].update(checked_on="2026-02-30"))
        self.assert_bad(lambda d, c: d["questions"][0]["sources"][0].update(label="C:/private/reference"))

    def test_loader_reads_only_the_explicit_repository_file(self):
        data, cards = fixture()
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "english-corner").mkdir()
            (root / "english-corner/quiz.json").write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(load_quiz(root, cards), data["questions"])
            (root / "private.json").write_text("Not a public quiz", encoding="utf-8")
            self.assertEqual(load_quiz(root, cards), data["questions"])

    def test_usage_requires_two_or_three_choices_and_a_published_mistake_card(self):
        data,cards=fixture()
        cards[0]['column']='mistakes'
        question=data['questions'][0]
        question.update(mode='usage',choices=['Correct form.','Incorrect form.'],answer='Correct form.')
        self.assertEqual(validate_quiz(data,cards)[0]['mode'],'usage')
        question['choices'].append('Another incorrect form.')
        self.assertEqual(len(validate_quiz(data,cards)[0]['choices']),3)
        for choices in [[],['one'],['one','two','three','four']]:
            with self.subTest(choices=choices),self.assertRaises(ValueError):
                bad=deepcopy(data);bad['questions'][0].update(choices=choices,answer=choices[0] if choices else '')
                validate_quiz(bad,cards)
        for column in ['words','classics',None]:
            cards[0]['column']=column
            with self.subTest(column=column),self.assertRaises(ValueError):validate_quiz(data,cards)

    def test_optional_warmup_ids_are_bounded_unique_public_shared_ids(self):
        data,cards=fixture()
        for values in [None,True,'quote-id',{},['first-id'],['first-id','second-id'],['same-id']*3,['../bad','first-id','second-id'],['quote-'+str(i) for i in range(41)]]:
            with self.subTest(values=values),self.assertRaises(ValueError):
                bad=deepcopy(data);bad['warmup_quotes']=values;validate_quiz(bad,cards)
        for values in [[],['first-id','second-id','third-id']]:
            valid=deepcopy(data);valid['warmup_quotes']=values
            self.assertEqual(len(validate_quiz(valid,cards)),1)
        with TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'english-corner').mkdir()
            source=root/'english-corner/quiz.json'
            source.write_text(json.dumps(data),encoding='utf-8')
            self.assertEqual(load_quiz_options(root),[])
            data['warmup_quotes']=['first-id','second-id','third-id']
            source.write_text(json.dumps(data),encoding='utf-8')
            self.assertEqual(load_quiz_options(root),data['warmup_quotes'])


class DerivedAuthorTests(unittest.TestCase):
    def setUp(self):
        self.quotes = [quotation("target-quote", "T", 1900), quotation("a-old", "A", 1800), quotation("a-near", "A", 1899),
                       quotation("b-near", "B", 1897), quotation("c-near", "C", 1902), quotation("d-far", "D", 1810),
                       quotation("e-far", "E", 1929)]
        deaths={"T":1945,"A":1944,"B":1942,"C":1947,"D":1855,"E":1974}
        for quote in self.quotes: quote["author_died"]=deaths[quote["author_en"].rsplit(" ",1)[1]]

    def test_each_author_question_is_derived_once_with_three_nearest_distinct_authors(self):
        pools = build_quiz_pools(self.quotes, [])
        self.assertEqual(set(pools), {"authors", "etymology", "origins", "usage"})
        self.assertEqual(len(pools["authors"]), len(self.quotes))
        question = next(q for q in pools["authors"] if q["id"] == "author-target-quote")
        self.assertEqual(question["choices"], [label(self.quotes[i]) for i in [0, 2, 4, 3]])
        self.assertEqual(question["answer"], label(self.quotes[0]))
        for item in pools["authors"]:
            self.assertEqual(len(item["choices"]), len(set(item["choices"])))
            self.assertEqual(len(item["choices"]), 4)
            self.assertIn(item["answer"], item["choices"])

    def test_era_proximity_is_independent_of_quote_input_order(self):
        first = {q["id"]: q["choices"] for q in build_quiz_pools(self.quotes, [])["authors"]}
        second = {q["id"]: q["choices"] for q in build_quiz_pools(list(reversed(self.quotes)), [])["authors"]}
        self.assertEqual(first, second)

    def test_late_edition_does_not_move_the_author_era(self):
        before=build_quiz_pools(self.quotes,[])["authors"][0]["choices"]
        self.quotes[0]["first_published"]=1930
        self.assertEqual(build_quiz_pools(self.quotes,[])["authors"][0]["choices"],before)
        self.quotes[2]["author_died"]+=1
        with self.assertRaisesRegex(ValueError,"consistent death year"):
            build_quiz_pools(self.quotes,[])

    def test_shared_text_translation_notes_sources_and_lf_are_preserved(self):
        self.quotes[0].update(text="First synthetic line.\nSecond synthetic line.", translation="第一句。\n第二句。")
        self.quotes[1]["related"] = "/english/fixture-card/"
        before = deepcopy(self.quotes)
        questions = build_quiz_pools({"version": 1, "quotes": self.quotes}, [])["authors"]
        for source, question in zip(self.quotes, questions):
            self.assertEqual(question["english"], source["text"])
            self.assertEqual(question["translation"], source["translation"])
            self.assertIn(source["work_en"], question["explanation"])
            self.assertIn(source["work_zh"], question["explanation"])
            self.assertIn(source["locator_zh"], question["explanation"])
            self.assertIn(source["note"], question["explanation"])
            self.assertEqual(question["sources"], [{"label": source["author_en"] + " · " + source["work_en"], "url": source["url"]}])
        self.assertEqual(questions[0]["reading"], "/english/quotes/#quote-target-quote")
        self.assertEqual(questions[1]["reading"], "/english/fixture-card/")
        self.assertEqual(self.quotes, before)

    def test_small_fixture_does_not_fabricate_authors_or_quotations(self):
        for quotes in [[], self.quotes[:1], self.quotes[:3]]:
            with self.subTest(count=len(quotes)):
                self.assertEqual(build_quiz_pools(quotes, [])["authors"], [])

    def test_source_validation_and_author_identity_do_not_silently_drift(self):
        changes = [lambda q: q[0].update(url="https://127.0.0.1/private"),
                   lambda q: q[0].update(related="javascript:alert(1)"),
                   lambda q: q[0].update(text="Bad line.\r\nSecond line."),
                   lambda q: q[2].update(author_zh="另一个测试名字"),
                   lambda q: q.append(deepcopy(q[0]))]
        for change in changes:
            quotes = deepcopy(self.quotes)
            change(quotes)
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    build_quiz_pools(quotes, [])

    def test_knowledge_projection_uses_one_card_route_without_copying_quote_fields(self):
        data, cards = fixture()
        knowledge = validate_quiz(data, cards)
        before = deepcopy(knowledge)
        pool = build_quiz_pools(self.quotes, knowledge)["etymology"]
        self.assertEqual(len(pool), 1)
        self.assertEqual(pool[0]["reading"], "/english/fixture-card/")
        self.assertNotIn("card", pool[0])
        self.assertNotIn("english", pool[0])
        self.assertNotIn("translation", pool[0])
        self.assertEqual(knowledge, before)
        pool[0]["sources"][0]["label"] = "Change output only"
        self.assertEqual(knowledge, before)

    def test_beginner_ids_are_resolved_against_the_same_corpus_and_at_least_three_authors(self):
        ids=['target-quote','a-near','b-near']
        pool=build_quiz_pools(self.quotes,[],ids)['authors']
        self.assertEqual({q['id'].removeprefix('author-') for q in pool if q['warmup']},set(ids))
        self.assertTrue(all('作品/所引版本 ' in q['hint'] for q in pool))
        self.assertTrue(all(q['hint'].startswith(source['work_zh']) for source,q in zip(self.quotes,pool)))
        for values in [None,'target-quote',['target-quote','a-near','missing-id'],['target-quote','a-old','a-near']]:
            with self.subTest(values=values),self.assertRaises(ValueError):build_quiz_pools(self.quotes,[],values)

    def test_one_familiar_distractor_can_replace_the_farthest_nearby_choice(self):
        ids=['target-quote','d-far','e-far']
        pool=build_quiz_pools(self.quotes,[],ids)['authors']
        familiar={label(self.quotes[i]) for i in (0,5,6)}
        for question in pool:
            self.assertTrue((set(question['choices'])-{question['answer']}) & familiar)
            self.assertEqual(len(set(question['choices'])),4)


class ProductionQuizTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cards = load_english_corner(ROOT, today=TODAY)["cards"]
        cls.knowledge = load_quiz(ROOT, cls.cards)
        cls.quotes = json.loads((ROOT / "home/brief/english-quotes.json").read_text(encoding="utf-8"))
        cls.warmups = load_quiz_options(ROOT)
        cls.pools = build_quiz_pools(cls.quotes, cls.knowledge, cls.warmups)

    def test_inventory_has_ten_or_more_per_knowledge_mode_and_real_card_sources(self):
        counts = Counter(item["mode"] for item in self.knowledge)
        self.assertGreaterEqual(len(self.knowledge), 40)
        for mode in ["etymology", "origins", "usage"]:
            self.assertGreaterEqual(counts[mode], 10)
        cards = {card["slug"]: card for card in self.cards}
        for item in self.knowledge:
            self.assertTrue(item["sources"])
            self.assertTrue({source["url"] for source in item["sources"]}.issubset({source["url"] for source in cards[item["card"]]["sources"]}))
            if item['mode']=='usage':
                self.assertEqual(cards[item['card']]['column'],'mistakes')
                self.assertIn(len(item['choices']),(2,3))
        self.assertGreaterEqual(len(self.warmups),3)

    def test_every_shared_quote_has_one_derived_question_with_valid_reading_and_proximity(self):
        authors = self.pools["authors"]
        self.assertEqual(len(authors), len(self.quotes["quotes"]))
        self.assertEqual({item["id"] for item in authors}, {"author-" + item["id"] for item in self.quotes["quotes"]})
        routes = {"/english/" + card["slug"] + "/" for card in self.cards}
        for quote, question in zip(self.quotes["quotes"], authors):
            self.assertEqual(question["english"], quote["text"])
            self.assertEqual(question["translation"], quote["translation"])
            self.assertTrue(question["reading"] in routes or question["reading"] == "/english/quotes/#quote-" + quote["id"])
            self.assertEqual(len(set(question["choices"])), 4)
            years = {label(item): min(abs(other["author_died"] - quote["author_died"]) for other in self.quotes["quotes"] if label(other) == label(item))
                     for item in self.quotes["quotes"] if label(item) != label(quote)}
            chosen = set(question["choices"]) - {question["answer"]}
            self.assertEqual(sorted(years[author] for author in chosen)[:2],sorted(years.values())[:2])
            familiar={label(item) for item in self.quotes['quotes'] if item['id'] in self.warmups}
            self.assertTrue(chosen & familiar)
            self.assertEqual(question['warmup'],quote['id'] in self.warmups)
            self.assertEqual(question['hint'],quote['work_zh']+' · 作品/所引版本 '+str(quote['first_published'])+'年')

    def test_every_pool_has_unique_ids_safe_sources_and_the_uniform_display_fields(self):
        required = {"id", "mode", "text", "choices", "answer", "explanation", "reading", "sources"}
        for mode, pool in self.pools.items():
            self.assertEqual(len({item["id"] for item in pool}), len(pool))
            for item in pool:
                self.assertEqual(set(item), required | ({"english", "translation", "hint", "warmup"} if mode == "authors" else set()))
                self.assertEqual(item["mode"], mode)
                self.assertIn(item["answer"], item["choices"])
                self.assertTrue(all(source["url"].startswith("https://") for source in item["sources"]))


if __name__ == "__main__":
    unittest.main()
