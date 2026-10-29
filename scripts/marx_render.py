"""Accessible static pages for the validated, Chinese-only Marx and Engels collection."""
from collections import Counter, defaultdict
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import unquote
import json
import re
import shutil

from markdown_it import MarkdownIt
from marx_engels import ASSETS, AI_NOTE, BRANCHES, CHINA, LEVELS, source_path
from site_i18n import localize_page

AUTHOR = {"marx": "马克思", "engels": "恩格斯", "marx-engels": "马克思、恩格斯"}
# The three tiers are a joke; the note keeps them from reading as verdicts on the works.
LEVEL_NOTE = "难度由浅到深：" + " → ".join(LEVELS.values()) + "。只是玩笑式的分档，不评价任何作品的立场。"


def difficulty(level):
    return "难度：" + LEVELS[level]


def link(url, label, external=False, attrs=""):
    extra = ' target="_blank" rel="noopener noreferrer"' if external else ""
    return f'<a href="{escape(url, quote=True)}"{extra}{attrs}>{escape(label)}' + (' <span aria-hidden="true">↗</span>' if external else "") + '</a>'


def header(title, description, breadcrumb=()):
    crumbs = [("/marx/", "读马恩"), *breadcrumb]
    return ('<nav class="me-breadcrumb" aria-label="面包屑">' + ' / '.join(link(*item) for item in crumbs)
            + '</nav><header class="me-intro"><h1>' + escape(title) + '</h1><p class="me-lead">' + escape(description) + '</p></header>')


def heading(ident, title, extra=""):
    return f'<div class="me-section-head"><h2 id="{ident}">{escape(title)}</h2>{extra}</div>'


def bookcase(data):
    spines = []
    labels = {1: "1843—1848年著作", 2: "1848—1859年著作", 3: "1864—1883年著作", 4: "恩格斯晚年著作",
              5: "资本论·第一卷", 6: "资本论·第二卷", 7: "资本论·第三卷", 8: "资本论·手稿选编", 9: "反杜林论·自然辩证法", 10: "马克思恩格斯书信"}
    for volume in data["wenji"]["volumes"]:
        no = volume["no"]
        spines.append(f'<a class="me-spine" href="/marx/wenji/{no}/" aria-label="第{no}卷：{escape(volume["span"], quote=True)}">'
                      f'<span class="me-volume">第{no}卷</span><strong>{escape(labels[no])}</strong></a>')
    return '<nav class="me-bookcase" aria-label="文集十卷书架">' + ''.join(spines) + '</nav>'


def nested(items):
    if not items:
        return ""
    return '<ul class="me-subsections">' + ''.join('<li>' + link(item["mia"], item["title"], True)
        + nested(item.get("sections", [])) + '</li>' for item in items) + '</ul>'


def page_range(value):
    if value is None:
        return ""
    start, end = value
    return f'目录第{start}页起' if end is None else f'目录第{start}—{end}页'


def volume_count(data, volume):
    no = volume['no']
    if no in (5, 6, 7):
        parts = data['capital']['volumes'][no - 5]['parts']
        return f'{len(parts)}篇 · {sum(len(p["chapters"]) for p in parts)}章'
    if no == 8:
        return f'{len(volume["works"])}组手稿'
    if no == 9:
        return f'{len(volume["works"])}部专著'
    if no == 10:
        return f'{len(volume["letters"])}封书信 · 另附年表'
    appendix = sum(w.get('kind') == 'appendix' for w in volume['works'])
    return f'{len(volume["works"]) - appendix}篇正文' + (f' · {appendix}篇附录' if appendix else '')


def work_route(data, ident):
    for item in data["items"].values():
        if item["kind"] == "works" and item["status"] == "published" and item["work"] == ident:
            return item["route"]
    return data["works"][ident]["mia"]


def render_work_list(data, works):
    rows = []
    for work in works:
        facts = [AUTHOR[work["author"]], str(work["year"]) if work["year"] is not None else "", page_range(work["pages"]),
                 "节选" if work["excerpt"] else "", difficulty(work["level"]), " / ".join(BRANCHES[b] for b in work["branch"])]
        title = ("★ " if work["editor_title"] else "") + work["title"]
        guide = work_route(data, work["id"])
        actions = link(work["mia"], "读原文", True)
        if guide.startswith("/marx/"):
            actions += link(guide, "本站导读 →")
        rows.append('<li id="work-' + work["id"] + '"><h3>' + escape(title) + '</h3><p class="me-meta">'
                    + escape(' · '.join(f for f in facts if f)) + '</p><div class="me-actions">' + actions + '</div>'
                    + nested(work.get("sections", [])) + '</li>')
    return '<ol class="me-toc">' + ''.join(rows) + '</ol>'


