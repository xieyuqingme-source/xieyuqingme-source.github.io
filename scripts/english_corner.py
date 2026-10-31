"""Offline, Chinese-first Learn English: reviewed cards, never private notes."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
import json
import math
import re
import shutil
import unicodedata

from markdown_it import MarkdownIt
from history_today import _public_url
from site_i18n import localize_page
from game_assets import LEARNING_IMAGE_PATHS
from reading_annotations import mark_reviewed_terms

CHINA = timezone(timedelta(hours=8))
COLUMNS = {"words", "classics", "between", "myths", "mistakes"}
LEVELS = {1: "高考", 2: "四六级", 3: "雅思"}
SECTIONS = {"words": ("故事", "可以这样用"), "classics": ("导读", "原文", "可以这样用"),
            "between": ("对照", "为什么", "可以这样用"), "myths": ("流行说法", "证据", "结论"),
            "mistakes": ("错句", "对句", "为什么")}
SLUG = re.compile(r"[a-z][a-z0-9-]{1,63}")
RESERVED_SLUGS = {"tools", "play", "quotes", "map"}
from site_safety import PRIVATE_PATH as PRIVATE
ASSETS = ("english-corner.css", "english-corner.js", "english-numbers.js", "english-play.js", "english-quotes.js", "english-word-map.js", "reading-annotations.css", "reading-annotations.js", "english-speech.js")
MAP_ASSETS = ("map-land.json", "vendor/d3-7.9.0.min.js", "vendor/D3-LICENSE")


def lf(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")


def text_hash(text):
    return sha256(lf(text).encode("utf-8")).hexdigest()


def word_count(text):
    return len(re.findall(r"[A-Za-z]+(?:[’'-][A-Za-z]+)*", text))


def public_text(value, maximum=2000, multiline=False):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum or PRIVATE.search(value)
            or any((ord(c) < 32 and not (multiline and c in "\n\r\t")) or ord(c) == 127 for c in value)):
        raise ValueError("Learn English needs public text without private paths or control characters.")
    return value


def public_url(value):
    parts = _public_url(value)
    if not parts.hostname or "." not in parts.hostname and ":" not in parts.hostname or "Obsidian Vault" in unquote(value) or re.search(r"[<>\\\x00-\x1f\x7f]", unquote(value)):
        raise ValueError("Learn English sources need safe public HTTPS URLs.")
    return value


def exact_fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
        raise ValueError("Incomplete or unknown Learn English fields.")


def iso_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Use an ISO source-check date.")
    return date.fromisoformat(value)


def public_domain(published, died, today=None):
    year = (today or datetime.now(CHINA).date()).year
    if (type(published) is not int or type(died) is not int or not 1 <= published <= year - 96
            or not 1 <= died <= year - 51):
        raise ValueError("Originals must satisfy the publication and author-death public-domain cutoffs.")


def source_path(root, relative):
    root = Path(root).resolve()
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise ValueError("Learn English sources must stay in the public repository.")
    current = path
    while current != root:
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ValueError("Linked Learn English paths are not supported.")
        current = current.parent
    return path


def sections(body):
    """Use parsed Markdown headings; a heading inside a fenced example is not a section."""
    parser = MarkdownIt("commonmark", {"html": False})
    lines, found = lf(body).splitlines(), []
    tokens = parser.parse(body)
    for i, token in enumerate(tokens):
        if token.type == "heading_open" and token.tag == "h2":
            found.append((tokens[i + 1].content, token.map[0], token.map[1]))
        elif token.type == "heading_open" and token.tag == "h1":
            raise ValueError("Card titles belong in the catalog, not a second Markdown H1.")
    if not found or any(lines[:found[0][1]]):
        raise ValueError("Cards start with their required H2 sections.")
    result = {}
    for i, (title, start, end) in enumerate(found):
        content = "\n".join(lines[end:found[i + 1][1] if i + 1 < len(found) else len(lines)]).strip()
        if title in result or not content:
            raise ValueError("Card sections must be nonempty and unique.")
        result[title] = content
    return result


def related_route(value, known, article_routes):
    if isinstance(value, str) and value in known:
        return "/english/" + value + "/"
    if isinstance(value, str) and value.startswith("/articles/") and value in article_routes:
        return value
    raise ValueError("Related reading must name an existing published card or original article.")


def validate_corner(data, bodies, notes, article_routes=(), today=None):
    exact_fields(data, ("version", "columns", "cards"))
    if type(data["version"]) is not int or data["version"] != 1 or not isinstance(data["columns"], list) or not isinstance(data["cards"], list):
        raise ValueError("Unsupported Learn English catalog.")
    seen_columns = set()
    for column in data["columns"]:
        exact_fields(column, ("id", "title", "english", "description"))
        if column["id"] not in COLUMNS or column["id"] in seen_columns:
            raise ValueError("Learn English needs unique known columns.")
        seen_columns.add(column["id"])
        for key in ("title", "english", "description"):
            public_text(column[key], 160)
    if seen_columns != COLUMNS:
        raise ValueError("Learn English needs all configured columns.")
    seen, cards = set(), []
    required = {"slug", "column", "title", "level", "tags", "summary", "sources", "related", "added", "status", "ai_assisted"}
    for item in data["cards"]:
        exact_fields(item, required, ("headword", "journey", "work", "verdict"))
        slug, column = item["slug"], item["column"]
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in RESERVED_SLUGS or slug in seen or column not in COLUMNS:
            raise ValueError("Card slugs and columns must be unique, public and known.")
        seen.add(slug)
        if type(item["level"]) is not int or item["level"] not in LEVELS or type(item["ai_assisted"]) is not bool:
            raise ValueError("Cards need a level and an honest AI-assistance flag.")
        if item["status"] not in {"published", "draft"}:
            raise ValueError("Unknown card publication status.")
        public_text(item["title"], 120)
        public_text(item["summary"], 120)
        iso_date(item["added"])
        if not isinstance(item["tags"], list) or not 1 <= len(item["tags"]) <= 6:
            raise ValueError("Cards need a short public tag list.")
        for tag in item["tags"]:
            public_text(tag, 24)
        if not isinstance(item["sources"], list) or not (2 if column == "myths" else 1) <= len(item["sources"]) <= 12:
            raise ValueError("Every card needs sources; fact-checks need at least two.")
        for source in item["sources"]:
            exact_fields(source, ("label", "url", "checked_on"))
            public_text(source["label"], 250)
            public_url(source["url"])
            iso_date(source["checked_on"])
        if slug not in bodies:
            raise ValueError("Every catalog entry needs its explicit Markdown file.")
        body = public_text(bodies[slug], 20000, multiline=True)
        parts = sections(body)
        for token in MarkdownIt("commonmark", {"html": False}).parse(body):
            for child in token.children or ():
                if child.type == "image":
                    if child.attrGet("src") not in LEARNING_IMAGE_PATHS or not child.content.strip():
                        raise ValueError("Learning images need alt text and an explicitly registered local book WebP.")
                if child.type == "link_open":
                    href = child.attrGet("href") or ""
                    if href.startswith("https://"):
                        public_url(href)
                    elif not href.startswith("/") or href.startswith("//") or any(c in unquote(href) for c in ("\\", "\n", "\r")) or ".." in unquote(href):
                        raise ValueError("Markdown links must be safe public or root-relative reading links.")
        if not set(SECTIONS[column]).issubset(parts):
            raise ValueError("Missing required card sections: " + slug)
        if not isinstance(item["related"], list) or len(item["related"]) > 6:
            raise ValueError("Invalid related-card list.")
        if column == "words":
            public_text(item.get("headword"), 80)
            if any(key in item for key in ("work", "verdict")):
                raise ValueError("Unexpected word-card metadata.")
            journey = item.get("journey", [])
            if not isinstance(journey, list) or len(journey) > 8:
                raise ValueError("Invalid word journey.")
            for stop in journey:
                exact_fields(stop, ("language", "form", "period", "place_zh", "lon", "lat", "approximate"))
                public_text(stop["language"], 60)
                public_text(stop["form"], 80)
                public_text(stop["place_zh"], 80)
                if stop["approximate"] is not True or any(type(stop[k]) not in (int,float) or not math.isfinite(stop[k]) or abs(stop[k]) > limit for k,limit in (("lon",180),("lat",90))):
                    raise ValueError("Word-map coordinates must be finite, bounded representative points marked approximate.")
                if stop["period"] != "":
                    public_text(stop["period"], 60)
        elif any(key in item for key in ("headword", "journey")):
            raise ValueError("Word journeys belong to word cards.")
        if column == "myths":
            if item.get("verdict") not in {"真", "假", "存疑", "部分正确"}:
                raise ValueError("Fact-check verdicts need a readable label.")
        elif "verdict" in item:
            raise ValueError("Verdicts belong to fact-check cards.")
        if column == "classics":
            work = item.get("work")
            exact_fields(work, ("author_zh", "author_en", "title_zh", "title_en", "first_published", "author_died", "range", "edition", "edition_url", "excerpt_words", "excerpt_sha256_lf"))
            for key in ("author_zh", "author_en", "title_zh", "title_en", "range", "edition"):
                public_text(work[key], 350)
            public_url(work["edition_url"])
            public_domain(work["first_published"], work["author_died"], today)
            excerpt = parts["原文"]
            if text_hash(excerpt) != work["excerpt_sha256_lf"] or type(work["excerpt_words"]) is not int or word_count(excerpt) != work["excerpt_words"] or not 1 <= work["excerpt_words"] <= 600:
                raise ValueError("Classic original changed or exceeds its reviewed range: " + slug)
        elif "work" in item:
            raise ValueError("Edition metadata belongs to classics.")
        if item["status"] == "published":
            cards.append({**item, "body": body, "sections": parts})
    known = {card["slug"] for card in cards}
    for card in cards:
        for value in card["related"]:
            related_route(value, known, set(article_routes))
    exact_fields(notes, ("version", "works"))
    if type(notes["version"]) is not int or notes["version"] != 1 or not isinstance(notes["works"], dict) or set(notes["works"]) - known:
        raise ValueError("Notes require an existing published classic.")
    for slug, entries in notes["works"].items():
        card = next(c for c in cards if c["slug"] == slug)
        if card["column"] != "classics" or not isinstance(entries, list) or not 3 <= len(entries) <= 6:
            raise ValueError("Classics have three to six contextual word notes.")
        terms = set()
        for note in entries:
            exact_fields(note, ("term", "meaning", "source_url", "source_label", "checked_on"))
            for key in ("term", "meaning", "source_label"):
                public_text(note[key], 300)
            public_url(note["source_url"])
            iso_date(note["checked_on"])
            if note["term"] not in card["sections"]["原文"] or note["term"].casefold() in terms:
                raise ValueError("A note must describe an actual, distinct occurrence in its classic.")
            terms.add(note["term"].casefold())
    if any(card["slug"] not in notes["works"] for card in cards if card["column"] == "classics"):
        raise ValueError("Every classic needs its reviewed vocabulary notes.")
    return {"columns": data["columns"], "cards": cards, "notes": notes["works"]}


def load_english_corner(root, today=None):
    root = Path(root)
    for relative in ("home/english-corner.template.html", *("home/assets/" + name for name in (*ASSETS,*MAP_ASSETS))):
        if not source_path(root, relative).is_file():
            raise ValueError("Missing Learn English template or local asset.")
    catalog = json.loads(source_path(root, "english-corner/catalog.json").read_text(encoding="utf-8"))
    bodies = {}
    for card in catalog.get("cards", []):
        slug = card.get("slug")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in RESERVED_SLUGS:
            raise ValueError("Invalid explicit card path.")
        bodies[slug] = source_path(root, "english-corner/cards/" + slug + ".md").read_text(encoding="utf-8")
    notes = json.loads(source_path(root, "english-corner/notes.json").read_text(encoding="utf-8"))
    articles = set()
    for directory in ("中文文章", "English Articles"):
        for path in (root / directory).rglob("*.md"):
            if not any(part.startswith(".") for part in path.relative_to(root).parts):
                articles.add("/articles/" + quote(path.relative_to(root).with_suffix(".html").as_posix(), safe="/"))
    corner = validate_corner(catalog, bodies, notes, articles, today)
    corner["intro"] = load_intro(root)
    from english_quiz import load_quiz, load_quiz_options
    corner["quiz"] = load_quiz(root, corner["cards"])
    corner["quiz_warmup_quotes"] = load_quiz_options(root)
    return corner


def load_intro(root):
    data = json.loads(source_path(root, "home/english-intro.json").read_text(encoding="utf-8"))
    exact_fields(data, ("version", "name", "english_name", "intro", "description", "editorial", "contact"), ("title",))
    if type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Unsupported learning introduction.")
    for key in ("name", "english_name", "intro", "description", "editorial"):
        public_text(data[key], 500)
    if "title" in data:
        public_text(data["title"], 120)
    if data["contact"] != "xieyuqing.me@gmail.com":
        raise ValueError("Use the public site contact address.")
    return data


def external(url, label):
    return f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)} ↗</a>'


def render_index(corner):
    counts = Counter(card["column"] for card in corner["cards"])
    quick_links = (
        ("/english/play/", "英语小测验", "词源、用法、作家，每轮十题。"),
        ("/game/ranking/?template=book", "名著从夯到拉", "排一排阅读偏好，随手玩一局。"),
        ("/english/quotes/", "英语名句库", "找一句想读、想记住的话。"),
        ("/english/map/", "单词足迹地图", "跟着词语，看看世界。"),
    )
    quick = '<nav class="ec-quick-links" data-ec-quick aria-label="先玩一会儿">' + ''.join(
        '<a href="' + href + '"><strong>' + title + '</strong><span>' + detail + '</span></a>'
        for href, title, detail in quick_links) + '</nav>'
    columns = '<a class="ec-column" href="#directory" data-ec-filter="all">全部 <small>' + str(len(corner["cards"])) + ' 张</small></a>'
    columns += ''.join('<a class="ec-column" href="#column-' + column["id"] + '" data-ec-column="' + column["id"] + '" data-ec-filter="' + column["id"] + '" title="' + escape(column["description"], quote=True) + '"><span>' + escape(column["title"]) + '</span><small>' + str(counts[column["id"]]) + ' 张</small></a>' for column in corner["columns"])
    filters = '<div class="ec-filters" hidden data-ec-filters><fieldset aria-describedby="ec-level-help"><legend>难度</legend><button type="button" data-ec-level="all" aria-pressed="true">全部</button>' + ''.join(f'<button type="button" data-ec-level="{n}" aria-pressed="false">{v}</button>' for n,v in LEVELS.items()) + '</fieldset></div>'
    filters += '<p class="ec-meta ec-level-help" id="ec-level-help">按读懂所需的词汇量大致分级</p>'
    groups = []
    for column in corner["columns"]:
        rows = []
        for card in corner["cards"]:
            if card["column"] != column["id"]:
                continue
            route = '/english/' + card["slug"] + '/'
            rows.append('<article class="ec-row" id="card-' + card["slug"] + '" data-ec-row data-slug="' + card["slug"] + '" data-column="' + card["column"] + '" data-level="' + str(card["level"]) + '"><div class="ec-row-heading"><h3><a data-ec-card href="' + route + '">' + escape(card["title"]) + '</a><span class="ec-read-flag" data-ec-read-flag hidden>✓ 已读</span></h3><span class="ec-meta">' + escape(column["title"]) + ' · ' + LEVELS[card["level"]] + '</span></div><details class="ec-answer"><summary>看答案</summary><p>' + escape(card["summary"]) + '</p><a data-ec-full href="' + route + '">读全文 →</a></details></article>')
        tool = '<p class="ec-number-entry"><a href="/english/tools/numbers/">中英数字转换器 →</a><span>14亿是多少 billion？换一个数看看。</span></p>' if column["id"] == "between" else ''
        groups.append(f'<section data-ec-group id="column-{column["id"]}"><h2>{escape(column["title"])}</h2>{tool}{"".join(rows)}</section>')
    intro = corner.get("intro")
    heading = ('<header class="ec-intro"><p class="ec-eyebrow" lang="en">' + escape(intro["english_name"]) + '</p><h1>' + escape(intro["name"]) + '</h1><p class="ec-lead">' + escape(intro["intro"]) + '</p><a href="/today/#today-reading">每天一句英语名句，在「今天」页 →</a></header>') if intro else ''
    editorial = ('<details class="ec-editorial"><summary>这一栏是怎么写的</summary><p>' + escape(intro["editorial"]) + '<a href="mailto:' + escape(intro["contact"],quote=True) + '">反馈问题</a>。</p></details>') if intro else ''
    tools = '<div class="ec-directory-tools"><p data-ec-count class="ec-meta" role="status" aria-live="polite"></p><button type="button" data-ec-random class="ec-random" title="从当前筛选范围优先抽未读卡片" hidden>随机来一张</button><span class="ec-read-tools" data-ec-read-tools hidden><span data-ec-read-count role="status" aria-live="polite"></span><button type="button" data-ec-clear>清除记录</button></span></div>'
    return (heading + quick
            + '<nav class="ec-columns" aria-label="学英语栏目">' + columns + '</nav>' + filters + tools
            + '<p data-ec-empty hidden>这个组合暂时没有卡片，试试其他栏目或难度。</p>'
            + '<div class="ec-directory" id="directory">' + ''.join(groups) + '</div>' + editorial)


def speech_button(text=None, target=None):
    value = ' data-speech-text="'+escape(text,quote=True)+'"' if text is not None else ' data-speech-target="'+escape(target,quote=True)+'"'
    return '<button class="ec-speech-button" type="button" data-english-speech'+value+' aria-pressed="false" aria-label="朗读英文，使用设备本地英语语音，再次点击停止" title="使用设备自带的本地英语语音；音色因设备而异，再次点击停止。" hidden>朗读</button>'


def speech_notice():
    return '<p class="ec-meta ec-speech-note" data-english-speech-note role="status" aria-live="polite" aria-atomic="true" hidden></p>'


def reading_popup(notes):
    from daily_brief import safe_json
    entries=[{"term":n["term"],"explanation":n["meaning"],"source":n["source_label"],"source_url":n["source_url"],"checked_on":n["checked_on"]} for n in notes]
    return ('<script type="application/json" data-reading-notes>'+safe_json(entries)+'</script>'
        '<section class="reading-note-popup" id="reading-note" data-reading-note-popup role="dialog" aria-modal="false" aria-labelledby="reading-note-title" aria-describedby="reading-note-explanation" tabindex="-1" hidden>'
        '<header><h2 id="reading-note-title" data-reading-note-title></h2><button type="button" data-reading-note-close>关闭</button></header>'
        '<p id="reading-note-explanation" data-reading-note-explanation></p><p class="ec-meta" data-reading-note-source></p>'
        '<a data-reading-note-link target="_blank" rel="noopener noreferrer">词典依据 ↗</a></section>')


def render_card(card, corner):
    column = next(c for c in corner["columns"] if c["id"] == card["column"])
    breadcrumb = f'<nav class="ec-breadcrumb" aria-label="面包屑"><a data-ec-return href="/english/#card-{card["slug"]}">学英语</a><span aria-hidden="true"> / </span><a data-ec-return href="/english/?column={card["column"]}#card-{card["slug"]}">{escape(column["title"])}</a></nav>'
    header = f'<header class="ec-card-intro" data-ec-current-card="{card["slug"]}"><h1>{escape(card["title"])}</h1><p class="ec-meta">{escape(column["title"])} · <span title="按读懂所需的词汇量大致分级">{LEVELS[card["level"]]}</span> · {escape(" / ".join(card["tags"]))}</p></header><aside class="ec-summary"><h2>30秒版</h2><p>{escape(card["summary"])}</p></aside>'
    special = ''
    if card["column"] == "words" and card.get("journey"):
        stamps = '<span aria-hidden="true"> → </span>'.join('<span class="ec-stamp"><small>' + escape(s["language"]) + '</small><strong lang="en">' + escape(s["form"]) + '</strong>' + ('<small>' + escape(s["period"]) + '</small>' if s["period"] else '') + '</span>' for s in card["journey"])
        special = '<section class="ec-passport"><h2>单词护照 · <span lang="en">' + escape(card["headword"]) + '</span> '+speech_button(text=card["headword"])+'</h2><div>' + stamps + '</div><p><a href="/english/map/?word=' + card["slug"] + '">在单词地图上看看 →</a></p></section>'
    elif card["column"] == "words":
        special = '<p class="ec-headword"><span lang="en">'+escape(card["headword"])+'</span> '+speech_button(text=card["headword"])+ '</p>'
    elif card["column"] == "myths":
        special = '<p class="ec-verdict">判定：<strong>' + escape(card["verdict"]) + '</strong></p>'
    elif card["column"] == "classics":
        w = card["work"]
        special = ('<aside class="ec-edition"><p>' + escape(w["author_zh"]) + '（<span lang="en">' + escape(w["author_en"]) + '</span>） · ' + escape(w["title_zh"]) + ' <span lang="en">' + escape(w["title_en"]) + '</span></p><p>' + '作品/所引版本：' + str(w["first_published"]) + '年 · ' + escape(w["range"]) + '</p><p>' + external(w["edition_url"], w["edition"]) + '</p></aside>')
    parser = MarkdownIt("commonmark", {"html": False, "breaks": True}).enable("table")
    content = []
    for i, (heading, body) in enumerate(card["sections"].items()):
        original = card["column"] == "classics" and heading == "原文"
        heading_language = ' lang="zh-CN"' if original else ''
        example_note = '<p class="ec-example-note">例句为编写的示例。</p>' if heading == "可以这样用" or card["column"] == "mistakes" and heading == "错句" else ''
        rendered = parser.render(body)
        if original:
            tokens=parser.parse(body)
            def marker(text,index,entry):
                return '<span class="reading-annotation" data-reading-note-index="'+str(index)+'" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="reading-note" aria-label="查看'+escape(text,quote=True)+'释义">'+escape(text)+'</span>'
            mark_reviewed_terms(tokens,corner["notes"][card["slug"]],marker)
            rendered='<div id="english-classic-text" data-reading-area>'+parser.renderer.render(tokens,parser.options,{})+'</div>'
        listen = ' '+speech_button(target="english-classic-text") if original else ''
        content.append(f'<section class="ec-section{" ec-original" if original else ""}" id="reading-{i}"' + (' lang="en"' if original else '') + f'><h2{heading_language}>{escape(heading)}{listen}</h2>{example_note}{rendered}</section>')
        if original:
            rows = ''.join('<tr><th scope="row" lang="en">' + escape(n["term"]) + '</th><td>' + escape(n["meaning"]) + '</td><td><span title="核对于' + escape(n["checked_on"],quote=True) + '">' + external(n["source_url"],n["source_label"]) + '</span></td></tr>' for n in corner["notes"][card["slug"]])
            content.append('<details class="ec-vocabulary"><summary>难词，放回这段话里看</summary><div class="ec-table"><table><thead><tr><th>词语</th><th>本段含义</th><th>词典依据</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>')
    source_heading = "来源" if card["column"] == "mistakes" else "来源与版本"
    sources = '<section class="ec-sources"><h2>' + source_heading + '</h2><ol>' + ''.join('<li>' + external(s["url"], s["label"]) + '<small> · 核对于 ' + escape(s["checked_on"]) + '</small></li>' for s in card["sources"]) + '</ol>'
    if card["column"] == "classics":
        sources += '<p>公版范围：所引作品/版本年为' + str(card["work"]["first_published"]) + '年，作者卒于' + str(card["work"]["author_died"]) + '年；按出版年份差至少96年、作者卒年差至少51年的保守门槛筛选。只取作品正文，不含现代编者导言或注释。</p>'
    sources += ('<p>本文初稿与自编例句有 AI 辅助；事实与引文按上述来源核对，中文释义为本站整理。</p>' if card["ai_assisted"] else '') + '</section>'
    titles = {c["slug"]: c["title"] for c in corner["cards"]}
    index = corner["cards"].index(card)
    adjacent = []
    if index:
        previous = corner["cards"][index-1]
        adjacent.append(("/english/"+previous["slug"]+"/", "← 上一张："+previous["title"]))
    if index + 1 < len(corner["cards"]):
        following = corner["cards"][index+1]
        adjacent.append(("/english/"+following["slug"]+"/", "下一张："+following["title"]+" →"))
    seen = {route for route, label in adjacent}
    related_rows = []
    for value in card["related"]:
        route = related_route(value, titles, {value} if value.startswith('/articles/') else set())
        if route in seen:
            continue
        seen.add(route)
        label = titles.get(value, "《英语的千和汉语的万》")
        related_rows.append('<li><a href="'+escape(route, quote=True)+'">延伸阅读：'+escape(label)+' →</a></li>')
    related = '<aside class="ec-related"><h2>接着逛逛</h2><ul>'+''.join(related_rows)+'</ul></aside>' if related_rows else ''
    previous_next = '<nav class="ec-adjacent" aria-label="相邻卡片">'+''.join('<a href="'+escape(route, quote=True)+'">'+escape(label)+'</a>' for route, label in adjacent)
    classic = card["column"] == "classics"
    prose = '<div class="ec-prose"'+(' data-reading-annotations' if classic else '')+'>'+''.join(content)+(reading_popup(corner["notes"][card["slug"]]) if classic else '')+'</div>'
    return breadcrumb + header + special + (speech_notice() if card["column"] in {"words","classics"} else '') + prose + sources + related + previous_next + '</nav>'


def quote_lines(value):
    return escape(value).replace("\n", "<br>")


def render_quote_library(data):
    from daily_brief import english_quote_note, ENGLISH_QUOTE_THEMES
    quotes = sorted(data["quotes"], key=lambda q:(q["first_published"],q["author_en"],q["id"]))
    authors = sorted({q["author_zh"]:q["author_en"] for q in quotes}.items(),key=lambda item:item[1])
    periods = sorted({q["first_published"]//100*100 for q in quotes})
    author_options = ''.join('<option value="'+escape(zh,quote=True)+'">'+escape(zh+'（'+en+'）')+'</option>' for zh,en in authors)
    period_options = ''.join('<option value="'+str(year)+'">'+str(year)+'–'+str(year+99)+'年</option>' for year in periods)
    theme_options = ''.join('<option value="'+theme+'">'+label+'</option>' for theme,label in ENGLISH_QUOTE_THEMES.items())
    rows = []
    for q in quotes:
        source = q["author_zh"]+'（'+q["author_en"]+'） · '+q["work_zh"]+' · '+q["locator_zh"]
        copy_source = q["author_zh"]+'（'+q["author_en"]+'） · '+q["work_zh"]
        themes = q.get("themes", [])
        theme_labels = '<p class="ec-meta ec-quote-themes">主题：'+' · '.join(ENGLISH_QUOTE_THEMES[theme] for theme in themes)+'</p>' if themes else ''
        published = '<p>'+external(q["translation_source"]["url"],"译文版本")+'</p>' if q["translation_source"]["type"] == "published" else ''
        related = '<p><a href="'+escape(q["related"],quote=True)+'">读读相关卡片 →</a></p>' if q.get("related") else ''
        rows.append('<article class="ec-library-quote" data-english-quote-row id="quote-'+q["id"]+'" data-author="'+escape(q["author_zh"],quote=True)+'" data-period="'+str(q["first_published"]//100*100)+'" data-themes="'+' '.join(themes)+'" data-copy-source="'+escape(copy_source,quote=True)+'" tabindex="-1">'
            '<blockquote><p class="ec-library-original" id="english-quote-text-'+q["id"]+'" lang="en">'+quote_lines(q["text"])+'</p>'+speech_button(target="english-quote-text-"+q["id"])+'<p class="ec-library-translation" lang="zh-CN">'+quote_lines(q["translation"])+'</p></blockquote>'
            '<p class="ec-meta">'+external(q["url"],source)+' · 作品/所引版本：'+str(q["first_published"])+'年</p>'+theme_labels+
            '<div class="ec-quote-actions"><button type="button" data-english-quote-copy hidden>复制</button><p data-english-quote-copy-status role="status" aria-live="polite" hidden></p></div>'
            '<details class="ec-library-note"><summary>这句话里有什么</summary><p>'+escape(english_quote_note(q))+'</p>'+published+related+'</details></article>')
    return ('<nav class="ec-breadcrumb" aria-label="面包屑"><a href="/english/">学英语</a> / 慢慢读</nav>'
        '<header class="ec-card-intro"><p class="ec-eyebrow" lang="en">A few words, a wider world</p><h1>英语名句库</h1><p class="ec-lead">留意一个词、一种句法，或一句话背后的场景。</p><a href="/english/play/">换个玩法，做一轮英语小测验 →</a></header>'
        '<section data-english-quote-library><form class="ec-quote-tools" data-english-quote-filters hidden><label for="ec-quote-author">作者 <select id="ec-quote-author"><option value="all">全部作者</option>'+author_options+'</select></label>'
        '<label for="ec-quote-period">作品/版本时期 <select id="ec-quote-period"><option value="all">全部时期</option>'+period_options+'</select></label>'
        '<label for="ec-quote-theme">主题 <select id="ec-quote-theme"><option value="all">全部主题</option>'+theme_options+'</select></label><button type="button" id="ec-quote-random" hidden>随机一句</button></form>'
        '<p id="ec-quote-count" class="ec-meta" role="status" aria-live="polite">共'+str(len(quotes))+'句</p><p id="ec-quote-empty" hidden>这个组合暂时没有句子，换个作者、时期或主题看看。</p>'
        '<div class="ec-quote-list">'+''.join(rows)+'</div><button type="button" id="ec-quote-more" hidden>再看20句</button>'+speech_notice()+'</section>')


def render_play(corner, quotes):
    from english_quiz import build_quiz_pools
    from daily_brief import safe_json
    knowledge = corner.get("quiz",[])
    pools = corner.get("quiz_pools")
    if pools is None:
        pools = build_quiz_pools(quotes,knowledge,corner.get("quiz_warmup_quotes",[]))
    cards = {c["slug"]:c for c in corner["cards"]}
    slugs = list(dict.fromkeys(q["card"] for q in knowledge)) or list(cards)[:8]
    links = ''.join('<li><a href="/english/'+slug+'/">'+escape(cards[slug]["title"])+'</a></li>' for slug in slugs)
    return ('<nav class="ec-breadcrumb" aria-label="面包屑"><a href="/english/">学英语</a> / 玩一会儿</nav>'
        '<header class="ec-card-intro"><p class="ec-eyebrow" lang="en">A little curiosity</p><h1>英语小测验</h1><p class="ec-lead">猜语言、辨词源、试用法、认作家。每轮十题，答完看看来龙去脉。</p></header>'
        '<section class="ec-quiz" data-english-play><div data-quiz-ui hidden><div class="ec-quiz-modes" role="group" aria-label="选择玩法">'
        '<button type="button" data-quiz-mode="origins">这个词从哪里来？</button><button type="button" data-quiz-mode="etymology">这个词源是真的吗？</button><button type="button" data-quiz-mode="usage">哪句说得对？</button><button type="button" data-quiz-mode="authors">这句话谁写的？</button></div>'
        '<p class="ec-meta" data-quiz-progress>选一种玩法，开始吧。</p><h2 data-quiz-prompt tabindex="-1"></h2><blockquote class="ec-quiz-english" data-quiz-english lang="en" hidden></blockquote>'
        '<div class="ec-quiz-assistance" data-quiz-assistance hidden><button type="button" data-quiz-show-translation aria-controls="quiz-preview-translation" aria-expanded="false">看中文</button><button type="button" data-quiz-show-hint aria-controls="quiz-preview-hint" aria-expanded="false">给个提示</button>'
        '<p id="quiz-preview-translation" data-quiz-preview-translation lang="zh-CN" aria-live="polite" hidden></p><p id="quiz-preview-hint" data-quiz-preview-hint aria-live="polite" hidden></p></div>'
        '<div class="ec-quiz-choices" data-quiz-choices role="group" aria-label="答案选项"></div><section class="ec-quiz-feedback" data-quiz-feedback tabindex="-1" aria-live="polite" hidden></section>'
        '<button class="ec-quiz-action" type="button" data-quiz-next hidden>下一题</button><section class="ec-quiz-results" data-quiz-results tabindex="-1" aria-live="polite" hidden></section>'
        '<button class="ec-quiz-action" type="button" data-quiz-restart hidden>再来一轮</button><button class="ec-quiz-action" type="button" data-quiz-change-mode hidden>换一种玩法</button></div><p data-quiz-error role="status" hidden></p>'
        '<noscript><p>小测验需要 JavaScript，可以先读这些卡片：</p><ul>'+links+'</ul><p><a href="/english/quotes/">完整英语名句库 →</a></p></noscript>'
        '<script type="application/json" id="english-quiz-data">'+safe_json(pools)+'</script></section>'
        '<p class="ec-editorial">题干与解释为编写内容，整理有 AI 辅助，依据题后来源核对。</p>')


def render_number_practice():
    return ('<section class="ec-number-practice" data-number-practice hidden><h2>练一练</h2><p class="ec-meta">换一种单位写出同一个数。这里练数字加单位，不练英文全拼；不计分、不保存答案。</p>'
        '<div class="ec-practice-modes" role="group" aria-label="练习方向"><button type="button" data-number-practice-mode="zh-en" aria-pressed="true">中文 → 英文</button><button type="button" data-number-practice-mode="en-zh" aria-pressed="false">英文 → 中文</button></div>'
        '<p class="ec-practice-question" data-number-practice-question></p><label for="number-practice-answer">你的答案</label><input id="number-practice-answer" data-number-practice-answer type="text" autocomplete="off" spellcheck="false" aria-describedby="number-practice-help number-practice-feedback">'
        '<p class="ec-meta" id="number-practice-help">英文用 thousand / million / billion / trillion；中文用万或亿，例如 1.4 billion 或 14亿。</p>'
        '<div class="ec-practice-actions"><button type="button" data-number-practice-check>检查答案</button><button type="button" data-number-practice-next>下一题</button></div><p id="number-practice-feedback" data-number-practice-feedback role="status" aria-live="polite"></p></section>')


def render_numbers():
    return '''<nav class="ec-breadcrumb" aria-label="面包屑"><a href="/english/">学英语</a> / 小工具</nav><header class="ec-card-intro"><p class="ec-eyebrow" lang="en">Numbers, in two rhythms</p><h1>中英数字转换器</h1><p class="ec-lead">中文四位一进，英文三位一进。同一个数，换种分法就看明白了。</p></header><section class="ec-number-tool" data-english-numbers><label for="english-number-input">输入一个数</label><input id="english-number-input" type="text" inputmode="text" value="14亿" autocomplete="off" spellcheck="false" aria-describedby="english-number-help english-number-error"><p id="english-number-help" class="ec-meta">支持阿拉伯数字、数字加万/亿或 thousand/million/billion/trillion，最多4位小数；范围为0至10¹⁶（不含）。暂不支持纯汉字数词及含义不同的“兆”。</p><div class="ec-examples" aria-label="换算示例"><span>试一试</span><button type="button" data-number-example="14亿">14亿</button><button type="button" data-number-example="960万">960万</button><button type="button" data-number-example="8300万">8300万</button><button type="button" data-number-example="48.6万">48.6万</button><button type="button" data-number-example="1.4 billion">1.4 billion</button></div><p id="english-number-error" role="status"></p><div id="english-number-results" aria-live="polite" aria-atomic="true"></div><noscript><p>转换需要 JavaScript。下方对照表仍可直接阅读。</p></noscript></section>''' + render_number_practice() + '''<section class="ec-prose"><h2>先记住这几个台阶</h2><div class="ec-table"><table><thead><tr><th>中文</th><th>英文</th><th>数值</th></tr></thead><tbody><tr><td>万</td><td lang="en">ten thousand</td><td>10,000</td></tr><tr><td>十万</td><td lang="en">a hundred thousand</td><td>100,000</td></tr><tr><td>百万</td><td lang="en">a million</td><td>1,000,000</td></tr><tr><td>千万</td><td lang="en">ten million</td><td>10,000,000</td></tr><tr><td>亿</td><td lang="en">a hundred million</td><td>100,000,000</td></tr><tr><td>十亿</td><td lang="en">a billion</td><td>1,000,000,000</td></tr></tbody></table></div><h2>读数的小习惯</h2><p>英文全拼采用美式写法，不加 and；英式常在百位后加 and，例如 one hundred and five。21至99的十位与个位之间用连字符。四位分节只用于观察中文单位，是演示写法，不当作英文标点规范。</p><p>示例只演示数字换算，不另外断言人口或面积。为什么中文和英文的台阶不同？读<a href="/english/qian-and-wan/">《英语的千和汉语的万》→</a></p><h2>参考</h2><p>单位与英语写法参见 <a href="https://dictionaryblog.cambridge.org/2016/08/31/one-thousand-one-hundred-and-ninety-three-how-to-say-numbers-1/" target="_blank" rel="noopener noreferrer">Cambridge Dictionary：怎样读数字 ↗</a>；另参见 <a href="https://www.uoc.edu/en/services/language/style/numbers" target="_blank" rel="noopener noreferrer">UOC 英语风格指南：数词、连字符和短标度 ↗</a>（核对于2026-10-29）。本工具说明与示例整理有 AI 辅助。</p></section>'''


WORD_MAP_REGIONS = (
    ("east-southeast-asia", "东亚与东南亚"),
    ("south-asia", "南亚"),
    ("west-asia-north-africa", "西亚与北非"),
    ("europe", "欧洲"),
    ("africa", "非洲"),
    ("americas", "美洲"),
    ("uncertain", "来源有争议"),
    ("other", "其他地区"),
)
# Only already-reviewed representative points are classified. No geographic
# bounding-box guess, language-origin inference or new route is introduced.
WORD_MAP_POINT_REGIONS = {
    (118.0781, 24.4519): "east-southeast-asia",  # Xiamen
    (116.3942, 39.9017): "east-southeast-asia",  # Beijing
    (139.7495, 35.6870): "east-southeast-asia",  # Tokyo
    (101.6887, 3.1398): "east-southeast-asia",    # Kuala Lumpur
    (79.8578, 6.9320): "south-asia",            # Colombo (story location)
    (77.2000, 28.6000): "south-asia",           # New Delhi
    (44.3919, 33.3406): "west-asia-north-africa", # Baghdad
    (51.4224, 35.6739): "west-asia-north-africa", # Tehran
    (14.4229, 50.0870): "europe",               # Prague
    (13.3996, 52.5238): "europe",               # Berlin
    (4.9147, 52.3519): "europe",                # Amsterdam
    (24.9325, 60.1638): "europe",               # Helsinki
    (10.7480, 59.9186): "europe",               # Oslo
    (39.2664, -6.7981): "africa",               # Dar es Salaam
    (-99.1329, 19.4444): "americas",            # Mexico City
}


def word_map_region(card):
    if card["slug"] == "long-time-no-see":
        return "uncertain"
    first = card["journey"][0]
    return WORD_MAP_POINT_REGIONS.get(
        (round(first["lon"], 4), round(first["lat"], 4)), "other"
    )


def word_map_data(corner):
    words = [
        {key: card[key] for key in ("slug", "headword", "title", "summary", "journey")}
        | {"reading": "/english/" + card["slug"] + "/", "region": word_map_region(card)}
        for card in corner["cards"] if card.get("journey")
    ]
    used = {word["region"] for word in words}
    return {
        "version": 1,
        "regions": [{"id": group, "title": title} for group, title in WORD_MAP_REGIONS if group in used],
        "words": words,
    }


def render_word_map(corner):
    from daily_brief import safe_json
    data = word_map_data(corner)
    buttons, fallback = [], []
    for group in data["regions"]:
        words = [word for word in data["words"] if word["region"] == group["id"]]
        label = escape(group["title"])
        choices = ''.join('<button type="button" data-word-map-slug="'+word["slug"]+'" aria-pressed="false" lang="en">'+escape(word["headword"])+'</button>' for word in words)
        buttons.append('<section class="ec-word-map-group" data-word-map-group="'+group["id"]+'"><h3>'+label+'</h3><div>'+choices+'</div></section>')
        articles = []
        for word in words:
            stops = ''.join('<li><strong>'+escape(stop["language"])+'</strong> · <span lang="en">'+escape(stop["form"])+'</span><br><small>'+escape(stop["place_zh"])+((' · '+escape(stop["period"])) if stop["period"] else '')+'</small></li>' for stop in word["journey"])
            articles.append('<article><h4><a href="'+word["reading"]+'">'+escape(word["headword"]+' · '+word["title"])+' →</a></h4><p>'+escape(word["summary"])+'</p><ol>'+stops+'</ol></article>')
        fallback.append('<section data-word-map-group="'+group["id"]+'"><h3>'+label+'</h3>'+''.join(articles)+'</section>')
    return ('<nav class="ec-breadcrumb" aria-label="面包屑"><a href="/english/">学英语</a> / 在地图上看</nav>'
        '<header class="ec-card-intro"><p class="ec-eyebrow" lang="en">Words across the world</p><h1>单词足迹地图</h1><p class="ec-lead">选一个词，看看语言与故事之间的联系。</p></header>'
        '<section class="ec-word-map" data-english-word-map><p class="ec-word-map-notice" data-word-map-notice>地点与连线均为示意。<a href="#word-map-notes">地图说明</a></p>'
        '<div data-word-map-ui hidden><nav class="ec-word-map-words" data-word-map-words aria-label="按地区选择单词">'+''.join(buttons)+'</nav><div class="ec-word-map-panel"><svg data-word-map-svg tabindex="0" role="img" aria-label="单词关联地区示意图" aria-describedby="word-map-help"></svg>'
        '<div class="ec-word-map-controls"><button type="button" data-word-map-zoom="in" aria-label="放大地图">＋</button><button type="button" data-word-map-zoom="out" aria-label="缩小地图">−</button><button type="button" data-word-map-zoom="reset">复位</button></div>'
        '<p class="ec-meta" id="word-map-help">可横向拖动；方向键平移，＋ / − 缩放，Home 复位。手机纵向滑动仍可滚动页面。</p><section class="ec-word-map-route" data-word-map-route aria-live="polite"></section></div></div>'
        '<p data-word-map-status role="status" hidden></p><section class="ec-word-map-fallback" data-word-map-fallback><h2>词语与关联地区</h2>'+(''.join(fallback) or '<p>暂时没有可显示的词卡。</p>')+'</section>'
        '<script type="application/json" id="english-word-map-data">'+safe_json(data)+'</script></section>'
        '<details class="ec-editorial" id="word-map-notes"><summary>地图说明与资料来源</summary><p>词条按第一个示意地点分组，来源有争议的另列。地点与连线表示语言或故事关联的代表地区，不能据此推断真实旅行、具体年代或唯一传播路线。具体证据与争议请读对应词卡。</p>'
        '<p>底图为 Natural Earth 公版陆地轮廓；代表地点坐标取自其居民点数据，仅作制图示意。<a href="https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_populated_places_simple.geojson" target="_blank" rel="noopener noreferrer">坐标来源 ↗</a>。词源整理有 AI 辅助，事实依据见各词卡。</p></details>')


def build_english_corner(root, output, address, corner, english_quotes=None):
    root, output = Path(root), Path(output)
    corner = {**corner, "intro": load_intro(root)}
    intro = corner["intro"]
    if english_quotes is None:
        from daily_brief import load_english_quotes
        english_quotes = load_english_quotes(root,None)
    template = source_path(root, "home/english-corner.template.html").read_text(encoding="utf-8")
    pages = [("/english/", intro.get("title", intro["name"]), intro["description"], render_index(corner)),
             ("/english/tools/numbers/", "中英数字转换器", "用万、亿和 thousand、million、billion 看同一个数。", render_numbers().replace('/english/qian-and-wan/', '/english/qian-and-wan/' if any(c['slug'] == 'qian-and-wan' for c in corner['cards']) else '/english/'))]
    pages.extend(("/english/" + card["slug"] + "/", card["title"], card["summary"], render_card(card,corner)) for card in corner["cards"])
    pages.extend([("/english/quotes/", "英语名句库", "按作者和作品版本浏览英语名句。", render_quote_library(english_quotes)),
                  ("/english/play/", "英语小测验", "猜词源、辨用法、认作家；每轮十题，不计时。", render_play(corner,english_quotes)),
                  ("/english/map/", "单词足迹地图", "语言与故事关联地区的示意地图。", render_word_map(corner))])
    routes = []
    for route, title, description, content in pages:
        page = template
        page = page.replace("{{map_scripts}}", '<script src="/assets/vendor/d3-7.9.0.min.js" defer></script><script src="/assets/english-word-map.js" defer></script>' if route == "/english/map/" else '')
        page_title = title if route == "/english/" else title + " · " + intro["name"]
        for key, value in {"site_url":escape(address,quote=True),"route":route,"title":escape(page_title),"description":escape(description,quote=True),"content":content,"columns":" ".join(c["id"] for c in corner["columns"])}.items():
            page = page.replace("{{" + key + "}}",value)
        if "{{" in page:
            raise ValueError("Unresolved Learn English template placeholder.")
        page = localize_page(page,root,address,route,"zh-CN",title=page_title,description=description)
        folder = output / route.strip("/")
        current = folder
        while current != output:
            if current.is_symlink() or (hasattr(current,"is_junction") and current.is_junction()):
                raise ValueError("Linked Learn English output is not supported.")
            current = current.parent
        folder.mkdir(parents=True,exist_ok=True)
        destination = folder / "index.html"
        if destination.is_symlink():
            raise ValueError("Linked generated card file is not supported.")
        destination.write_text(page,encoding="utf-8")
        routes.append(route)
    (output / "assets").mkdir(exist_ok=True)
    for name in (*ASSETS,*MAP_ASSETS):
        destination = output / "assets" / name
        current = destination.parent
        while current != output:
            if current.is_symlink() or (hasattr(current,"is_junction") and current.is_junction()):
                raise ValueError("Linked generated Learn English asset directory is not supported.")
            current = current.parent
        if destination.is_symlink():
            raise ValueError("Linked generated Learn English assets are not supported.")
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source_path(root,"home/assets/" + name),destination)
    return {"cards":len(corner["cards"]),"columns":dict(Counter(c["column"] for c in corner["cards"])),"routes":routes,"language":"zh-CN"}
