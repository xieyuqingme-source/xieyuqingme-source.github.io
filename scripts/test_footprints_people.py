"""Reviewed people Markdown compilation, source URLs and lazy map publication."""
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from footprints_people import (PEOPLE_IDS, COLUMNS, compile_markdown, load_people,
                               publish_people, validate_payload)
from map_pages import (LIMIT, build_map, read_document, validate_catalog,
                       validate_references, public_reference_url)

ROOT = Path(__file__).resolve().parent.parent
HEADERS = ["id", "start", "end", "city", "region", "country", "lat", "lon", "title",
           "description", "certainty", "source", "city_en", "region_en", "country_en",
           "title_en", "description_en"]
SOURCE = "https://www.example.org/collection?dep=P&id=882"
OTHER = "https://museum.example.org/chronology"


def row(**changes):
    value = dict(id="first", start="0742", end="", city="示例城", region="示例地区",
                 country="示例国", lat="30.1", lon="110.2", title="求学", description="只保留事实",
                 certainty="approximate", source="[M1](" + SOURCE + ")；[M2](" + OTHER + ")",
                 city_en="Example City", region_en="Example Region", country_en="Example Country",
                 title_en="Studies", description_en="Facts only")
    value.update(changes)
    return value


def markdown(person="marx", rows=None, headers=None):
    headers = headers or HEADERS
    rows = rows if rows is not None else [row()]
    front = ("---\nperson_id: " + person + "\nname: 示例人物\nenglish_name: Example Person\n"
             "scope: '主要生平地点，非完整行程'\n---\n\n# Reviewed public research\n\n")
    table = ("| " + " | ".join(headers) + " |\n| " + " | ".join("---" for _ in headers)
             + " |\n" + "\n".join("| " + " | ".join(value.get(key, "") for key in headers) + " |" for value in rows))
    return (front + table + "\n\n## Bibliography\n"
            "- M1 — National Museum，[*Complete Collection Record*](" + SOURCE + ")。时间与城市证据。\n"
            "- M2 — [Reviewed Chronology](" + OTHER + ")。另一项证据。\n")


def library(root):
    folder = Path(root) / "map/people"
    folder.mkdir(parents=True)
    for person in PEOPLE_IDS:
        (folder / (person + ".md")).write_text(markdown(person), encoding="utf-8")
    return folder


def node_binary():
    bundled = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
    return os.environ.get("NODE_BINARY") or shutil.which("node") or (str(bundled) if bundled.is_file() else None)


class ReferenceTests(unittest.TestCase):
    def test_public_https_urls_keep_real_query_parameters_and_labels(self):
        refs = [{"label": "国家博物馆：藏品记录", "url": SOURCE}]
        self.assertEqual(validate_references(refs), refs)
        self.assertTrue(public_reference_url("https://www.example.org:443/archive?id=12&dep=P#entry"))
        self.assertTrue(public_reference_url("https://www.example.org./archive"))
        self.assertTrue(public_reference_url("https://münchen.example.org/资料"))
        record = compile_markdown(markdown())["payload"]["documents"]["zh-CN"]["records"][0]
        self.assertEqual(record["references"][0]["url"], SOURCE)
        self.assertEqual(record["references"][0]["label"], "National Museum — Complete Collection Record")

    def test_nonpublic_or_ambiguous_urls_are_rejected(self):
        bad = ["http://www.example.org/", "//www.example.org/", "javascript:alert(1)",
               "file:///C:/Users/user/file", "https://user:secret@example.org/",
               "https://@example.org/", "https://example.org:444/", "https://example.org:bad/",
               "https://127.0.0.1/", "https://8.8.8.8/", "https://127.1/", "https://0x7f.0.0.1/",
               "https://2130706433/", "https://[::1]/", "https://[2606:4700:4700::1111]/",
               "https://localhost/", "https://printer/", "https://foo.local/", "https://foo.internal/",
               "https://foo.lan/", "https://foo.home/", "https://foo.test/", "https://foo.invalid/",
               "https://foo.onion/", "https://sub.localhost/", "https://example.org/%00",
               "https://example.org/%0A", "https://example.org/%C2%85", "https://example.org/%ZZ",
               "https://example.org/\n", "https://example.org/\\file", "https://exa mple.org/"]
        for url in bad:
            with self.subTest(url=url):
                self.assertFalse(public_reference_url(url))
                with self.assertRaises(ValueError):
                    validate_references([{"label": "Source", "url": url}])

    def test_reference_shape_limits_and_private_labels_are_strict(self):
        good = {"label": "Source", "url": SOURCE}
        for refs in ([], [good] * 7, {}, [{"label": "Source", "url": SOURCE, "note": "private"}]):
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                validate_references(refs)
        for label in ("", "x" * 121, "<b>Source</b>", "Source\tlabel", "Source\x7f", "Source\x85",
                      "C:/Users/private/file", "\\\\server\\share", "/Users/person/file", "/home/user/file",
                      "/tmp/private", "/mnt/private", "file:///private"):
            with self.subTest(label=label), self.assertRaises(ValueError):
                validate_references([{"label": label, "url": SOURCE}])
        bad = compile_markdown(markdown())["payload"]["documents"]["zh-CN"]
        bad["records"][0]["references"][0]["url"] = "https://127.0.0.1/"
        with self.assertRaises(ValueError):
            validate_catalog(bad)


