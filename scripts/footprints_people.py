"""Compile the reviewed public people Markdown into lazy bilingual map assets.

The table is the sole content source. Generated downloads append an import block;
the reviewed Markdown is never rewritten, and no private timeline is discovered.
"""
from html import unescape
import json
from pathlib import Path
import re

from map_pages import (LIMIT, PRIVATE_PATH, _table_cells, _text,
                       validate_catalog, validate_references)

PEOPLE_IDS = ("xie-yuqing", "li-bai", "su-shi", "marx", "engels", "lenin",
              "mao-zedong", "che-guevara")
COLUMNS = {"id", "start", "end", "city", "region", "country", "lat", "lon",
           "title", "description", "source", "certainty", "city_en", "region_en",
           "country_en", "title_en", "description_en"}
JOURNEY_COLUMNS = {"album", "stayType", "groupId", "sequence", "ongoing", "baseReturn", "returnAfter"}
FRONT_FIELDS = {"person_id", "name", "english_name", "scope"}
LINK_START = re.compile(r"\[([^\]\n]+)\]\(")


def _safe_path(root, target):
    root, target = Path(root).absolute(), Path(target).absolute()
    if not target.is_relative_to(root):
        raise ValueError("People assets must remain inside their declared root.")
    for part in (target, *target.parents):
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            raise ValueError("People assets cannot traverse symlinks or junctions.")
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError("People asset path escapes its declared root.")
    return target


def _plain(value, label, maximum, required=True):
    _text(value, label, maximum, required)
    if any(ord(char) < 32 or 127 <= ord(char) <= 159 or char in "<>" for char in value):
        raise ValueError("People fields must be plain text: " + label)
    return value.strip()


def _scalar(value):
    value = value.strip()
    if value.startswith('"'):
        try:
            result = json.loads(value)
        except (ValueError, json.JSONDecodeError) as exc:
            raise ValueError("Invalid quoted people metadata.") from exc
        if not isinstance(result, str):
            raise ValueError("People metadata must be text.")
        return result
    if value.startswith("'"):
        if len(value) < 2 or not value.endswith("'"):
            raise ValueError("Invalid quoted people metadata.")
        return value[1:-1].replace("''", "'")
    if not value or re.search(r"[\[\]{}&*!|>#]", value) or value.endswith(("'", '"')):
        raise ValueError("People metadata needs a plain or quoted text value.")
    return value


def _links(value):
    """Read Markdown links, including balanced parentheses in HTTPS paths."""
    links = []
    for match in LINK_START.finditer(value):
        pos, depth, destination = match.end(), 0, []
        angle = pos < len(value) and value[pos] == "<"
        if angle:
            pos += 1
        while pos < len(value):
            char = value[pos]
            if angle and char == ">":
                if pos + 1 < len(value) and value[pos + 1] == ")":
                    links.append((match.group(1), "".join(destination), match.start()))
                break
            if not angle:
                if char == ")" and depth == 0:
                    links.append((match.group(1), "".join(destination), match.start()))
                    break
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
            if char.isspace():
                break
            destination.append(char)
            pos += 1
    return links


def _label(value):
    # Formatting is not part of a reference title; HTML is never interpreted.
    return unescape(re.sub(r"[*_`]", "", value)).strip(" \t—–:：，,。；;")


def _bibliography(lines):
    result = {}
    generic = re.compile(r"^(?:原文|来源|链接|官网|PDF|原始PDF|原文PDF|馆方供稿|出版书目信息|出版社公开样章 PDF)$", re.I)
    for line in lines:
        links = _links(line)
        if not links:
            continue
        prefix = _label(re.sub(r"^\s*(?:[-*+]\s+|\d+[.)、]\s*)", "", line[:links[0][2]]))
        prefix = re.sub(r"^[A-Z]\d+\s*[—–:：-]\s*", "", prefix)
        if re.fullmatch(r"[A-Z]\d+", prefix):
            prefix = ""
        for label, url, _ in links:
            label = _label(label)
            if prefix and generic.fullmatch(label):
                chosen = prefix
            elif prefix and label not in prefix:
                chosen = prefix + " — " + label
            else:
                chosen = label or prefix
            if len(chosen) > 120:
                titles = re.findall(r"《([^》]+)》", prefix)
                chosen = titles[0] if titles else label
            if len(chosen) > 120:
                # Full titles remain in the downloadable bibliography. The map
                # gets a readable bounded heading rather than a short ref code.
                heading = re.split(r"[:：]", chosen, maxsplit=1)[0]
                chosen = heading if len(heading) <= 120 else chosen[:119].rstrip() + "…"
            if not chosen:
                raise ValueError("A bibliography source needs a human-readable title at most 120 characters.")
            # The bibliography title wins over compact row labels such as M1.
            result.setdefault(url, _plain(chosen, "source title", 120))
    return result