def render_wenji_index(data):
    edition = data["wenji"]["edition"]
    rows = ''.join('<li><h3>' + link(f'/marx/wenji/{v["no"]}/', f'第{v["no"]}卷 · {v["span"]}')
                   + '</h3><p>' + escape(v["summary"]) + '</p><p class="me-meta">' + escape(v["span"]) + ' · ' + volume_count(data, v) + '</p></li>' for v in data["wenji"]["volumes"])
    return (header("文集十卷", "先找一卷，再找一篇。") + bookcase(data)
            + '<section class="me-section"><h2>这套文集</h2><p>' + escape(edition["compiler"]) + '编译，'
            + escape(edition["publisher"]) + '，2009年版。</p><p>' + escape(edition["capital_note"]) + '</p>'
            + '<p class="me-meta">★表示编者拟定的标题；节选、附录与序言分别标明。篇目页码据目录，不是引句的精确页码。'
            + link('/marx/sources/', '版本、引文与校勘说明 →') + '</p></section><ol class="me-toc">' + rows + '</ol>')


def render_wenji_volume(data, volume):
    no = volume["no"]
    out = header(f'文集第{no}卷', volume["span"], [("/marx/wenji/", "文集十卷")])
    out += '<p>' + escape(volume["summary"]) + '</p><p class="me-meta">' + escape(volume["span"]) + ' · ' + link(volume["mia"], "中马库本卷目录", True) + '</p>'
    if no in (5, 6, 7):
        capital = data["capital"]["volumes"][no - 5]
        out += '<p>' + link(f'/marx/capital/{no - 4}/', '进入《资本论》本卷导读与目录 →') + '</p>'
        if no == 5:
            out += '<p class="me-basis">《资本论》第一卷在线文本据《马克思恩格斯全集》第23卷（人民出版社，1972）。</p>'
        out += render_capital_toc(data, capital)
    else:
        main = [w for w in volume["works"] if w.get("kind", "work") != "appendix"]
        appendices = [w for w in volume["works"] if w.get("kind") == "appendix"]
        out += render_work_list(data, main)
        if appendices:
            out += '<section class="me-section"><h2>附录</h2>' + render_work_list(data, appendices) + '</section>'
    if no == 10:
        grouped = defaultdict(list)
        for letter in volume.get("letters", []):
            grouped[letter["year"]].append(letter)
        out += '<nav class="me-actions" aria-label="书信年份">' + ' '.join(link(f'#year-{year}', str(year)) for year in sorted(grouped)) + '</nav><div class="me-letters">'
        for year, letters in sorted(grouped.items()):
            out += f'<section aria-labelledby="year-{year}"><h2 id="year-{year}">{year}</h2><ol start="{letters[0]["no"]}">'
            out += ''.join(f'<li id="letter-{letter["no"]:03}" value="{letter["no"]}">' + link(letter["mia"], letter["title"], True) + '</li>' for letter in letters) + '</ol></section>'
        out += '</div>'
        if volume.get("timeline"):
            out += '<section class="me-section"><h2>年表</h2><p>' + link(volume["timeline"]["mia"], volume["timeline"]["title"], True) + '</p></section>'
    note = '目录据中马库本卷整理。标注为目录页码的数字只帮助找到篇目，不能代替引文逐页核对。'
    if no not in (5, 6, 7) and volume.get("works"):
        note += LEVEL_NOTE
    return out + '<p class="me-editorial">' + note + '</p>'


def render_capital_toc(data, volume):
    out = ''
    if volume["front_matter"]:
        out += '<section class="me-section"><h2>序言与跋</h2>' + nested(volume["front_matter"]) + '</section>'
    for part in volume["parts"]:
        out += f'<section class="me-section" aria-labelledby="part-{part["no"]}"><h2 id="part-{part["no"]}">第{part["no"]}篇 · {escape(part["title"])}</h2><ol class="me-toc">'
        for chapter in part["chapters"]:
            guide = next((i["route"] for i in data["items"].values() if i["kind"] == "guides" and i["status"] == "published" and i["volume"] == volume["no"] and i["chapter"] == chapter["no"]), None)
            out += f'<li id="ch{chapter["no"]:02}"><h3>第{chapter["no"]}章 · {escape(chapter["title"])}</h3><div class="me-actions">' + link(chapter["mia"], "中文原文", True)
            if guide:
                out += link(guide, "本站导读 →")
            out += '</div>'
            if chapter.get('en'):
                numbers = Counter(e['no'] for e in chapter['en'])
                seen = Counter()
                english = []
                for entry in chapter['en']:
                    seen[entry['no']] += 1
                    label = f'Ch. {entry["no"]}' + (f' ({seen[entry["no"]]}/{numbers[entry["no"]]})' if numbers[entry['no']] > 1 else '')
                    english.append(link(entry['url'], label, True, ' lang="en" aria-label="' + escape(f'Chapter {entry["no"]}: {entry["title"]}', quote=True) + '"'))
                out += '<p class="me-meta">英文对应：' + ' · '.join(english) + '</p>'
            out += nested(chapter["sections"]) + '</li>'
        out += '</ol></section>'
    if volume.get("supplements"):
        out += '<section class="me-section"><h2>补充</h2>' + nested(volume["supplements"]) + '</section>'
    return out