class CompilerTests(unittest.TestCase):
    def test_headers_are_named_dates_stay_partial_and_languages_share_record_identity(self):
        headers = list(reversed(HEADERS))
        compiled = compile_markdown(markdown(rows=[row(), row(id="return", start="", end="", title="返回")], headers=headers))
        zh, en = (compiled["payload"]["documents"][key] for key in ("zh-CN", "en"))
        self.assertEqual((zh["records"][0]["start"], zh["records"][0]["end"]), ("0742", ""))
        self.assertEqual((zh["records"][1]["start"], zh["records"][1]["end"]), ("", ""))
        for index, (a, b) in enumerate(zip(zh["records"], en["records"])):
            self.assertEqual(a["id"], "person-marx-" + ("first" if index == 0 else "return"))
            for key in ("id", "start", "end", "lat", "lon", "certainty", "sequence"):
                self.assertEqual(a[key], b[key])
            self.assertEqual(a["sequence"], index)
            for absent in ("groupId", "baseReturn", "returnAfter", "ongoing", "stayType"):
                self.assertNotIn(absent, a)
        self.assertEqual(zh["records"][0]["description"], "只保留事实")
        self.assertEqual(en["records"][0]["description"], "Facts only")
        self.assertNotIn("http", zh["records"][0]["description"])
        self.assertNotIn("时间与城市证据", json.dumps(compiled["payload"], ensure_ascii=False))
        self.assertEqual(compiled["manifest"]["record_count"], 2)

    def test_existing_journey_fields_are_kept_only_for_the_authors_explicit_columns(self):
        optional = ["album", "stayType", "groupId", "sequence", "ongoing", "baseReturn", "returnAfter"]
        source_row = row(start="2026-04", end="", album="/photos/example/", stayType="base",
                         groupId="existing-group", sequence="18", ongoing="true", baseReturn="true")
        compiled = compile_markdown(markdown("xie-yuqing", rows=[source_row], headers=HEADERS + optional))
        for document in compiled["payload"]["documents"].values():
            value = document["records"][0]
            self.assertEqual(value["album"], "/photos/example/")
            self.assertEqual(value["sequence"], 18)
            self.assertEqual(value["groupId"], "person-xie-yuqing-existing-group")
            self.assertTrue(value["ongoing"])
            self.assertTrue(value["baseReturn"])
            self.assertNotIn("returnAfter", value)
        with self.assertRaises(ValueError):
            compile_markdown(markdown("marx", headers=HEADERS + optional))
        for changed in (dict(ongoing="yes"), dict(sequence="1.5"), dict(returnAfter="true")):
            bad = source_row | changed
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                compile_markdown(markdown("xie-yuqing", rows=[bad], headers=HEADERS + optional))

    def test_duplicate_ids_unsafe_text_invalid_dates_and_mismatched_metadata_fail(self):
        cases = [
            markdown(rows=[row(), row()]),
            markdown(rows=[row(id="x" * 80)]),
            markdown(rows=[row(start="0000")]),
            markdown(rows=[row(start="0742-13")]),
            markdown(rows=[row(start="2023-02-29")]),
            markdown(rows=[row(start="1849", end="1848")]),
            markdown(rows=[row(lat="NaN")]),
            markdown(rows=[row(lon="181")]),
            markdown(rows=[row(title="<b>Title</b>")]),
            markdown(rows=[row(description="C:/Users/private/person.md")]),
            markdown(rows=[row(source="[bad](https://private.local/)")]),
            markdown(rows=[row(country_en="")]),
            markdown().replace("person_id: marx", "person_id: unknown"),
            markdown().replace("name: 示例人物", "name: 示例人物\nname: 重复"),
            markdown().replace("scope:", "extra: nope\nscope:"),
            markdown(headers=HEADERS[:-1]),
            markdown() + "\n```footprints\n{}\n```\n",
        ]
        for source in cases:
            with self.subTest(source=source[:100]), self.assertRaises(ValueError):
                compile_markdown(source)
        with self.assertRaises(ValueError):
            compile_markdown(markdown(), "engels")

    def test_sources_are_deduplicated_and_referenced_by_both_languages(self):
        data = compile_markdown(markdown(rows=[row(), row(id="second")]))["payload"]
        self.assertEqual(len(data["sources"]), 2)
        validate_payload(data)
        for change in ("mirror", "missing-source", "private-source", "extra-payload", "invented-return"):
            bad = deepcopy(data)
            if change == "mirror": bad["documents"]["en"]["records"][0]["start"] = "0743"
            if change == "missing-source": bad["sources"].pop()
            if change == "private-source": bad["sources"][0]["url"] = "https://private.home/"
            if change == "extra-payload": bad["private_notes"] = "not public"
            if change == "invented-return": bad["documents"]["zh-CN"]["records"][0].update(stayType="visit", returnAfter=True)
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_payload(bad)

    def test_source_limits_cover_six_per_record_and_forty_per_person(self):
        six = "；".join("[Source](https://www.example.org/source/" + str(i) + ")" for i in range(6))
        self.assertEqual(len(compile_markdown(markdown(rows=[row(source=six)]))["payload"]["sources"]), 6)
        with self.assertRaises(ValueError):
            compile_markdown(markdown(rows=[row(source=six + "；[Seven](https://www.example.org/seven)")]))
        rows = [row(id="row-" + str(i), source="；".join("[Source](https://www.example.org/" + str(i * 5 + j) + ")" for j in range(5))) for i in range(8)]
        self.assertEqual(len(compile_markdown(markdown(rows=rows))["payload"]["sources"]), 40)
        rows.append(row(id="row-8", source="[Last](https://www.example.org/forty-one)"))
        with self.assertRaisesRegex(ValueError, "40"):
            compile_markdown(markdown(rows=rows))

    def test_the_markdown_download_preserves_research_and_has_one_roundtrippable_block(self):
        source = markdown()
        compiled = compile_markdown(source)
        self.assertTrue(compiled["markdown"].startswith(source))
        self.assertEqual(compiled["markdown"].count("```footprints"), 1)
        with TemporaryDirectory() as folder:
            path = Path(folder) / "download.md"
            path.write_text(compiled["markdown"], encoding="utf-8")
            self.assertEqual(validate_catalog(read_document(path)), compiled["payload"]["documents"]["zh-CN"])
        if node_binary():
            program = "const M=require(process.argv[1]); let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(M.parse(s))));"
            result = subprocess.run([node_binary(), "-e", program, str(ROOT / "home/assets/map-model.js")],
                                    input=compiled["markdown"], text=True, encoding="utf-8", capture_output=True, check=True)
            self.assertEqual(json.loads(result.stdout), compiled["payload"]["documents"]["zh-CN"])