def _json(value):
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2)
    if len(encoded.encode("utf-8")) > LIMIT:
        raise ValueError("A generated people document must be at most 1 MiB.")
    return encoded


def validate_payload(payload):
    if (not isinstance(payload, dict) or set(payload) != {"version", "id", "documents", "sources"}
            or type(payload.get("version")) is not int or payload["version"] != 1
            or payload.get("id") not in PEOPLE_IDS or not isinstance(payload.get("documents"), dict)
            or set(payload["documents"]) != {"zh-CN", "en"}):
        raise ValueError("A people payload needs its fixed identity and two version 1 documents.")
    sources = validate_references(payload["sources"], maximum=40)
    urls = {source["url"] for source in sources}
    if len(urls) != len(sources):
        raise ValueError("People sources must be deduplicated by URL.")
    for document in payload["documents"].values():
        validate_catalog(document)
        if not document["records"]:
            raise ValueError("A person needs reviewed records in both languages.")
        for index, record in enumerate(document["records"]):
            required = {"id", "start", "end", "city", "region", "country", "lat", "lon", "title",
                        "description", "album", "certainty", "sequence", "references"}
            allowed = required | (JOURNEY_COLUMNS if payload["id"] == "xie-yuqing" else set())
            if (not required.issubset(record) or set(record) - allowed
                    or not record["id"].startswith("person-" + payload["id"] + "-")):
                raise ValueError("Compiled people records need their namespace, source order and references only.")
            if "groupId" in record and not record["groupId"].startswith("person-" + payload["id"] + "-"):
                raise ValueError("People group identifiers need the same namespace as records.")
            if any(reference["url"] not in urls for reference in record["references"]):
                raise ValueError("A people record cites a source missing from its bibliography.")
    chinese, english = (payload["documents"][language]["records"] for language in ("zh-CN", "en"))
    mirror = ("id", "start", "end", "lat", "lon", "certainty", "sequence", *JOURNEY_COLUMNS)
    if len(chinese) != len(english) or any(any((field in a) != (field in b) or a.get(field) != b.get(field) for field in mirror)
                                        for a, b in zip(chinese, english)):
        raise ValueError("People language documents must preserve the same records, dates and coordinates.")
    _json(payload)
    return payload


