"""Theme metadata is shared without altering reviewed bilingual quotations."""
import copy
from datetime import date
import hashlib
import json
from pathlib import Path
import unittest

from daily_brief import ENGLISH_QUOTE_THEMES, validate_english_quotes

ROOT = Path(__file__).resolve().parent.parent


def fixture():
    return {"version":1,"quotes":[{
        "id":"synthetic-quote","text":"An invented test sentence.","translation":"测试用合成句子。",
        "translation_source":{"type":"site"},"author_zh":"测试作者","author_en":"Synthetic Author",
        "work_zh":"《合成作品》","work_en":"Synthetic Work","locator_zh":"测试位置",
        "first_published":1900,"author_died":1950,"url":"https://example.org/original","note":"此句仅为测试夹具。"
    }]}


class EnglishQuoteThemeTests(unittest.TestCase):
    def test_twelve_fixed_theme_ids_accept_one_or_two_labels_without_mutating_text(self):
        self.assertEqual(set(ENGLISH_QUOTE_THEMES),set("learning life love courage freedom time nature friendship hope humor society art".split()))
        self.assertLessEqual(len(ENGLISH_QUOTE_THEMES),12)
        for theme in ENGLISH_QUOTE_THEMES:
            data=fixture();data["quotes"][0]["themes"]=[theme]
            before=copy.deepcopy(data)
            self.assertIs(validate_english_quotes(data,today=date(2026,10,30)),data)
            self.assertEqual(data,before)
        data=fixture();data["quotes"][0]["themes"]=["learning","freedom"]
        validate_english_quotes(data,today=date(2026,10,30))

    def test_unknown_duplicate_excess_and_malformed_themes_are_rejected(self):
        for themes in ([],["unknown"],["Learning"],["life","life"],["life","time","hope"],None,"life",True,{},[1],[{}],[[]]):
            data=fixture();data["quotes"][0]["themes"]=themes
            with self.subTest(themes=themes),self.assertRaisesRegex(ValueError,"themes"):
                validate_english_quotes(data,today=date(2026,10,30))

    def test_legacy_unclassified_fixture_is_accepted_but_partially_classified_pools_are_rejected(self):
        data=fixture();validate_english_quotes(data,today=date(2026,10,30))
        other={**copy.deepcopy(data["quotes"][0]),"id":"second-synthetic","text":"Another invented test sentence.","themes":["life"]}
        data["quotes"].append(other)
        with self.assertRaisesRegex(ValueError,"themes"):
            validate_english_quotes(data,today=date(2026,10,30))
        data["quotes"][0]["themes"]=["learning"]
        validate_english_quotes(data,today=date(2026,10,30))

    def test_real_pool_all_classified_with_existing_original_review_hashes(self):
        data=json.loads((ROOT/"home/brief/english-quotes.json").read_text(encoding="utf-8"))
        records=json.loads((ROOT/"home/brief/english-quotes-review.json").read_text(encoding="utf-8"))["quotes"]
        by_id={record["id"]:record for record in records}
        self.assertGreaterEqual(len(data["quotes"]),200)
        self.assertEqual(set(by_id),{quote["id"] for quote in data["quotes"]})
        validate_english_quotes(data,today=date(2026,10,30))
        for quote in data["quotes"]:
            with self.subTest(quote=quote["id"]):
                self.assertIn("themes",quote)
                self.assertIn(len(quote["themes"]),(1,2))
                self.assertEqual(by_id[quote["id"]]["text_sha256_lf"],hashlib.sha256(quote["text"].encode()).hexdigest())
                self.assertEqual(by_id[quote["id"]]["source_url"],quote["url"])


if __name__ == "__main__":
    unittest.main()