class PeoplePublicationTests(unittest.TestCase):
    def test_missing_fixture_directory_can_be_empty_but_present_partial_library_cannot(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(load_people(root)["manifest"], {"version": 1, "people": []})
            with self.assertRaises(ValueError):
                load_people(root, require_complete=True)
            paths = library(root)
            self.assertEqual(len(load_people(root)["manifest"]["people"]), 8)
            (paths / "lenin.md").unlink()
            with self.assertRaisesRegex(ValueError, "incomplete"):
                load_people(root)

    def test_utf8_size_links_and_unlisted_files_are_checked_before_publication(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            paths = library(root)
            source = paths / "marx.md"
            good = source.read_bytes()
            for invalid in (b"\xff", b"\xef\xbb\xbf" + good, b" " * (LIMIT + 1)):
                source.write_bytes(invalid)
                with self.assertRaises(ValueError):
                    load_people(root)
            source.write_bytes(good)
            (paths / "unreviewed.md").write_text("not part of the approved set", encoding="utf-8")
            with self.assertRaises(ValueError):
                load_people(root)
            (paths / "unreviewed.md").unlink()
            with patch.object(Path, "is_symlink", lambda path: path.name == "people"):
                with self.assertRaisesRegex(ValueError, "symlinks"):
                    load_people(root)
            with patch.object(Path, "is_junction", lambda path: path.name == "people", create=True):
                with self.assertRaisesRegex(ValueError, "junctions"):
                    load_people(root)

    def test_publication_writes_only_lazy_assets_and_refuses_linked_destinations(self):
        with TemporaryDirectory() as folder:
            root, output = Path(folder) / "root", Path(folder) / "output"
            library(root)
            bundle = load_people(root)
            publish_people(output, bundle)
            targets = output / "assets/footprints-people"
            self.assertEqual(len(list(targets.iterdir())), 16)
            for person_id in PEOPLE_IDS:
                self.assertEqual(json.loads((targets / (person_id + ".json")).read_text(encoding="utf-8")), bundle["payloads"][person_id])
                self.assertEqual((targets / (person_id + ".md")).read_text(encoding="utf-8").count("```footprints"), 1)
            with patch.object(Path, "is_symlink", lambda path: path.name == "footprints-people"):
                with self.assertRaises(ValueError):
                    publish_people(output, bundle)
            bad = deepcopy(bundle)
            bad["payloads"]["marx"]["documents"]["en"]["records"][0]["lat"] = 90
            with self.assertRaises(ValueError):
                publish_people(output, bad)

    def test_maker_embeds_only_lazy_index_and_author_has_no_people_library(self):
        compiled = compile_markdown(markdown())
        bundle = {"manifest": {"version": 1, "people": [compiled["manifest"]]},
                  "payloads": {"marx": compiled["payload"]}, "markdowns": {"marx": compiled["markdown"]}}
        empty = {"version": 1, "title": "Synthetic empty map", "records": []}
        with TemporaryDirectory() as folder:
            output = Path(folder)
            with patch("footprints_people.load_people", return_value=bundle):
                build_map(ROOT, output, "https://example.org", empty, maker=True)
            page = (output / "game/footprints/index.html").read_text(encoding="utf-8")
            index = json.loads(re.search(r'<script id="footprints-people-data"[^>]*>(.*?)</script>', page, re.S)[1])
            initial = json.loads(re.search(r'<script id="footprints-data"[^>]*>(.*?)</script>', page, re.S)[1])
            self.assertEqual(initial["records"], [])
            self.assertEqual(index, bundle["manifest"])
            self.assertNotIn("person-marx-first", page)
            self.assertNotIn('"documents"', json.dumps(index))
            with patch("footprints_people.load_people", side_effect=AssertionError("Author must not load people")):
                build_map(ROOT, output, "https://example.org", empty)
            author = (output / "map/index.html").read_text(encoding="utf-8")
            value = json.loads(re.search(r'<script id="footprints-people-data"[^>]*>(.*?)</script>', author, re.S)[1])
            self.assertEqual(value, {"version": 1, "people": []})


class ProductionLibraryTests(unittest.TestCase):
    def test_all_eight_reviewed_files_compile_with_sources_and_bilingual_mirrors(self):
        bundle = load_people(ROOT, require_complete=True)
        self.assertEqual([person["id"] for person in bundle["manifest"]["people"]], list(PEOPLE_IDS))
        self.assertEqual(set(bundle["payloads"]), set(PEOPLE_IDS))
        for payload in bundle["payloads"].values():
            validate_payload(payload)
            self.assertTrue(all(record["references"] for record in payload["documents"]["zh-CN"]["records"]))
            self.assertTrue(all(len(source["label"]) <= 120 for source in payload["sources"]))
        xie = bundle["payloads"]["xie-yuqing"]["documents"]
        catalog = json.loads((ROOT / "map/catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(len(xie["zh-CN"]["records"]), len(catalog["records"]))
        self.assertEqual(len(catalog["records"]), 54)
        self.assertEqual(len({record["groupId"] for record in xie["zh-CN"]["records"]}), 29)
        for original, chinese, english in zip(catalog["records"], xie["zh-CN"]["records"], xie["en"]["records"]):
            for key, value in original.items():
                expected = "person-xie-yuqing-" + value if key in {"id", "groupId"} else value
                if key == "title":
                    self.assertTrue(chinese["title"].endswith(" · " + value))
                else:
                    self.assertEqual(chinese[key], expected, key)
                if key not in {"city", "region", "country", "title", "description"}:
                    self.assertEqual(chinese[key], english[key], key)


if __name__ == "__main__":
    unittest.main()