def compile_markdown(text, expected_id=None):
    if not isinstance(text, str) or len(text.encode("utf-8")) > LIMIT or text.startswith("\ufeff"):
        raise ValueError("People Markdown must be strict UTF-8 and at most 1 MiB.")
    if any(ord(char) < 32 and char not in "\n\r\t" or 127 <= ord(char) <= 159 for char in text):
        raise ValueError("People Markdown contains a control character.")
    # Research notes are public downloads. Local file paths cannot hide in notes.
    without_urls = re.sub(r"https://[^\s<>]+", "", text, flags=re.I)
    if PRIVATE_PATH.search(without_urls) or re.search(r"file://|\\\\", without_urls, re.I):
        raise ValueError("People research Markdown cannot contain a private local path.")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("People Markdown needs frontmatter first.")
    try:
        front_end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("Unclosed people frontmatter.") from exc
    metadata = {}
    for line in lines[1:front_end]:
        match = re.fullmatch(r"([a-z_]+):\s*(.*)", line)
        if not match or match[1] not in FRONT_FIELDS or match[1] in metadata:
            raise ValueError("People frontmatter needs four unique supported fields.")
        metadata[match[1]] = _scalar(match[2])
    if set(metadata) != FRONT_FIELDS:
        raise ValueError("People frontmatter needs person_id, name, english_name and scope.")
    person_id = _plain(metadata["person_id"], "person_id", 40)
    if person_id not in PEOPLE_IDS or expected_id is not None and person_id != expected_id:
        raise ValueError("People identity does not match its fixed source filename.")
    name = _plain(metadata["name"], "name", 100)
    english_name = _plain(metadata["english_name"], "english_name", 100)
    scope = _plain(metadata["scope"], "scope", 240)
    header, table_at, fence = None, None, None
    for index in range(front_end + 1, len(lines)):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", lines[index])
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= fence[1] and not marker[2].strip():
                fence = None
            continue
        if marker:
            if marker[2].strip().lower() == "footprints":
                raise ValueError("The reviewed people table cannot contain a generated footprints block.")
            fence = (marker[1][0], len(marker[1]))
            continue
        if lines[index].lstrip().startswith("|"):
            cells = _table_cells(lines[index])
            if "id" in cells and "city" in cells:
                allowed = COLUMNS | (JOURNEY_COLUMNS if person_id == "xie-yuqing" else set())
                if not COLUMNS.issubset(cells) or set(cells) - allowed or len(set(cells)) != len(cells) or header:
                    raise ValueError("People Markdown needs one table with the 17 supported columns and permitted journey fields.")
                header, table_at = cells, index
    if fence:
        raise ValueError("Unclosed fenced block in people Markdown.")
    if header is None or table_at + 1 >= len(lines):
        raise ValueError("People Markdown needs its authoritative records table.")
    separator = _table_cells(lines[table_at + 1])
    if len(separator) != len(header) or not all(re.fullmatch(r":?-{3,}:?", cell) for cell in separator):
        raise ValueError("People records table needs a Markdown separator row.")
    rows, table_end = [], table_at + 2
    while table_end < len(lines) and lines[table_end].lstrip().startswith("|"):
        cells = _table_cells(lines[table_end])
        if len(cells) != len(header):
            raise ValueError("People table row has the wrong number of columns.")
        rows.append(dict(zip(header, cells)))
        table_end += 1
    if not 1 <= len(rows) <= 500:
        raise ValueError("A person needs 1 to 500 reviewed records.")
    bibliography = _bibliography(lines[table_end:])
    documents = {
        "zh-CN": {"version": 1, "title": name + " · 主要生平足迹", "records": []},
        "en": {"version": 1, "title": english_name + " — Major Life Footprints", "records": []},
    }
    sources = {}
    for sequence, row in enumerate(rows):
        raw_id = _plain(row["id"], "row id", 80)
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", raw_id):
            raise ValueError("People row id must be a safe identifier.")
        record_id = "person-" + person_id + "-" + raw_id
        if len(record_id) > 80:
            raise ValueError("Namespaced people record id exceeds 80 characters.")
        references = {}
        for label, url, _ in _links(row["source"]):
            references.setdefault(url, {"label": bibliography.get(url) or _label(label), "url": url})
        refs = validate_references(list(references.values()))
        for ref in refs:
            sources.setdefault(ref["url"], ref)
        if len(sources) > 40:
            raise ValueError("A person may cite at most 40 distinct sources.")
        try:
            lat, lon = float(row["lat"]), float(row["lon"])
        except ValueError as exc:
            raise ValueError("People coordinates must be numeric city-centre points.") from exc
        journey = {}
        for key in JOURNEY_COLUMNS:
            value = row.get(key, "")
            if value == "":
                continue
            if key in {"ongoing", "baseReturn", "returnAfter"}:
                if value not in {"true", "false"}:
                    raise ValueError("People journey flags must be true or false.")
                journey[key] = value == "true"
            elif key == "sequence":
                if not re.fullmatch(r"0|[1-9][0-9]*", value):
                    raise ValueError("A supplied people sequence must be an integer.")
                journey[key] = int(value)
            else:
                journey[key] = _plain(value, key, 200)
                if key == "groupId":
                    journey[key] = "person-" + person_id + "-" + journey[key]
        for language, suffix, person_name in (("zh-CN", "", name), ("en", "_en", english_name)):
            record = {"id": record_id, "start": row["start"], "end": row["end"],
                      "lat": lat, "lon": lon, "album": "", "certainty": row["certainty"],
                      "sequence": sequence, "references": refs}
            record.update(journey)
            for field, maximum, required in (("city", 160, True), ("region", 200, False),
                                             ("country", 160, True), ("title", 160, True),
                                             ("description", 12000, False)):
                record[field] = _plain(row[field + suffix], field + suffix, maximum, required)
            record["title"] = person_name + " · " + record["title"]
            documents[language]["records"].append(record)
    for document in documents.values():
        validate_catalog(document)
        _json(document)
    sources = validate_references(list(sources.values()), maximum=40)
    payload = {"version": 1, "id": person_id, "documents": documents, "sources": sources}
    validate_payload(payload)
    downloadable = text + ("" if text.endswith("\n") else "\n") + "\n```footprints\n" + _json(documents["zh-CN"]) + "\n```\n"
    if len(downloadable.encode("utf-8")) > LIMIT:
        raise ValueError("A downloadable people Markdown must be at most 1 MiB.")
    return {
        "payload": payload,
        "markdown": downloadable,
        "manifest": {"id": person_id, "label": {"zh-CN": name, "en": english_name},
                     "coverage": {"zh-CN": scope, "en": "Major places in this person's life, not a complete itinerary."},
                     "record_count": len(rows),
                     "document_url": "/assets/footprints-people/" + person_id + ".json",
                     "markdown": "/assets/footprints-people/" + person_id + ".md"},
    }