def qa_date(article):
    found = re.search(r'/(\d{4}-\d{2}-\d{2})-', unquote(article))
    return found.group(1) if found else ''


def render_qa_index(data):
    # A quiet directory: the reading notes stay in their original articles and are only grouped here.
    out = header("问对录", "读《资本论》时写下的问答笔记，按章节归类。")
    groups = defaultdict(list)
    for item in data["qa"]:
        groups[(item["volume"], item["chapter"])].append(item)
    for (volume, chapter), items in sorted(groups.items(), key=lambda pair: (pair[0][0], pair[0][1] or 0)):
        ident = f'qa-{volume}-' + (f'ch{chapter:02}' if chapter else 'general')
        extra = ''
        if chapter is None:
            title = f'《资本论》第{volume}卷 · 序言、跋与总览'
        else:
            record = data["chapters"][(volume, chapter)]
            title = f'《资本论》第{volume}卷第{chapter}章 · {record["title"]}'
            guide = next((i["route"] for i in data["items"].values() if i["kind"] == "guides" and i["status"] == "published"
                          and i["volume"] == volume and i["chapter"] == chapter), None)
            extra = '<span class="me-actions">' + (link(guide, '本章导读 →') if guide else '') + link(record["mia"], '中文原文', True) + '</span>'
        out += f'<section class="me-section" aria-labelledby="{ident}">' + heading(ident, title, extra)
        sections = defaultdict(list)
        for item in items:
            sections[item["section"]].append(item)
        for section, entries in sorted(sections.items(), key=lambda pair: pair[0] or 0):
            if section is not None:
                subsections = data["chapters"][(volume, chapter)]["sections"]
                out += '<h3>' + escape(subsections[section - 1]["title"] if section <= len(subsections) else f'第{section}节') + '</h3>'
            out += '<ul class="me-qa">' + ''.join('<li>' + link(item["article"], item["title"])
                                                   + (f' <small class="me-meta">{qa_date(item["article"])}</small>' if qa_date(item["article"]) else '')
                                                   + '</li>' for item in entries) + '</ul>'
        out += '</section>'
    return out + '<p class="me-editorial">问对录是本站原有的读书文章，原文与署名都在文章里；这里只按章节归类。</p>'


def render_capital_index(data):
    descriptions = ["资本怎样在生产过程中增殖", "资本怎样在不同形态间循环", "从总过程看利润、利息与地租"]
    flow = ''.join(f'<a href="/marx/capital/{v["no"]}/"><small>第{v["no"]}卷 · {len(v["parts"])}篇{sum(len(p["chapters"]) for p in v["parts"])}章</small><strong>{escape(v["title"])}</strong><span>{descriptions[v["no"] - 1]}</span></a>' for v in data["capital"]["volumes"])
    return (header("《资本论》", "从生产到流通，再看资本主义生产的总过程。")
            + '<nav class="me-flow" aria-label="资本论三卷">' + flow + '</nav><section class="me-section"><h2>从哪里开始</h2><p>'
            + link('/marx/capital/routes/', '三条阅读路线 →') + '</p><p>' + link('/marx/capital/english/', '第一卷中英章节对应 →')
            + '</p></section><aside class="me-section"><h2>写成这本书之前</h2><p>《文集》第8卷选录1857—1858年、1861—1863年和1863—1865年的经济学手稿，可以沿着手稿看问题怎样形成。手稿与后来定稿各有语境，阅读时保留版本的区别。</p><p>'
            + link('/marx/wenji/8/', '第8卷：经济学手稿 →') + '</p></aside>')


def render_capital_volume(data, volume):
    no = volume["no"]
    out = header(f'《资本论》第{no}卷', volume["title"], [("/marx/capital/", "资本论")])
    out += '<p class="me-basis">' + ('中文在线文本据《马克思恩格斯全集》第23卷（1972）；在《文集》中对应第5卷。' if no == 1 else f'中文在线文本来自2009年《文集》第{no + 4}卷。') + '</p>'
    out += '<div class="me-actions">' + link(volume["mia"], "本卷中文原文目录", True) + link('/marx/capital/routes/', '阅读路线 →')
    if no == 1:
        out += link('/marx/capital/english/', '中英章节对应 →')
    return out + '</div>' + render_capital_toc(data, volume)


