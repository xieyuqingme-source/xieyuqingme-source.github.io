"""Offline, Chinese-only Marx and Engels reading: validate public inputs before output."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
import json
import re

from markdown_it import MarkdownIt

CHINA = timezone(timedelta(hours=8))
ASSETS = ("marx.css", "marx.js", "marx-lab.js", "marx-play.js")
BRANCHES = {"philosophy": "哲学", "economics": "政治经济学", "socialism": "科学社会主义"}
LEVELS = {1: "唯心主义", 2: "形而上学", 3: "修正主义"}
VERDICTS = {"真", "假", "存疑", "部分正确", "张冠李戴"}
SLUG = re.compile(r"[a-z][a-z0-9-]{1,79}")
HEX = re.compile(r"[a-f0-9]{64}")
PRIVATE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|Obsidian Vault|/(?:Users|mnt)/", re.I)
RESERVED = {"wenji", "works", "capital", "sources", "qa", "tools", "play", "read", "quotes", "life", "lab", "topics", "cards"}
INTRO = "原著好啊，原著得读，我也想读原著。"
BASIS = "以《马克思恩格斯文集》（人民出版社，2009）为准；《资本论》第一卷在线文本据《马克思恩格斯全集》第23卷（1972）。"
AI_NOTE = "本站解读由 AI 辅助起草，引文逐字核对过所链原文"
HEADINGS = {"terms": ("白话", "例子", "身世", "常见误读"),
            "myths": ("流行说法", "证据", "结论"),
            "works": ("写作背景", "主要观点", "怎么读"),
            "guides": ("一句话", "关键概念", "读的时候注意", "常见误读"),
            "passage": ("导读", "逐句看", "可以接着读"), "between": ("对照", "为什么", "可以这样读"),
            "shelf": ("典故", "马恩怎样用", "可以接着读"),
            "parts": ("一句话", "这一篇在全书中的位置", "各章怎么读", "关键概念", "常见误读", "原文片段", "英文对应")}
PROSE_LIMITS = {"terms": (400, 900), "myths": (300, 800), "works": (500, 1000), "guides": (600, 1200), "passage": (300, 1000), "between": (250, 1000), "parts": (700, 1300), "shelf": (300, 1000)}


def fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError("读马恩：缺少字段或包含未知字段。")


def text(value, maximum=2000, multiline=False):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum or PRIVATE.search(value)
            or any(ord(c) < 32 and not (multiline and c in "\r\n\t") or ord(c) == 127 for c in value)):
        raise ValueError("读马恩：只能使用不含私人路径、控制字符的公开文字。")
    return value


def slug(value):
    if not isinstance(value, str) or not SLUG.fullmatch(value):
        raise ValueError("读马恩：无效的稳定ID。")
    return value


def source_path(root, relative):
    root = Path(root).resolve()
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise ValueError("读马恩：来源必须保存在公开仓库内。")
    current = path
    while current != root:
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ValueError("读马恩：不支持链接目录或链接文件。")
        current = current.parent
    return path


def source_url(value, language=None):
    text(value, 1600)
    parts = urlsplit(value)
    decoded = unquote(parts.path)
    if (parts.scheme != "https" or not parts.hostname or "." not in parts.hostname or parts.username
            or parts.password or parts.port not in (None, 443) or re.search(r"[<>\\\x00-\x20\x7f]", unquote(value))):
        raise ValueError("读马恩：来源必须是安全的公开HTTPS网址。")
    if language:
        prefix = "/chinese/" if language == "zh" else "/archive/"
        if parts.hostname != "www.marxists.org" or not decoded.startswith(prefix) or any(p in (".", "..") for p in decoded.split("/")):
            raise ValueError("读马恩：原文须链接中马库中文正文，英文对照须链接MIA英文档案。")
    return value


def iso(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\d", value):
        raise ValueError("读马恩：核对日期须为ISO日期。")
    return date.fromisoformat(value)


def fingerprint(value):
    if not isinstance(value, str) or not HEX.fullmatch(value):
        raise ValueError("读马恩：来源指纹应为SHA-256。")


def text_hash(value):
    return sha256(value.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")).hexdigest()


def pages(value):
    if value is not None and (not isinstance(value, list) or len(value) != 2 or type(value[0]) is not int
            or value[0] < 1 or value[1] is not None and (type(value[1]) is not int or value[1] < value[0])):
        raise ValueError("读马恩：页码范围只能来自目录，不得倒置。")


def branches(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 3 or len(set(value)) != len(value) or set(value) - BRANCHES.keys():
        raise ValueError("读马恩：需要1–3个不重复的理论分支。")


def english_links(items):
    if not isinstance(items, list):
        raise ValueError("读马恩：英文对应使用数组，以保留一对多章节关系。")
    for item in items:
        fields(item, ("no", "title", "url"))
        if type(item["no"]) is not int or item["no"] < 1:
            raise ValueError("读马恩：英文对应章号无效。")
        text(item["title"], 300)
        source_url(item["url"], "en")


def nested_sections(items, capital=False):
    if not isinstance(items, list):
        raise ValueError("读马恩：篇节目录须为显式数组。")
    for item in items:
        fields(item, ("title", "mia"), ("pages", "sections", "en"))
        text(item["title"], 500)
        source_url(item["mia"], "zh")
        if "pages" in item:
            pages(item["pages"])
        if "en" in item:
            if not capital:
                raise ValueError("读马恩：英文章号只用于资本论对应表。")
            english_links(item["en"])
        if "sections" in item:
            nested_sections(item["sections"], capital)


def section_urls(items):
    result = set()
    for item in items:
        result.add(item["mia"].split("#")[0])
        result.update(section_urls(item.get("sections", [])))
    return result


def primary_source_url(value, work):
    source_url(value, "zh")
    prefix = ("/chinese/marx/capital/" if work["volume"] == 5
              else f'/chinese/marx-engels2/{work["volume"]:02}/')
    if (not urlsplit(value).path.startswith(prefix)
            or value.split("#")[0] not in work["primary_urls"]):
        raise ValueError("读马恩：所引网页不是这部作品与约定版别的原著正文。")


def directory_starts(work, url):
    result = set()
    def visit(item):
        if item.get("pages") and item["mia"].split("#")[0] == url.split("#")[0]:
            result.add(item["pages"][0])
        for section in item.get("sections", []):
            visit(section)
    visit(work)
    return result


def html_prose_characters(value):
    """Count explanation text, not headings, footers, metadata or original excerpts."""
    class Prose(HTMLParser):
        def __init__(self):
            super().__init__()
            self.stack, self.count = [], 0
        def handle_starttag(self, tag, attrs):
            if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
                self.stack.append((tag, "me-prose" in dict(attrs).get("class", "").split()))
        def handle_endtag(self, tag):
            for index in range(len(self.stack) - 1, -1, -1):
                if self.stack[index][0] == tag:
                    del self.stack[index:]
                    break
        def handle_data(self, data):
            if any(prose for _, prose in self.stack) and not any(tag in {"h1", "h2", "h3", "h4", "nav", "blockquote", "del", "ins", "script", "style"} for tag, _ in self.stack):
                self.count += len(re.findall(r"[\u3400-\u9fff]", data))
    parser = Prose()
    parser.feed(value)
    return parser.count


def validate_wenji(data):
    fields(data, ("version", "edition", "volumes"))
    if type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("读马恩：未知文集数据版本。")
    edition = data["edition"]
    fields(edition, ("name", "compiler", "publisher", "year", "capital_note"), ("mia",))
    for name in ("name", "compiler", "publisher", "capital_note"):
        text(edition[name], 1000)
    if type(edition["year"]) is not int or edition["year"] != 2009 or "人民出版社" not in edition["publisher"]:
        raise ValueError("读马恩：本版以2009人民出版社文集为准。")
    if "mia" in edition:
        source_url(edition["mia"], "zh")
    if not isinstance(data["volumes"], list) or [v.get("no") for v in data["volumes"]] != list(range(1, 11)):
        raise ValueError("读马恩：十卷须完整、依序且不能重复。")
    works = {}
    for volume in data["volumes"]:
        fields(volume, ("no", "title", "span", "summary", "mia", "works"), ("letters", "timeline"))
        if type(volume["no"]) is not int:
            raise ValueError("读马恩：文集卷号须为整数。")
        for name in ("title", "span", "summary"):
            text(volume[name], 80 if name == "summary" else 300)
        source_url(volume["mia"], "zh")
        if not isinstance(volume["works"], list):
            raise ValueError("读马恩：每卷须有明确的作品目录。")
        for work in volume["works"]:
            fields(work, ("id", "title", "author", "year", "pages", "excerpt", "editor_title", "branch", "level", "mia"),
                   ("guide", "kind", "sections", "year_note"))
            slug(work["id"])
            if work["id"] in works or work["author"] not in ("marx", "engels", "marx-engels"):
                raise ValueError("读马恩：作品ID重复或作者不明确。")
            text(work["title"], 500)
            if work["year"] is not None:
                if type(work["year"]) is int:
                    if not 1800 <= work["year"] <= 1895:
                        raise ValueError("读马恩：写作年不在作者生存年代。")
                else:
                    text(work["year"], 80)
            if "year_note" in work:
                text(work["year_note"], 500)
            pages(work["pages"])
            if type(work["excerpt"]) is not bool or type(work["editor_title"]) is not bool:
                raise ValueError("读马恩：节选与编者标题须明确标记。")
            branches(work["branch"])
            if type(work["level"]) is not int or work["level"] not in LEVELS:
                raise ValueError("读马恩：作品难度无效。")
            source_url(work["mia"], "zh")
            if "guide" in work:
                slug(work["guide"])
            if work.get("kind", "work") not in ("work", "appendix", "front_matter"):
                raise ValueError("读马恩：作品目录类型无效。")
            if "sections" in work:
                nested_sections(work["sections"])
            works[work["id"]] = {**work, "volume": volume["no"],
                                 "primary_urls": {work["mia"].split("#")[0], *section_urls(work.get("sections", []))}}
        if "letters" in volume:
            if volume["no"] != 10 or not isinstance(volume["letters"], list):
                raise ValueError("读马恩：书信目录只属于第10卷。")
            seen = set()
            for letter in volume["letters"]:
                fields(letter, ("no", "year", "title", "mia"))
                if type(letter["no"]) is not int or letter["no"] in seen or letter["no"] < 1:
                    raise ValueError("读马恩：书信序号无效或重复。")
                if type(letter["year"]) is not int or not 1830 <= letter["year"] <= 1895:
                    raise ValueError("读马恩：书信年份无效。")
                seen.add(letter["no"])
                text(letter["title"], 500)
                source_url(letter["mia"], "zh")
                ident = f'letter-{letter["no"]:03}'
                works[ident] = {**letter, "id": ident, "volume": 10, "pages": None,
                                "primary_urls": {letter["mia"].split("#")[0]}}
            if sorted(seen) != list(range(1, 281)):
                raise ValueError("读马恩：书信目录须完整收录280封。")
        if "timeline" in volume:
            fields(volume["timeline"], ("title", "mia"))
            text(volume["timeline"]["title"], 200)
            source_url(volume["timeline"]["mia"], "zh")
    return works


def validate_capital(data, works):
    fields(data, ("version", "volumes", "routes"))
    if type(data["version"]) is not int or data["version"] != 1 or not isinstance(data["volumes"], list) or [v.get("no") for v in data["volumes"]] != [1, 2, 3]:
        raise ValueError("读马恩：资本论三卷须完整依序。")
    all_chapters = {}
    for volume in data["volumes"]:
        fields(volume, ("no", "title", "wenji_volume", "mia", "parts", "front_matter"), ("en", "supplements"))
        if type(volume["no"]) is not int or type(volume["wenji_volume"]) is not int:
            raise ValueError("读马恩：资本论和文集卷号须为整数。")
        if volume["wenji_volume"] != volume["no"] + 4 or "capital-" + str(volume["no"]) not in works:
            raise ValueError("读马恩：资本论与文集卷次不符。")
        text(volume["title"], 300)
        source_url(volume["mia"], "zh")
        work_sources = {volume["mia"].split("#")[0]}
        nested_sections(volume["front_matter"], True)
        nested_sections(volume.get("supplements", []), True)
        work_sources.update(section_urls([s for s in volume["front_matter"] if not s["title"].endswith("说明")]))
        work_sources.update(section_urls(volume.get("supplements", [])))
        if "en" in volume:
            fields(volume["en"], ("title", "url", "translator", "published", "note"))
            for field in ("title", "translator", "note"):
                text(volume["en"][field], 1200)
            source_url(volume["en"]["url"], "en")
            if volume["en"]["published"] is not None and type(volume["en"]["published"]) is not int:
                raise ValueError("读马恩：英文版本须标记所引版本年份。")
        if not isinstance(volume["parts"], list) or [p.get("no") for p in volume["parts"]] != list(range(1, (7, 3, 7)[volume["no"] - 1] + 1)):
            raise ValueError("读马恩：资本论篇数或次序不符。")
        chapters, en_numbers = [], []
        for part in volume["parts"]:
            fields(part, ("no", "title", "chapters"), ("guide",))
            if type(part["no"]) is not int:
                raise ValueError("读马恩：篇号须为整数。")
            text(part["title"], 300)
            if "guide" in part:
                slug(part["guide"])
            if not isinstance(part["chapters"], list) or not part["chapters"]:
                raise ValueError("读马恩：篇的章节不能留空。")
            for chapter in part["chapters"]:
                fields(chapter, ("no", "title", "mia", "sections"), ("en", "guide"))
                if type(chapter["no"]) is not int:
                    raise ValueError("读马恩：中文章号须为整数。")
                text(chapter["title"], 500)
                source_url(chapter["mia"], "zh")
                nested_sections(chapter["sections"], True)
                work_sources.add(chapter["mia"].split("#")[0])
                work_sources.update(section_urls(chapter["sections"]))
                if volume["no"] == 1 and not chapter.get("en"):
                    raise ValueError("读马恩：第一卷每章须有真实英文对应。")
                if "en" in chapter:
                    english_links(chapter["en"])
                    en_numbers.extend(item["no"] for item in chapter["en"])
                if "guide" in chapter:
                    slug(chapter["guide"])
                chapters.append(chapter["no"])
                all_chapters[(volume["no"], chapter["no"])] = {**chapter, "part_no": part["no"], "part_guide": part.get("guide")}
        if chapters != list(range(1, (25, 21, 52)[volume["no"] - 1] + 1)):
            raise ValueError("读马恩：资本论章节缺少、重复或倒序。")
        if volume["no"] == 1 and en_numbers != list(range(1, 34)):
            raise ValueError("读马恩：第一卷中英对应须逐一覆盖英文33章。")
        works["capital-" + str(volume["no"])]["primary_urls"] = work_sources
    route_ids = set()
    for route in data["routes"]:
        fields(route, ("id", "title", "summary", "basis", "steps"))
        slug(route["id"])
        if route["id"] in route_ids:
            raise ValueError("读马恩：阅读路线ID重复。")
        route_ids.add(route["id"])
        text(route["title"], 200)
        text(route["summary"], 1200)
        fields(route["basis"], ("work", "locator", "url"))
        if route["basis"]["work"] not in works:
            raise ValueError("读马恩：阅读路线依据的作品不存在。")
        text(route["basis"]["locator"], 500)
        source_url(route["basis"]["url"], "zh")
        if not isinstance(route["steps"], list) or not route["steps"]:
            raise ValueError("读马恩：阅读路线不能为空。")
        for step in route["steps"]:
            fields(step, ("title", "note"), ("work", "volume", "chapter", "section"))
            text(step["title"], 300)
            text(step["note"], 1200)
            if "work" in step and step["work"] not in works:
                raise ValueError("读马恩：路线引用未知作品。")
            if "chapter" in step and (step.get("volume"), step["chapter"]) not in all_chapters:
                raise ValueError("读马恩：路线引用未知章。")
            if "work" not in step and "chapter" not in step:
                raise ValueError("读马恩：阅读步骤须指向作品或具体章节。")
    return all_chapters


def markdown_sections(body):
    text(body, 24000, multiline=True)
    parser = MarkdownIt("commonmark", {"html": False})
    lines, starts = body.replace("\r\n", "\n").splitlines(), []
    tokens = parser.parse(body)
    for index, token in enumerate(tokens):
        if token.type in ("html_block", "html_inline", "image", "fence", "code_block", "blockquote_open"):
            raise ValueError("读马恩：正文只使用普通Markdown文字，不嵌HTML、图片或程序。")
        if token.type == "heading_open":
            if token.tag != "h2":
                raise ValueError("读马恩：正文采用统一H2小节。")
            starts.append((tokens[index + 1].content, token.map[0], token.map[1]))
        for child in token.children or []:
            if child.type == "image" or child.type == "html_inline":
                raise ValueError("读马恩：第一版不嵌图片或原始HTML。")
            if child.type == "link_open":
                href = child.attrGet("href") or ""
                if href.startswith(("/marx/", "/english/", "/anthology/")):
                    decoded = unquote(href)
                    if any(part in (".", "..") for part in urlsplit(decoded).path.split("/")) or re.search(r"[<>\\\x00-\x20\x7f]", decoded):
                        raise ValueError("读马恩：站内阅读链接不能包含路径跳转或控制字符。")
                else:
                    source_url(href)
    if not starts or any(lines[:starts[0][1]]):
        raise ValueError("读马恩：正文应从小节标题开始。")
    found = {}
    for index, (heading, start, end) in enumerate(starts):
        content = "\n".join(lines[end:starts[index + 1][1] if index + 1 < len(starts) else len(lines)]).strip()
        if heading in found or not content:
            raise ValueError("读马恩：小节不能为空或重复。")
        found[heading] = content
    return found


def prose_characters(body):
    # Do not let long URLs, headings or Markdown syntax inflate the quotation budget.
    body = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", body)
    body = re.sub(r"^##[^\n]*", "", body, flags=re.M)
    return len(re.findall(r"[\u3400-\u9fff]", body))


def content_route(item, kind="cards"):
    if kind == "works":
        return "/marx/works/" + item["slug"] + "/"
    if kind == "guides":
        return f'/marx/capital/{item["volume"]}/ch{item["chapter"]:02}/'
    if kind == "parts":
        return f'/marx/capital/{item["volume"]}/part{item["part"]}/'
    return "/marx/" + item["slug"] + "/"


def validate_citations(data, review, errata, works):
    fields(data, ("version", "items"))
    fields(review, ("version", "items", "works"))
    fields(errata, ("version", "items"))
    if any(type(obj["version"]) is not int or obj["version"] != 1 for obj in (data, review, errata)):
        raise ValueError("读马恩：引文、核查或校勘版本无效。")
    for obj in (data, review, errata):
        if not isinstance(obj["items"], list):
            raise ValueError("读马恩：来源记录须为数组。")
    corrections = {}
    for correction in errata["items"]:
        fields(correction, ("id", "url", "wrong", "right", "basis", "checked_on"), ("evidence_url",))
        slug(correction["id"])
        if correction["id"] in corrections:
            raise ValueError("读马恩：校勘ID重复。")
        source_url(correction["url"], "zh")
        for field in ("wrong", "right", "basis"):
            text(correction[field], 1800)
        if correction["wrong"] == correction["right"]:
            raise ValueError("读马恩：校勘前后不能相同。")
        if "evidence_url" in correction:
            source_url(correction["evidence_url"], "zh")
        iso(correction["checked_on"])
        corrections[correction["id"]] = correction
    citations, records = {}, {}
    for record in review["items"]:
        fields(record, ("id", "quote_sha256", "source_body_sha256", "locator", "method", "errata"))
        if record["id"] in records:
            raise ValueError("读马恩：核对记录ID重复。")
        fingerprint(record["quote_sha256"])
        fingerprint(record["source_body_sha256"])
        text(record["locator"], 1200)
        text(record["method"], 2400)
        if not isinstance(record["errata"], list) or set(record["errata"]) - corrections.keys():
            raise ValueError("读马恩：核对记录引用了不存在的校勘。")
        records[record["id"]] = record
    for citation in data["items"]:
        fields(citation, ("id", "vol", "work", "locator", "page", "page_kind", "edition", "text", "url", "errata", "checked_on"), ("en",))
        ident = slug(citation["id"])
        if ident in citations or citation["work"] not in works:
            raise ValueError("读马恩：引文ID重复或作品不存在。")
        work = works[citation["work"]]
        if type(citation["vol"]) is not int or citation["vol"] != work["volume"]:
            raise ValueError("读马恩：引文与作品卷次不一致。")
        text(citation["text"], 150)
        text(citation["locator"], 1200)
        primary_source_url(citation["url"], work)
        iso(citation["checked_on"])
        expected_edition = "quanji-23-1972" if citation["vol"] == 5 else "wenji-2009"
        if citation["edition"] != expected_edition:
            raise ValueError("读马恩：引文版别不符合本轮约定。")
        if citation["vol"] == 5 and citation["page"] is not None:
            raise ValueError("读马恩：不得给1972版正文挂文集第5卷页码。")
        if citation["page"] is None:
            if citation["page_kind"] is not None:
                raise ValueError("读马恩：没有页码就不能标记页码类型。")
        elif (type(citation["page"]) is not int or citation["page"] < 1
              or citation["page_kind"] != "section_start"):
            raise ValueError("读马恩：第一版只允许目录起始页，不得声称精确引文页码。")
        if citation["page"] is not None and (citation["vol"] not in (1, 2, 3, 4) or citation["page"] not in directory_starts(work, citation["url"])):
            raise ValueError("读马恩：页码必须是第1—4卷该作品对应目录的真实起始页。")
        if not isinstance(citation["errata"], list) or len(set(citation["errata"])) != len(citation["errata"]) or set(citation["errata"]) - corrections.keys():
            raise ValueError("读马恩：引文校勘引用不完整。")
        for correction_id in citation["errata"]:
            if corrections[correction_id]["url"].split("#")[0] != citation["url"].split("#")[0]:
                raise ValueError("读马恩：不能把别的页面校勘套用到本引文。")
        if "en" in citation:
            fields(citation["en"], ("text", "url", "translator"))
            text(citation["en"]["text"], 1000)
            text(citation["en"]["translator"], 500)
            source_url(citation["en"]["url"], "en")
        record = records.get(ident)
        if (record is None or record["quote_sha256"] != text_hash(citation["text"])
                or record["locator"] != citation["locator"] or record["errata"] != citation["errata"]):
            raise ValueError("读马恩：引文与逐字核对记录不一致。")
        citations[ident] = citation
    if records.keys() != citations.keys():
        raise ValueError("读马恩：引文与核对记录应一一对应。")
    lengths = {}
    if not isinstance(review["works"], list):
        raise ValueError("读马恩：作品原文长度须有独立核对记录。")
    for record in review["works"]:
        fields(record, ("id", "characters", "source_body_sha256", "method", "urls"))
        if record["id"] in lengths or record["id"] not in works:
            raise ValueError("读马恩：作品长度记录重复或未知。")
        if type(record["characters"]) is not int or record["characters"] < 1:
            raise ValueError("读马恩：作品原文长度无效。")
        fingerprint(record["source_body_sha256"])
        text(record["method"], 2400)
        if not isinstance(record["urls"], list) or not record["urls"]:
            raise ValueError("读马恩：作品长度须有实际原文来源。")
        for url in record["urls"]:
            primary_source_url(url, works[record["id"]])
        lengths[record["id"]] = record
    if {c["work"] for c in citations.values()} - lengths.keys():
        raise ValueError("读马恩：每篇被引作品须有原文长度记录。")
    for citation in citations.values():
        urls = lengths[citation["work"]]["urls"]
        if citation["url"].split("#")[0] not in {url.split("#")[0] for url in urls}:
            raise ValueError("读马恩：引文不在该作品核对的正文范围内。")
    return citations, corrections, lengths


def validate_catalog(data, bodies, citations, works, chapters):
    fields(data, ("version", "columns", "cards", "works", "guides", "parts"))
    if type(data["version"]) is not int or data["version"] != 1 or not isinstance(data["columns"], list):
        raise ValueError("读马恩：栏目目录版本无效。")
    if [column.get("id") for column in data["columns"]] != ["terms", "myths", "passage", "between", "shelf"]:
        raise ValueError("读马恩：第二版须显式列出概念、考据、原著一段与中英之间四类卡片。")
    for column in data["columns"]:
        fields(column, ("id", "title", "description"))
        text(column["title"], 80)
        text(column["description"], 500)
    items = {}
    for kind in ("cards", "works", "guides", "parts"):
        if not isinstance(data[kind], list):
            raise ValueError("读马恩：卡片和导读须明确列出。")
        for item in data[kind]:
            required = ("slug", "title", "summary", "level", "branch", "tags", "citations", "related", "added", "status", "ai_assisted")
            required += {"cards": ("column",), "works": ("work",), "guides": ("volume", "chapter"), "parts": ("volume", "part", "chapter_notes")}[kind]
            optional = ("sources", "references") + (("term", "verdict") if kind == "cards" else ())
            fields(item, required, optional)
            ident = slug(item["slug"])
            if ident in items or ident in RESERVED:
                raise ValueError("读马恩：内容路径重复或占用了保留路由。")
            category = item["column"] if kind == "cards" else kind
            if category not in HEADINGS:
                raise ValueError("读马恩：未知内容类型。")
            if kind == "cards" and category == "terms":
                if "term" not in item or "verdict" in item:
                    raise ValueError("读马恩：概念卡须有术语，不应有考据判定。")
                text(item["term"], 100)
            if kind == "cards" and category == "myths" and (item.get("verdict") not in VERDICTS or "term" in item):
                raise ValueError("读马恩：考据卡需要明确、合规的判定。")
            if kind == "cards" and category in ("passage", "between") and ("term" in item or "verdict" in item):
                raise ValueError("读马恩：新精读栏目不接受术语卡或考据卡专用字段。")
            text(item["title"], 160)
            text(item["summary"], 120)
            branches(item["branch"])
            if type(item["level"]) is not int or item["level"] not in LEVELS:
                raise ValueError("读马恩：难度须为1、2或3。")
            if not isinstance(item["tags"], list) or not 1 <= len(item["tags"]) <= 8 or len(set(item["tags"])) != len(item["tags"]):
                raise ValueError("读马恩：标签须明确且不能重复。")
            for tag in item["tags"]:
                text(tag, 80)
            if (not isinstance(item["citations"], list) or not 1 <= len(item["citations"]) <= (6 if kind == "cards" else 3)
                    or len(set(item["citations"])) != len(item["citations"]) or set(item["citations"]) - citations.keys()):
                raise ValueError("读马恩：引文数量无效、重复或引用不存在的ID。")
            if not isinstance(item["related"], list) or len(set(item["related"])) != len(item["related"]) or ident in item["related"]:
                raise ValueError("读马恩：相关卡片不能重复或指向自己。")
            iso(item["added"])
            if item["status"] not in ("published", "draft") or type(item["ai_assisted"]) is not bool:
                raise ValueError("读马恩：发布与AI辅助标记须明确。")
            for source in item.get("sources", []):
                fields(source, ("label", "url", "checked_on"))
                text(source["label"], 500)
                source_url(source["url"])
                iso(source["checked_on"])
            references = item.get("references", [])
            if not isinstance(references, list) or len(references) > 12:
                raise ValueError("读马恩：补充原著与背景资料须明确列出。")
            for reference in references:
                fields(reference, ("level", "label", "url", "checked_on"))
                if type(reference["level"]) is not int or reference["level"] not in (1, 3):
                    raise ValueError("读马恩：补充依据须区分原著与编者背景资料。")
                text(reference["label"], 500)
                source_url(reference["url"], "zh")
                iso(reference["checked_on"])
                if reference["level"] == 1 and reference["url"].split("#")[0] not in set().union(*(w["primary_urls"] for w in works.values())):
                    raise ValueError("读马恩：补充原著也须属于本版已核实的正文目录。")
            if kind == "works" and item["work"] not in works:
                raise ValueError("读马恩：作品导读引用未知作品。")
            if kind == "guides" and (type(item["volume"]) is not int or type(item["chapter"]) is not int or (item["volume"], item["chapter"]) not in chapters):
                raise ValueError("读马恩：章节导读引用未知章节。")
            chapter_note_characters = 0
            if kind == "parts":
                from marx_v3 import validate_part_metadata
                chapter_note_characters = validate_part_metadata(item, chapters)
            body = bodies.get(ident)
            if body is None:
                raise ValueError("读马恩：缺少显式登记的Markdown正文。")
            found = markdown_sections(body)
            if tuple(found) != HEADINGS[category]:
                raise ValueError(f"读马恩：{ident}小节缺少、倒序或混入流程说明。")
            count = prose_characters(body) + chapter_note_characters
            low, high = PROSE_LIMITS[category]
            if not low <= count <= high:
                raise ValueError(f"读马恩：{ident}正文汉字数{count}，应为{low}–{high}。")
            originals = [citations[c]["text"] for c in item["citations"]]
            quotation_inputs = [item["title"], item["summary"], body]
            if kind == "parts":
                quotation_inputs.extend(note["text"] for note in item["chapter_notes"])
            for value in quotation_inputs:
                for pair in re.findall(r"“([^”]+)”|‘([^’]+)’", value):
                    quoted = next(part for part in pair if part)
                    if len(quoted) > 6 and not any(quoted in original for original in originals):
                        raise ValueError(f"读马恩：{ident}中的长引号文字不属于所引原文：{quoted}")
            items[ident] = {**item, "kind": kind, "category": category, "body": body, "sections": found,
                            "prose_characters": count, "route": content_route(item, kind)}
    from marx_v3 import validate_part_links
    validate_part_links(items, chapters)
    if set(bodies) != items.keys():
        raise ValueError("读马恩：正文与登记清单须一一对应。")
    for item in items.values():
        if set(item["related"]) - items.keys():
            raise ValueError("读马恩：相关卡片指向未知路径。")
        if item["status"] == "published" and any(items[i]["status"] != "published" for i in item["related"]):
            raise ValueError("读马恩：已发布内容不能指向草稿。")
        known_routes = {"/marx/", "/marx/wenji/", "/marx/capital/", "/marx/capital/english/", "/marx/capital/routes/", "/marx/sources/", "/marx/qa/"}
        from marx_v2 import ROUTES
        known_routes.update(ROUTES)
        from marx_topics import ROUTES as TOPIC_ROUTES
        known_routes.update(TOPIC_ROUTES)
        known_routes.update(f"/marx/wenji/{no}/" for no in range(1, 11))
        known_routes.update(f"/marx/capital/{no}/" for no in range(1, 4))
        known_routes.update(i["route"] for i in items.values() if i["status"] == "published" or item["status"] == "draft")
        for token in MarkdownIt("commonmark", {"html": False}).parse(item["body"]):
            for child in token.children or []:
                if child.type == "link_open":
                    href = child.attrGet("href") or ""
                    if href.startswith("/marx/") and urlsplit(href).path not in known_routes:
                        raise ValueError("读马恩：正文链接指向未生成的栏目页面。")
    return items


def quotation_budgets(items, citations, lengths, errata=None, works=None):
    totals, per_page = Counter(), {}
    for item in items.values():
        if item["status"] != "published":
            continue
        count = sum(len(citations[i]["text"]) for i in item["citations"])
        if count > 600 or count * 2 > item["prose_characters"]:
            raise ValueError("读马恩：单页引文超限或超过解读正文的一半。")
        per_page[item["route"]] = count
        for ident in item["citations"]:
            totals[citations[ident]["work"]] += len(citations[ident]["text"])
    corrections = Counter()
    error_characters, editorial_characters = 0, 0
    for correction in (errata or {}).values():
        count = len(correction["wrong"]) + len(correction["right"])
        error_characters += count
        matches = [ident for ident, work in (works or {}).items() if correction["url"].split("#")[0] in work["primary_urls"]]
        if matches:
            for ident in matches:
                corrections[ident] += count
        else:
            editorial_characters += count
    if error_characters:
        if error_characters > 600:
            raise ValueError("读马恩：来源页校勘对照也受单页摘录上限限制。")
        per_page["/marx/sources/"] = error_characters
    result = {}
    for work in sorted(totals.keys() | corrections.keys()):
        count = totals[work] + corrections[work]
        if work not in lengths:
            raise ValueError("读马恩：校勘所涉作品也需要核定正文长度。")
        original = lengths[work]["characters"]
        cap = 10000 if work in ("capital-1", "capital-2", "capital-3") else 2500
        fraction_limit = original // (3 if original < 3000 else 10)
        if count > cap or count > fraction_limit:
            raise ValueError(f"读马恩：{work}累计引用{count}字超出作品预算。")
        result[work] = {"displayed_characters": count, "citation_characters": totals[work], "errata_characters": corrections[work], "original_characters": original,
                        "limit": min(cap, fraction_limit)}
    return {"works": result, "pages": per_page, "citation_characters": sum(totals.values()),
            "errata_characters": error_characters, "editorial_characters": editorial_characters,
            "total_characters": sum(totals.values()) + error_characters}


def validate_qa(data, article_routes, chapters):
    fields(data, ("version", "items"))
    if type(data["version"]) is not int or data["version"] != 1 or not isinstance(data["items"], list):
        raise ValueError("读马恩：问对录索引版本无效。")
    seen = set()
    for item in data["items"]:
        fields(item, ("title", "article", "volume", "chapter", "section"))
        text(item["title"], 500)
        if item["article"] not in article_routes or item["article"] in seen:
            raise ValueError("读马恩：问对录须链接真实、唯一的原文章路径。")
        seen.add(item["article"])
        if type(item["volume"]) is not int or item["volume"] not in (1, 2, 3):
            raise ValueError("读马恩：问对录卷次无效。")
        if item["chapter"] is not None and (type(item["chapter"]) is not int or (item["volume"], item["chapter"]) not in chapters):
            raise ValueError("读马恩：问对录章节不存在。")
        if item["section"] is not None and (type(item["section"]) is not int or item["section"] < 1 or item["chapter"] is None):
            raise ValueError("读马恩：问对录节号无效。")


def load_marx_engels(root):
    root = Path(root)
    def read(name):
        return json.loads(source_path(root, name).read_text(encoding="utf-8"))
    for relative in ("home/marx.template.html", *("home/assets/" + name for name in ASSETS)):
        if not source_path(root, relative).is_file():
            raise ValueError("读马恩：缺少模板或本地资源。")
    intro = read("home/marx-intro.json")
    fields(intro, ("version", "name", "intro", "basis", "description"))
    if type(intro["version"]) is not int or intro["version"] != 1 or intro["name"] != "读马恩" or intro["intro"] != INTRO or intro["basis"] != BASIS:
        raise ValueError("读马恩：栏目名称、简介或版本依据不符合约定。")
    text(intro["description"], 500)
    wenji, capital = read("marx-engels/wenji.json"), read("marx-engels/capital.json")
    works = validate_wenji(wenji)
    chapters = validate_capital(capital, works)
    citations_data, review, errata = (read("marx-engels/" + name + ".json") for name in ("citations", "citations-review", "errata"))
    citations, corrections, lengths = validate_citations(citations_data, review, errata, works)
    catalog = read("marx-engels/catalog.json")
    bodies = {}
    for kind in ("cards", "works", "guides", "parts"):
        for item in catalog.get(kind, []):
            ident = slug(item.get("slug"))
            if ident in bodies:
                raise ValueError("读马恩：正文路径重复。")
            bodies[ident] = source_path(root, f"marx-engels/{kind}/{ident}.md").read_text(encoding="utf-8")
    items = validate_catalog(catalog, bodies, citations, works, chapters)
    budgets = quotation_budgets(items, citations, lengths, corrections, works)
    article_routes = set()
    for folder in ("中文文章", "English Articles"):
        for path in (root / folder).rglob("*.md"):
            if not any(part.startswith(".") for part in path.relative_to(root).parts):
                article_routes.add("/articles/" + quote(path.relative_to(root).with_suffix(".html").as_posix(), safe="/"))
    qa = read("marx-engels/qa-index.json")
    validate_qa(qa, article_routes, chapters)
    result = {"intro": intro, "wenji": wenji, "capital": capital, "catalog": catalog, "works": works,
            "chapters": chapters, "citations": citations, "errata": corrections, "lengths": lengths,
            "items": items, "qa": qa["items"], "budgets": budgets}
    from marx_v2 import load_v2
    result["v2"] = load_v2(root, result)
    from marx_topics import load_topics, quotation_items
    result["topics"] = load_topics(root, result)
    result["budgets"] = quotation_budgets({**items, **quotation_items(result["topics"])}, citations, lengths, corrections, works)
    from marx_render import render_sources
    if budgets["errata_characters"] * 2 > html_prose_characters(render_sources(result)):
        raise ValueError("读马恩：来源页校勘对照不能超过本站说明的一半。")
    return result


def build_marx_engels(root, output, address, data):
    # Render only the validated, explicitly named public files. No research cache is opened here.
    from marx_render import build_pages
    return build_pages(root, output, address, data)