def load_people(root, *, require_complete=False):
    root = Path(root).absolute()
    directory = _safe_path(root, root / "map/people")
    empty = {"manifest": {"version": 1, "people": []}, "payloads": {}, "markdowns": {}}
    if not directory.exists():
        if require_complete:
            raise ValueError("The production people library needs all eight reviewed Markdown files.")
        return empty
    if not directory.is_dir():
        raise ValueError("The people library must be a regular directory.")
    expected = {person_id + ".md" for person_id in PEOPLE_IDS}
    entries = list(directory.iterdir())
    for entry in entries:
        _safe_path(root, entry)
        if entry.name not in expected or not entry.is_file():
            raise ValueError("Unsupported file in the reviewed people library: " + entry.name)
    if {entry.name for entry in entries} != expected:
        raise ValueError("The people library is incomplete; all eight reviewed Markdown files are required.")
    bundle = empty
    for person_id in PEOPLE_IDS:
        source = directory / (person_id + ".md")
        if source.stat().st_size > LIMIT:
            raise ValueError("People Markdown must be at most 1 MiB.")
        try:
            text = source.read_bytes().decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            raise ValueError("People Markdown must be strict UTF-8.") from exc
        compiled = compile_markdown(text, person_id)
        bundle["manifest"]["people"].append(compiled["manifest"])
        bundle["payloads"][person_id] = compiled["payload"]
        bundle["markdowns"][person_id] = compiled["markdown"]
    return bundle


def publish_people(output, bundle):
    """Write only fixed library filenames after validating every destination."""
    output = Path(output).absolute()
    directory = _safe_path(output, output / "assets/footprints-people")
    prepared = []
    for person_id, payload in bundle["payloads"].items():
        validate_payload(payload)
        if person_id not in PEOPLE_IDS or payload["id"] != person_id:
            raise ValueError("Invalid people publication identity.")
        for suffix, content in ((".json", _json(payload)), (".md", bundle["markdowns"][person_id])):
            target = _safe_path(output, directory / (person_id + suffix))
            if target.exists() and not target.is_file():
                raise ValueError("People asset destination must be a regular file.")
            if len(content.encode("utf-8")) > LIMIT:
                raise ValueError("People asset must be at most 1 MiB.")
            prepared.append((target, content))
    if not prepared:
        return
    directory.mkdir(parents=True, exist_ok=True)
    for target, content in prepared:
        target.write_text(content, encoding="utf-8", newline="")