def render_english_comparison(data):
    volume = data["capital"]["volumes"][0]
    out = header("第一卷：中英章节对应", "中文25章，英文33章。顺着内容对照，保留各自的章号。", [("/marx/capital/", "资本论")])
    out += ('<div class="me-prose"><p>中文第一卷在线文本据《马克思恩格斯全集》第23卷（人民出版社，1972），采用德文第四版的25章编排。'
            'MIA英文第一卷以1887年首个英译本为底本，该英译据德文第三版，由Samuel Moore和Edward Aveling翻译、恩格斯编辑；MIA注明纳入部分德文第四版变动。英文为8篇33章。</p>'
            '<p>中文第四章在英文中分为第4—6章；中文第二十四章在英文中分为第26—32章。章节内部还会有编排与措辞差异，阅读时同时核对小节标题。</p></div>'
            '<p class="me-meta">' + link(volume["mia"], '中文版本说明', True) + ' · '
            + link(volume.get("en", {}).get("url", "https://www.marxists.org/archive/marx/works/1867-c1/index.htm"), '英文版本说明与目录', True) + '</p>')
    out += '<table class="me-comparison"><caption>第一卷章节对应表</caption><thead><tr><th scope="col">中文章</th><th scope="col">英文章</th></tr></thead><tbody>'
    for part in volume["parts"]:
        for chapter in part["chapters"]:
            english = '<br>'.join(link(item["url"], f'{item["no"]}. {item["title"]}', True) for item in chapter["en"])
            out += '<tr><th scope="row">' + link(chapter["mia"], f'{chapter["no"]}. {chapter["title"]}', True) + '</th><td lang="en">' + english + '</td></tr>'
    out += '</tbody></table><p class="me-meta">第二、三卷中英文逻辑章数分别为21章和52章；同一英文章有时拆成多个网页，链接数量不等于章数。</p>'
    return out


def render_routes(data):
    out = header("《资本论》的三条阅读路线", "可以从头读，也可以带着一个问题进去。", [("/marx/capital/", "资本论")])
    for route in data["capital"]["routes"]:
        out += f'<section class="me-section" aria-labelledby="route-{route["id"]}"><h2 id="route-{route["id"]}">{escape(route["title"])}</h2><p>{escape(route["summary"])}</p><ol class="me-qa">'
        for step in route["steps"]:
            if "chapter" in step:
                url = f'/marx/capital/{step["volume"]}/#ch{step["chapter"]:02}'
            else:
                url = work_route(data, step["work"])
            out += '<li><strong>' + link(url, step["title"], url.startswith('https:')) + '</strong><p>' + escape(step["note"]) + '</p></li>'
        out += '</ol><p class="me-meta">路线依据：' + link(route["basis"]["url"], route["basis"]["locator"], True) + '</p></section>'
    return out + '<p class="me-editorial">路线说明为本站据原著整理。旧书信所用的章号与后来的定本不同，以上链接按本栏目所用中文25章体系对应，依据处保留原信。</p>'


def render_citations(data, identifiers, title="原著怎么说"):
    out = '<section class="me-citations"><h2>' + escape(title) + '</h2>'
    for ident in identifiers:
        citation = data["citations"][ident]
        if citation["vol"] == 5:
            edition = '中马库（据《全集》第23卷，1972）'
        elif citation["page"] is not None:
            edition = f'文集第{citation["vol"]}卷 · 目录第{citation["page"]}页起'
        else:
            edition = f'文集第{citation["vol"]}卷（2009）'
        out += f'<figure class="me-citation" data-citation="{ident}"><blockquote>{escape(citation["text"])}</blockquote><figcaption>'
        out += link(citation["url"], citation["locator"], True) + '<br>' + escape(edition)
        if citation["errata"]:
            out += ' · ' + '、'.join(link('/marx/sources/#errata-' + error, '电子录入校勘') for error in citation["errata"])
        if citation.get("en"):
            english = citation["en"]
            out += '<details class="me-english"><summary>英文对照</summary><p lang="en">' + escape(english["text"]) + '</p><p>' + link(english["url"], english["translator"], True) + '</p></details>'
        out += '</figcaption></figure>'
    return out + '</section>'


