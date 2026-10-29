"""Offline, Chinese-first English Corner: reviewed cards, never private notes."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
import json
import re
import shutil
import unicodedata

from markdown_it import MarkdownIt
from history_today import _public_url
from site_i18n import localize_page

CHINA = timezone(timedelta(hours=8))
COLUMNS = {"words", "classics", "between", "myths"}
LEVELS = {1: "入门", 2: "进阶", 3: "挑战"}
SECTIONS = {"words": ("故事", "可以这样用"), "classics": ("导读", "原文", "可以这样用"),
            "between": ("对照", "为什么", "可以这样用"), "myths": ("流行说法", "证据", "结论")}
SLUG = re.compile(r"[a-z][a-z0-9-]{1,63}")
PRIVATE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|Obsidian Vault|/(?:Users|mnt)/", re.I)
ASSETS = ("english-corner.css", "english-corner.js", "english-numbers.js")


def lf(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")


def text_hash(text):
    return sha256(lf(text).encode("utf-8")).hexdigest()


def word_count(text):
    return len(re.findall(r"[A-Za-z]+(?:[’'-][A-Za-z]+)*", text))


def public_text(value, maximum=2000, multiline=False):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum or PRIVATE.search(value)
            or any((ord(c) < 32 and not (multiline and c in "\n\r\t")) or ord(c) == 127 for c in value)):
        raise ValueError("English Corner needs public text without private paths or control characters.")
    return value


def public_url(value):
    parts = _public_url(value)
    if not parts.hostname or "." not in parts.hostname and ":" not in parts.hostname or "Obsidian Vault" in unquote(value) or re.search(r"[<>\\\x00-\x1f\x7f]", unquote(value)):
        raise ValueError("English Corner sources need safe public HTTPS URLs.")
    return value


def exact_fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
        raise ValueError("Incomplete or unknown English Corner fields.")


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
        raise ValueError("English Corner sources must stay in the public repository.")
    current = path
    while current != root:
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ValueError("Linked English Corner paths are not supported.")
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
        raise ValueError("Unsupported English Corner catalog.")
    seen_columns = set()
    for column in data["columns"]:
        exact_fields(column, ("id", "title", "english", "description"))
        if column["id"] not in COLUMNS or column["id"] in seen_columns:
            raise ValueError("English Corner needs four unique known columns.")
        seen_columns.add(column["id"])
        for key in ("title", "english", "description"):
            public_text(column[key], 160)
    if seen_columns != COLUMNS:
        raise ValueError("English Corner needs all four columns.")
    seen, cards = set(), []
    required = {"slug", "column", "title", "level", "tags", "summary", "sources", "related", "added", "status", "ai_assisted"}
    for item in data["cards"]:
        exact_fields(item, required, ("headword", "journey", "work", "verdict"))
        slug, column = item["slug"], item["column"]
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug == "tools" or slug in seen or column not in COLUMNS:
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
                    raise ValueError("The first English Corner release uses no images.")
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
                exact_fields(stop, ("language", "form", "period"))
                public_text(stop["language"], 60)
                public_text(stop["form"], 80)
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
    for relative in ("home/english-corner.template.html", *("home/assets/" + name for name in ASSETS)):
        if not source_path(root, relative).is_file():
            raise ValueError("Missing English Corner template or local asset.")
    catalog = json.loads(source_path(root, "english-corner/catalog.json").read_text(encoding="utf-8"))
    bodies = {}
    for card in catalog.get("cards", []):
        slug = card.get("slug")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug == "tools":
            raise ValueError("Invalid explicit card path.")
        bodies[slug] = source_path(root, "english-corner/cards/" + slug + ".md").read_text(encoding="utf-8")
    notes = json.loads(source_path(root, "english-corner/notes.json").read_text(encoding="utf-8"))
    articles = set()
    for directory in ("中文文章", "English Articles"):
        for path in (root / directory).rglob("*.md"):
            if not any(part.startswith(".") for part in path.relative_to(root).parts):
                articles.add("/articles/" + quote(path.relative_to(root).with_suffix(".html").as_posix(), safe="/"))
    return validate_corner(catalog, bodies, notes, articles, today)


def external(url, label):
    return f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)} ↗</a>'


def render_index(corner):
    counts = Counter(card["column"] for card in corner["cards"])
    columns = ''.join(f'<a class="ec-column" href="#column-{column["id"]}" data-ec-column="{column["id"]}"><h2>{escape(column["title"])}</h2><span lang="en">{escape(column["english"])}</span><p>{escape(column["description"])}</p><small>{counts[column["id"]]} 张</small></a>' for column in corner["columns"])
    filters = '<div class="ec-filters" hidden data-ec-filters><fieldset><legend>栏目</legend><button type="button" data-ec-filter="all" aria-pressed="true">全部</button>' + ''.join(f'<button type="button" data-ec-filter="{c["id"]}" aria-pressed="false">{escape(c["title"])}</button>' for c in corner["columns"]) + '</fieldset><fieldset><legend>难度</legend><button type="button" data-ec-level="all" aria-pressed="true">全部</button>' + ''.join(f'<button type="button" data-ec-level="{n}" aria-pressed="false">{v}</button>' for n,v in LEVELS.items()) + '</fieldset></div>'
    groups = []
    for column in corner["columns"]:
        rows = []
        for card in corner["cards"]:
            if card["column"] != column["id"]:
                continue
            rows.append(f'<article class="ec-row" id="card-{card["slug"]}" data-ec-row data-column="{card["column"]}" data-level="{card["level"]}"><div class="ec-row-heading"><h3><a data-ec-card href="/english/{card["slug"]}/">{escape(card["title"])}</a></h3><span class="ec-meta">{LEVELS[card["level"]]} · {escape(" / ".join(card["tags"]))}</span></div><p>{escape(card["summary"])}</p></article>')
        groups.append(f'<section data-ec-group id="column-{column["id"]}"><h2>{escape(column["title"])}</h2>{"".join(rows)}</section>')
    return ('<header class="ec-intro"><p class="ec-eyebrow" lang="en">English Corner</p><h1>雨聊英语角</h1><p class="ec-lead">英语专业毕业，英语不太行。现在开始补课，顺便带你逛逛英语世界：词从哪来，经典里写了什么，中英文差在哪。</p><a href="/today/#today-reading">每天一句英语名句，在「今天」页 →</a></header>'
            + '<nav class="ec-columns" aria-label="英语角栏目">' + columns + '</nav>' + filters
            + '<p data-ec-count class="ec-meta" role="status" aria-live="polite"></p><p data-ec-empty hidden>这个组合暂时没有卡片，试试其他栏目或难度。</p>'
            + '<div class="ec-directory">' + ''.join(groups) + '</div>'
            + '<section class="ec-tool-entry"><p class="ec-eyebrow">小工具</p><h2><a href="/english/tools/numbers/">中英数字转换器</a></h2><p>14亿是多少 billion？把万、亿和 thousand、million 放在一起看。</p></section>'
            + '<details class="ec-editorial"><summary>这一栏是怎么写的</summary><p>初稿有 AI 辅助，事实逐条核对公开来源；原文只收公版作品，自编例句明确标注。难词释义按语境整理，不是词典逐字引文。发现错误请<a href="mailto:xieyuqing.me@gmail.com">写信告诉我</a>。</p></details>')


def render_card(card, corner):
    column = next(c for c in corner["columns"] if c["id"] == card["column"])
    breadcrumb = f'<nav class="ec-breadcrumb" aria-label="面包屑"><a data-ec-return href="/english/#card-{card["slug"]}">英语角</a><span aria-hidden="true"> / </span><a data-ec-return href="/english/?column={card["column"]}#card-{card["slug"]}">{escape(column["title"])}</a></nav>'
    header = f'<header class="ec-card-intro"><h1>{escape(card["title"])}</h1><p class="ec-meta">{escape(column["title"])} · {LEVELS[card["level"]]} · {escape(" / ".join(card["tags"]))}</p></header><aside class="ec-summary"><h2>30秒版</h2><p>{escape(card["summary"])}</p></aside>'
    special = ''
    if card["column"] == "words" and card.get("journey"):
        stamps = '<span aria-hidden="true"> → </span>'.join('<span class="ec-stamp"><small>' + escape(s["language"]) + '</small><strong lang="en">' + escape(s["form"]) + '</strong>' + ('<small>' + escape(s["period"]) + '</small>' if s["period"] else '') + '</span>' for s in card["journey"])
        special = '<section class="ec-passport"><h2>单词护照 · <span lang="en">' + escape(card["headword"]) + '</span></h2><div>' + stamps + '</div></section>'
    elif card["column"] == "myths":
        special = '<p class="ec-verdict">判定：<strong>' + escape(card["verdict"]) + '</strong></p>'
    elif card["column"] == "classics":
        w = card["work"]
        special = ('<aside class="ec-edition"><p>' + escape(w["author_zh"]) + '（<span lang="en">' + escape(w["author_en"]) + '</span>） · ' + escape(w["title_zh"]) + ' <span lang="en">' + escape(w["title_en"]) + '</span></p><p>' + str(w["first_published"]) + '年首刊 · ' + escape(w["range"]) + '</p><p>' + external(w["edition_url"], w["edition"]) + '</p></aside>')
    parser = MarkdownIt("commonmark", {"html": False, "breaks": True}).enable("table")
    content = []
    for i, (heading, body) in enumerate(card["sections"].items()):
        original = card["column"] == "classics" and heading == "原文"
        heading_language = ' lang="zh-CN"' if original else ''
        content.append(f'<section class="ec-section{" ec-original" if original else ""}" id="reading-{i}"' + (' lang="en"' if original else '') + f'><h2{heading_language}>{escape(heading)}</h2>{parser.render(body)}</section>')
        if original:
            rows = ''.join('<tr><th scope="row" lang="en">' + escape(n["term"]) + '</th><td>' + escape(n["meaning"]) + '</td><td>' + external(n["source_url"],n["source_label"]) + '<small> · ' + escape(n["checked_on"]) + '</small></td></tr>' for n in corner["notes"][card["slug"]])
            content.append('<section class="ec-vocabulary"><h2>难词，放回这段话里看</h2><div class="ec-table"><table><thead><tr><th>词语</th><th>本段含义</th><th>词典依据</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>')
    sources = '<section class="ec-sources"><h2>来源与版本</h2><ol>' + ''.join('<li>' + external(s["url"], s["label"]) + '<small> · 核对于 ' + escape(s["checked_on"]) + '</small></li>' for s in card["sources"]) + '</ol>'
    if card["column"] == "classics":
        sources += '<p>公版范围：所引原文首刊于' + str(card["work"]["first_published"]) + '年，作者卒于' + str(card["work"]["author_died"]) + '年；按首刊满96年、作者去世满51年的保守门槛筛选。只取作品正文，不含现代编者导言或注释。</p>'
    sources += ('<p>本文初稿与自编例句有 AI 辅助；事实与引文按上述来源核对，中文释义为本站整理。</p>' if card["ai_assisted"] else '') + '</section>'
    titles = {c["slug"]: c["title"] for c in corner["cards"]}
    related = '<aside class="ec-related"><h2>接着逛逛</h2><ul>' + ''.join('<li><a href="' + escape(related_route(r,titles,{r} if r.startswith('/articles/') else set()),quote=True) + '">' + escape(titles.get(r, "谢雨卿的《英语的千和汉语的万》")) + ' →</a></li>' for r in card["related"]) + '</ul></aside>' if card["related"] else ''
    index = corner["cards"].index(card)
    previous_next = '<nav class="ec-adjacent" aria-label="相邻卡片">'
    if index:
        previous_next += f'<a href="/english/{corner["cards"][index-1]["slug"]}/">← {escape(corner["cards"][index-1]["title"])}</a>'
    if index + 1 < len(corner["cards"]):
        previous_next += f'<a href="/english/{corner["cards"][index+1]["slug"]}/">{escape(corner["cards"][index+1]["title"])} →</a>'
    return breadcrumb + header + special + '<div class="ec-prose">' + ''.join(content) + '</div>' + sources + related + previous_next + '</nav>'


def render_numbers():
    return '''<nav class="ec-breadcrumb" aria-label="面包屑"><a href="/english/">英语角</a> / 小工具</nav><header class="ec-card-intro"><p class="ec-eyebrow" lang="en">Numbers, in two rhythms</p><h1>中英数字转换器</h1><p class="ec-lead">中文四位一进，英文三位一进。同一个数，换种分法就看明白了。</p></header><section class="ec-number-tool" data-english-numbers><label for="english-number-input">输入一个数</label><input id="english-number-input" type="text" inputmode="text" value="14亿" autocomplete="off" spellcheck="false" aria-describedby="english-number-help english-number-error"><p id="english-number-help" class="ec-meta">支持阿拉伯数字、数字加万/亿或 thousand/million/billion/trillion，最多4位小数；范围为0至10¹⁶（不含）。暂不支持纯汉字数词及含义不同的“兆”。</p><div class="ec-examples" aria-label="换算示例"><span>试一试</span><button type="button" data-number-example="14亿">14亿</button><button type="button" data-number-example="960万">960万</button><button type="button" data-number-example="8300万">8300万</button><button type="button" data-number-example="48.6万">48.6万</button><button type="button" data-number-example="1.4 billion">1.4 billion</button></div><p id="english-number-error" role="status"></p><div id="english-number-results" aria-live="polite" aria-atomic="true"></div><noscript><p>转换需要 JavaScript。下方对照表仍可直接阅读。</p></noscript></section><section class="ec-prose"><h2>先记住这几个台阶</h2><div class="ec-table"><table><thead><tr><th>中文</th><th>英文</th><th>数值</th></tr></thead><tbody><tr><td>万</td><td lang="en">ten thousand</td><td>10,000</td></tr><tr><td>十万</td><td lang="en">a hundred thousand</td><td>100,000</td></tr><tr><td>百万</td><td lang="en">a million</td><td>1,000,000</td></tr><tr><td>千万</td><td lang="en">ten million</td><td>10,000,000</td></tr><tr><td>亿</td><td lang="en">a hundred million</td><td>100,000,000</td></tr><tr><td>十亿</td><td lang="en">a billion</td><td>1,000,000,000</td></tr></tbody></table></div><h2>读数的小习惯</h2><p>英文全拼采用美式写法，不加 and；英式常在百位后加 and，例如 one hundred and five。21至99的十位与个位之间用连字符。四位分节只用于观察中文单位，是演示写法，不当作英文标点规范。</p><p>示例只演示数字换算，不另外断言人口或面积。为什么中文和英文的台阶不同？读<a href="/english/qian-and-wan/">《英语的千和汉语的万》→</a></p><h2>参考</h2><p>单位与英语写法参见 <a href="https://dictionaryblog.cambridge.org/2016/08/31/one-thousand-one-hundred-and-ninety-three-how-to-say-numbers-1/" target="_blank" rel="noopener noreferrer">Cambridge Dictionary：怎样读数字 ↗</a>；另参见 <a href="https://www.uoc.edu/en/services/language/style/numbers" target="_blank" rel="noopener noreferrer">UOC 英语风格指南：数词、连字符和短标度 ↗</a>（核对于2026-10-29）。本工具说明与示例整理有 AI 辅助。</p></section>'''


def build_english_corner(root, output, address, corner):
    root, output = Path(root), Path(output)
    template = source_path(root, "home/english-corner.template.html").read_text(encoding="utf-8")
    pages = [("/english/", "雨聊英语角", "从词源故事到公版经典，给中文读者的英语知识与阅读。", render_index(corner)),
             ("/english/tools/numbers/", "中英数字转换器", "用万、亿和 thousand、million、billion 看同一个数。", render_numbers().replace('/english/qian-and-wan/', '/english/qian-and-wan/' if any(c['slug'] == 'qian-and-wan' for c in corner['cards']) else '/english/'))]
    pages.extend(("/english/" + card["slug"] + "/", card["title"], card["summary"], render_card(card,corner)) for card in corner["cards"])
    routes = []
    for route, title, description, content in pages:
        page = template
        for key, value in {"site_url":escape(address,quote=True),"route":route,"title":escape(title),"description":escape(description,quote=True),"content":content}.items():
            page = page.replace("{{" + key + "}}",value)
        if "{{" in page:
            raise ValueError("Unresolved English Corner template placeholder.")
        page = localize_page(page,root,address,route,"zh-CN",title=title + " · 谢雨卿",description=description)
        folder = output / route.strip("/")
        current = folder
        while current != output:
            if current.is_symlink() or (hasattr(current,"is_junction") and current.is_junction()):
                raise ValueError("Linked English Corner output is not supported.")
            current = current.parent
        folder.mkdir(parents=True,exist_ok=True)
        destination = folder / "index.html"
        if destination.is_symlink():
            raise ValueError("Linked generated card file is not supported.")
        destination.write_text(page,encoding="utf-8")
        routes.append(route)
    (output / "assets").mkdir(exist_ok=True)
    for name in ASSETS:
        destination = output / "assets" / name
        if destination.is_symlink():
            raise ValueError("Linked generated English Corner assets are not supported.")
        shutil.copy2(source_path(root,"home/assets/" + name),destination)
    return {"cards":len(corner["cards"]),"columns":dict(Counter(c["column"] for c in corner["cards"])),"routes":routes,"language":"zh-CN"}