def render_related(data, item):
    targets = [data["items"][i] for i in item["related"] if data["items"][i]["status"] == "published"]
    if not targets:
        return ''
    return '<section class="me-section"><h2>接着读</h2><ul class="me-qa">' + ''.join('<li>' + link(target["route"], target["title"]) + '</li>' for target in targets) + '</ul></section>'


def render_content(data, item):
    category, kind = item["category"], item["kind"]
    breadcrumb = [("/marx/capital/", "资本论")] if kind == "guides" else []
    out = '<div class="me-reading">' + header(item["title"], item["summary"], breadcrumb)
    out += '<p class="me-meta">' + escape(difficulty(item["level"]) + ' · ' + ' / '.join(BRANCHES[b] for b in item["branch"])) + '</p>'
    if category == "myths":
        out += '<p><span class="me-verdict">' + escape(item["verdict"]) + '</span></p>'
    parser = MarkdownIt("commonmark", {"html": False}).enable("table")
    if kind == "cards":
        out += render_citations(data, item["citations"])
    out += '<article class="me-prose">'
    for title, body in item["sections"].items():
        out += '<section><h2>' + escape(title) + '</h2>'
        if title == "例子":
            out += '<p class="me-example-note">例子为本站编写，现代类比只帮助理解，不是原著中的实例。</p>'
        out += parser.render(body) + '</section>'
        if kind == "guides" and title == "一句话":
            chapter = data["chapters"][(item["volume"], item["chapter"])]
            out += '<section><h2>本章结构</h2>' + nested(chapter["sections"]) + '</section>'
    out += '</article>'
    if kind in ("works", "guides"):
        out += render_citations(data, item["citations"], "原文片段")
    if kind == "works":
        work = data["works"][item["work"]]
        out += '<p>' + link(work["mia"], '读这篇原著', True) + '</p>'
    if kind == "guides":
        chapter = data["chapters"][(item["volume"], item["chapter"])]
        out += '<section class="me-section"><h2>英文对应</h2><ul class="me-qa">' + ''.join('<li lang="en">' + link(e["url"], f'Chapter {e["no"]}: {e["title"]}', True) + '</li>' for e in chapter.get("en", [])) + '</ul></section>'
        out += '<p>' + link(chapter["mia"], '读本章中文原文', True) + ' · ' + link('/marx/capital/english/', '完整中英章号对应 →') + '</p>'
    if item.get("sources"):
        out += '<section class="me-section"><h2>延伸阅读</h2><ul class="me-source-list">' + ''.join('<li>' + link(source["url"], source["label"], True) + '</li>' for source in item["sources"]) + '</ul></section>'
    for level, title in ((1, '原著参考'), (3, '题注与背景资料')):
        references = [r for r in item.get('references', []) if r['level'] == level]
        if references:
            out += '<section class="me-section"><h2>' + title + '</h2><ul class="me-source-list">' + ''.join('<li>' + link(r['url'], r['label'], True) + '</li>' for r in references) + '</ul></section>'
    out += render_related(data, item)
    if item["ai_assisted"]:
        out += '<p class="me-editorial">' + AI_NOTE + '。' + link('/marx/sources/', '版本与引用说明') + '。</p>'
    out += '<p>' + link('/marx/#directory', '返回读马恩目录 →', attrs=' data-me-return') + '</p></div>'
    return out


def render_sources(data):
    out = header("版本、引文与校勘", "把解读和原文分开，也把依据留在读者能找到的地方。")
    out += ('<div class="me-reading me-prose"><section><h2>这栏依据哪一版</h2><p>' + escape(data["intro"]["basis"]) + '</p>'
            '<p>《文集》十卷由中央编译局组织编译，人民出版社2009年出版。中马库提供志愿者录入的电子文本，本栏目保存目录、短引文和本站解读，不复制整部作品。读原著的链接直接前往中马库。</p>'
            '<p>中文引文直接取自对应中文本。英文只供对照和查阅，保留其独立的翻译、版本和章节编号，不把英文译成中文后冒充文集原句，也不用英文单独决定中文校勘。</p>'
            '<p>' + link('https://www.marxists.org/chinese/marx-engels2/index.htm', '中马库：文集十卷', True) + ' · '
            + link('https://www.marxists.org/chinese/marx/capital/index.htm', '资本论第一卷：1972年版本说明', True) + '</p></section>'
            '<section><h2>目录上的符号与页码</h2><p>星号表示编者拟定的标题；方括号内的文字为编者所加；原著引文里的尖括号内容为马克思、恩格斯所加。没有注明编者注的脚注属于原作者。保留原文的括号和外文，不自行回译。</p>'
            '<p>第1—4卷的页码取自目录，标明篇目或小节从哪一页开始，不能当作引句的精确页码。第5卷按1972年《全集》第23卷定位，不套用2009年文集页码；其他卷以篇、章、节或书信编号定位。</p><p>'
            + link('https://www.marxists.org/chinese/marx-engels2/01/00a.htm', '文集编辑说明', True) + '</p></section>'
            '<section><h2>短引文与本站解读</h2><p>每条引文不超过150字，每页总引文不超过600字且不超过解读正文的一半；同一作品在本栏的累计引用不超过2500字及原文的十分之一，少于3000字的短作品以三分之一为限。《资本论》每卷累计上限为10000字，同时受原文比例限制。重复显示也累计计算。</p>'
            '<p>这些是本站的编辑限额，不是法律授权或适用所有作品的法律标准。短引文服务于讨论，完整作品请读原著。省略不改变主旨，不把多个版本拼成一句；引用作者转述他人的话时，注明是谁在说。下方校勘表的原字与正字另外统计，并保守计入来源页和相关作品的摘录额度；电子页的错字不当作作者原话。</p>'
            '<p>导读、概念解释和例子为本站编写，有AI辅助，所引中文逐字核对所链原文。现代例子只帮助理解，不充当马克思、恩格斯当年的例证；作品的题注、索引和年表只用于背景转述。现有问对录属于谢雨卿原有文章，保留原文和署名。</p></section>'
            '<section><h2>和「马克思主义名句」的关系</h2><p>「今天」页每天一句的马克思主义名句是另一套资料：除马克思、恩格斯外，还收列宁、毛泽东等人的名句，有自己的选句和出处规则。读马恩只收马恩，引文以《文集》为准，所以同一句话在两边的版本或链接可能不同。</p><p>'
            + link('/today/#daily-quotation-card', '去「今天」页读名句 →') + ' · ' + link('/assets/quotes-sources.md', '名句的逐条出处') + '</p></section>'
            '<section><h2>怎样核对与阅读</h2><p>每条引用保留作品、版本、定位和核查日期，核查记录与公开文字使用指纹对应。指纹能发现文字或记录变化，不能替代思想内容和语境的审读。关于社会历史的分析，可从恩格斯致布洛赫的书信进入，同时回到作品讨论的具体条件。</p><p>'
            + link('https://www.marxists.org/chinese/marx-engels2/10/240.htm', '恩格斯致约瑟夫·布洛赫（1890年9月21—22日）', True)
            + '</p><p>构建只读仓库内已整理的资料；浏览、换卡和筛选不会自动请求中马库。只有主动打开原文链接才会前往外站。本栏不保存阅读偏好，不需要账号。</p></section></div>')
    out += '<section class="me-section" aria-labelledby="errata"><h2 id="errata">电子录入校勘</h2><p>下面只列本轮已复核的改动。优先依据中马库另一份中文本；明显页眉混入或识别错误另说明上下文。拿不准的引文暂不选用。欢迎' + link('mailto:xieyuqing.me@gmail.com', '指出问题') + '。</p>'
    for correction in data["errata"].values():
        out += '<article class="me-errata" id="errata-' + correction["id"] + '"><h3>' + link(correction["url"], '原电子页面', True) + '</h3><p><del>' + escape(correction["wrong"]) + '</del> → <ins>' + escape(correction["right"]) + '</ins></p><p>' + escape(correction["basis"]) + '</p>'
        if correction.get("evidence_url"):
            out += '<p>' + link(correction["evidence_url"], '中文校对依据', True) + '</p>'
        out += '<p class="me-meta">核对：' + correction["checked_on"] + '</p></article>'
    if not data["errata"]:
        out += '<p>本版尚无采用的电子录入校勘。</p>'
    out += '</section><section class="me-section"><h2>所引篇目与定位</h2><ul class="me-source-list">'
    out += ''.join('<li id="source-' + citation["id"] + '">' + link(citation["url"], citation["locator"], True)
                   + '<small>' + ('《全集》第23卷，1972' if citation["vol"] == 5 else f'文集第{citation["vol"]}卷，2009')
                   + ' · 核对：' + citation["checked_on"] + '</small></li>' for citation in data["citations"].values())
    return out + '</ul></section>'


def day_seed(key):
    value = 2166136261
    for character in key:
        value = ((value ^ ord(character)) * 16777619) & 0xffffffff
    return value


def render_index(data):
    intro = data["intro"]
    out = ('<header class="me-intro"><p class="me-kicker">从原著出发</p><h1>' + escape(intro["name"]) + '</h1><p class="me-lead">' + escape(intro["intro"]) + '</p><p class="me-basis">' + escape(intro["basis"]) + '</p>'
           + '<p class="me-quote-entry">' + link('/today/#daily-quotation-card', '每天一句马克思主义名句，在「今天」页 →') + '</p></header>')
    out += ('<section aria-labelledby="two-doors"><h2 id="two-doors">从两扇门进去</h2><div class="me-doors"><article class="me-door"><h3>'
            + link(work_route(data, 'german-ideology'), '人们怎样生活，怎样创造历史') + '</h3><p>先从现实的人怎样生产、交往和生活读起，再看制度与观念的变化。这扇门通向唯物史观。</p></article><article class="me-door"><h3>'
            + link('/marx/capital/', '资本怎样增殖') + '</h3><p>从商品和劳动走向剩余价值，再看生产、流通与分配的联系。这扇门通向《资本论》。</p></article></div><p class="me-meta">两扇门的概括据恩格斯'
            + link(data['works']['funeral-speech']['mia'], '《在马克思墓前的讲话》', True) + '所概括的两个发现转述。</p></section>')
    out += '<section class="me-section">' + heading('books', '十卷书架', link('/marx/wenji/', '看完整目录 →')) + bookcase(data) + '</section>'
    cards = [item for item in data["items"].values() if item["kind"] == 'cards' and item["status"] == 'published']
    if cards:
        key = datetime.now(CHINA).date().isoformat()
        selected = cards[day_seed(key) % len(cards)]
        out += ('<section class="me-section"><article class="me-daily" data-me-daily data-slug="' + selected['slug'] + '"><div class="me-daily-head"><h2>今日一卡</h2><button class="me-swap" data-me-next type="button" hidden><span aria-hidden="true">↻</span> 换一张</button></div><div aria-live="polite" aria-atomic="true"><h3>'
                + link(selected['route'], selected['title'], attrs=' data-me-daily-title') + '</h3><p data-me-daily-summary>' + escape(selected['summary']) + '</p><time class="me-meta" data-me-daily-date datetime="' + key + '">' + key + ' · 北京时间</time></div></article></section>')
        deck = [{key: item[key] for key in ('slug', 'title', 'summary', 'route')} for item in cards]
        out += '<script type="application/json" data-me-deck-data>' + json.dumps(deck, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026') + '</script>'
    out += '<section class="me-section"><h2>先选一条路</h2><div class="me-route-grid">'
    entries = [(work_route(data, 'funeral-speech'), '十分钟：先看一幅全景', '读恩格斯在马克思墓前的讲话，先认识他怎样概括马克思的工作。'),
               (work_route(data, 'manifesto'), '一周：从三篇短著出发', '读《共产党宣言》《雇佣劳动与资本》《工资、价格和利润》，把问题带进下一篇。'),
               ('/marx/capital/routes/#route-marx-recommended', '一年：走进《资本论》', '从工作日、劳动组织和原始积累进入，再回到商品；沿原信建议安排阅读。')]
    for index, (url, title, summary) in enumerate(entries):
        out += '<article class="me-route-card"><h3>' + link(url, title, url.startswith('https:')) + '</h3><p>' + escape(summary) + '</p><p class="me-meta">'
        if index == 0:
            out += link(data['works']['funeral-speech']['mia'], '读原文', True)
        elif index == 1:
            out += '原文：' + ' · '.join(link(data['works'][ident]['mia'], label, True) for ident, label in [('manifesto', '宣言'), ('wage-labour-capital', '雇佣劳动'), ('value-price-profit', '工资与利润')])
        else:
            out += link('/marx/capital/1/ch01/', '第一章导读') + ' · ' + link(data['capital']['volumes'][0]['mia'], '中文全卷', True) + ' · ' + link(data['works']['letter-099']['mia'], '推荐次序原信', True)
        out += '</p></article>'
    out += '</div><p class="me-meta">一周路线：' + ' → '.join(link(work_route(data, work), data['works'][work]['title'], work_route(data, work).startswith('https:')) for work in ('manifesto', 'wage-labour-capital', 'value-price-profit')) + '。</p></section>'
    out += '<section class="me-section" aria-labelledby="directory"><h2 id="directory">带着问题读</h2><div class="me-filters" data-me-filters hidden><fieldset><legend>理论分支</legend><button type="button" data-me-branch="all" aria-pressed="true">全部</button>'
    out += ''.join(f'<button type="button" data-me-branch="{key}" aria-pressed="false">{label}</button>' for key, label in BRANCHES.items()) + '</fieldset><fieldset><legend>难度</legend><button type="button" data-me-level="all" aria-pressed="true">全部</button>'
    out += ''.join(f'<button type="button" data-me-level="{key}" aria-pressed="false">{label}</button>' for key, label in LEVELS.items()) + '</fieldset></div><p class="me-meta me-level-note">' + LEVEL_NOTE + '</p><p class="me-meta" data-me-count role="status"></p><p data-me-empty hidden>这个组合暂时没有卡片，试试其他分支或难度。</p><div class="me-directory">'
    for column in data['catalog']['columns']:
        out += '<section class="me-directory-group" data-me-group><h2>' + escape(column['title']) + '</h2><p class="me-meta">' + escape(column['description']) + '</p>'
        for card in cards:
            if card['column'] != column['id']:
                continue
            out += '<article class="me-row" data-me-row data-branch="' + ' '.join(card['branch']) + '" data-level="' + str(card['level']) + '"><h3>' + link(card['route'], card['title'], attrs=' data-me-card-link') + '</h3><p>' + escape(card['summary']) + '</p><p class="me-meta">' + escape(difficulty(card['level']) + ' · ' + ' / '.join(card['tags'])) + '</p></article>'
        out += '</section>'
    out += '</div></section>'
    # 问对录 stays low-key: one small button to its own directory page.
    out += '<p class="me-minor-links"><a class="me-minor-link" href="/marx/qa/">问对录</a></p>'
    return out + '<p class="me-editorial">本站整理与解读有AI辅助，中文引文逐字核对所链原文。' + link('/marx/sources/', '版本、引文与校勘说明 →') + '</p>'


def build_pages(root, output, address, data):
    root, output = Path(root), Path(output)
    template = source_path(root, 'home/marx.template.html').read_text(encoding='utf-8')
    pages = [('/marx/', data['intro']['name'], data['intro']['description'], render_index(data)),
             ('/marx/wenji/', '文集十卷', '《马克思恩格斯文集》2009年版十卷目录。', render_wenji_index(data)),
             ('/marx/capital/', '《资本论》', '生产、流通、总过程：资本论三卷导航。', render_capital_index(data)),
             ('/marx/capital/english/', '第一卷中英章节对应', '把中文25章与英文33章按实际内容对应。', render_english_comparison(data)),
             ('/marx/capital/routes/', '资本论阅读路线', '据原著说明整理的三条资本论阅读路线。', render_routes(data)),
             ('/marx/sources/', '版本、引文与校勘', '读马恩的中文版本、引文边界、核对方法与电子录入校勘。', render_sources(data)),
             ('/marx/qa/', '问对录', '《资本论》读书问答，按章节归类的目录。', render_qa_index(data))]
    pages.extend((f'/marx/wenji/{v["no"]}/', f'文集第{v["no"]}卷', v['summary'], render_wenji_volume(data, v)) for v in data['wenji']['volumes'])
    pages.extend((f'/marx/capital/{v["no"]}/', f'资本论第{v["no"]}卷', v['title'], render_capital_volume(data, v)) for v in data['capital']['volumes'])
    pages.extend((item['route'], item['title'], item['summary'], render_content(data, item)) for item in data['items'].values() if item['status'] == 'published')
    for route, title, description, content in pages:
        # The 问对录 directory only lists the author's own articles, so it carries no AI note.
        if route not in ('/marx/', '/marx/qa/') and AI_NOTE not in content:
            content += '<p class="me-editorial">目录与说明据所链原文整理，包含AI辅助。' + link('/marx/sources/', '版本与核对说明 →') + '</p>'
        page_title = title if route == '/marx/' else title + ' · ' + data['intro']['name']
        page = template
        for key, value in {'site_url': escape(address, quote=True), 'route': route, 'title': escape(page_title), 'description': escape(description, quote=True), 'content': content}.items():
            page = page.replace('{{' + key + '}}', value)
        if '{{' in page:
            raise ValueError('读马恩：模板存在未替换占位符。')
        page = localize_page(page, root, address, route, 'zh-CN', title=page_title, description=description)
        folder = source_path(output, route.strip('/'))
        folder.mkdir(parents=True, exist_ok=True)
        source_path(output, route.strip('/') + '/index.html').write_text(page, encoding='utf-8')
    asset_dir = source_path(output, 'assets')
    asset_dir.mkdir(exist_ok=True)
    for name in ASSETS:
        shutil.copy2(source_path(root, 'home/assets/' + name), source_path(output, 'assets/' + name))
    return {'routes': [p[0] for p in pages], 'cards': dict(Counter(i['category'] for i in data['items'].values() if i['kind'] == 'cards' and i['status'] == 'published')),
            'work_guides': sum(i['kind'] == 'works' and i['status'] == 'published' for i in data['items'].values()),
            'chapter_guides': sum(i['kind'] == 'guides' and i['status'] == 'published' for i in data['items'].values()),
            'citations': len(data['citations']), 'quotation_budgets': data['budgets'], 'language': 'zh-CN'}


