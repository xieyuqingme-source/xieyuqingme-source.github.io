"""Render the reviewed anthology independently of original articles and translations."""
from collections import Counter
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import urlencode, urlsplit
import ipaddress
from markdown_it.token import Token
import json
import re
import shutil
import unicodedata

from markdown_it import MarkdownIt

LANGUAGES = {"zh-CN": "中文", "en": "English", "fr": "Français"}


def normalized_hash(raw):
    return sha256(raw.replace(b"\r\n", b"\n")).hexdigest()


def parse_source(text):
    """Only H2 headings delimit works; attribution is retained verbatim when present."""
    text = text.replace("\r\n", "\n")
    headings = list(re.finditer(r"^## ([^\n]+)$", text, re.M))
    if not headings or text[:headings[0].start()].strip():
        raise ValueError("Anthology content needs H2 work titles and no unreviewed preamble.")
    works = []
    for i, heading in enumerate(headings):
        body = text[heading.end():headings[i + 1].start() if i + 1 < len(headings) else len(text)].strip()
        body = re.sub(r"(?:\s*\n[ \t]*---[ \t]*)+\s*$", "", body).strip()
        lines = body.splitlines()
        credit = lines[-1].strip() if lines else ""
        if re.fullmatch(r"[^\n·。！？]{1,12}·[^\n。！？]{1,20}", credit):
            body = "\n".join(lines[:-1]).rstrip()
        else:
            credit = ""
        if not body:
            raise ValueError("An anthology work cannot be empty.")
        works.append({"title": heading.group(1).strip(), "body": body, "credit": credit})
    return works


def load_anthology(root):
    folder = Path(root) / "anthology"
    catalog = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    if set(catalog) != {"version", "collections"} or catalog["version"] != 1:
        raise ValueError("Unsupported anthology catalog.")
    works, slugs, files = [], set(), set()
    for group in catalog["collections"]:
        if set(group) != {"file", "category", "language", "sha256_lf", "works"}:
            raise ValueError("Unsupported anthology collection metadata.")
        name = group["file"]
        if not isinstance(name, str) or Path(name).name != name or not name.endswith(".md") or "\\" in name:
            raise ValueError("Anthology sources must be explicit local Markdown basenames.")
        if name in files or group["language"] not in LANGUAGES or not group["category"].strip():
            raise ValueError("Duplicate anthology source or invalid category/language.")
        files.add(name)
        source = folder / "content" / name
        if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction())
               for p in (folder, source.parent, source)):
            raise ValueError("Linked anthology sources are not supported.")
        raw = source.read_bytes()
        if normalized_hash(raw) != group["sha256_lf"]:
            raise ValueError("Anthology source changed; review the text and catalog before publishing.")
        entries = parse_source(raw.decode("utf-8-sig"))
        if [w["title"] for w in entries] != [w["title"] for w in group["works"]]:
            raise ValueError("Anthology titles must match the reviewed catalog in source order.")
        for item, metadata in zip(entries, group["works"]):
            if set(metadata) != {"title", "slug"} or not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", metadata["slug"]) or metadata["slug"] in slugs:
                raise ValueError("Anthology work slugs must be unique and stable.")
            slugs.add(metadata["slug"])
            item.update(slug=metadata["slug"], category=group["category"], language=group["language"], source=name)
            works.append(item)
    if not works:
        raise ValueError("The anthology must have at least one reviewed work.")
    return works


def route(work):
    return "/anthology/" + work["slug"] + "/"



def public_https_url(value):
    try:
        p = urlsplit(value)
        host = (p.hostname or '').lower()
        if p.scheme != 'https' or not host or p.username or p.password or p.port not in {None, 443} or p.fragment or '\\' in value:
            return False
        if host == 'localhost' or host.endswith(('.local', '.localhost', '.internal')): return False
        try:
            if not ipaddress.ip_address(host).is_global: return False
        except ValueError: pass
        return '.' in host
    except ValueError: return False


def load_glossary(root, works):
    """Only explicitly verified, contextual notes reach the rendered reader."""
    path = Path(root) / 'anthology/glossary.json'
    if path.is_symlink():
        raise ValueError('Linked anthology glossary is not supported.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if set(data) != {'version', 'works'} or data['version'] != 1 or not isinstance(data['works'], dict):
        raise ValueError('Unsupported glossary structure.')
    known = {w['slug'] for w in works}
    if set(data['works']) - known:
        raise ValueError('Glossary entries require an existing anthology work.')
    result = {}
    for slug, entries in data['works'].items():
        if not isinstance(entries, list):
            raise ValueError('Contextual glossary entries must be a list.')
        seen = set()
        for entry in entries:
            required = {'term', 'explanation', 'source', 'verification'}
            if not isinstance(entry, dict) or not required.issubset(entry) or set(entry) - required - {'edition', 'page', 'source_url', 'checked_on', 'context'}:
                raise ValueError('Glossary entries need text, source and verification metadata.')
            if entry['verification'] not in {'verified', 'pending'}:
                raise ValueError('Unknown glossary verification status.')
            if any(not isinstance(value, str) or len(value) > 2000 or any(ord(c) < 32 for c in value)
                   or (key != 'source_url' and re.search(r'[A-Za-z]:[\\/]|Obsidian Vault', value)) for key, value in entry.items()):
                raise ValueError('Invalid public glossary text.')
            key = unicodedata.normalize('NFKC', entry['term']).strip().lower()
            if not key or len(entry['term']) > 80 or key in seen:
                raise ValueError('Glossary terms must be nonempty and unique within a work.')
            seen.add(key)
            if entry['verification'] == 'verified':
                if not entry['source'].strip() or not entry['explanation'].strip():
                    raise ValueError('Verified notes require an actual source and explanation.')
                if not public_https_url(entry.get('source_url', '')):
                    raise ValueError('Verified notes require a public HTTPS source link.')
                body = next(w['body'] for w in works if w['slug'] == slug)
                if entry['term'] not in body or (entry.get('context') and entry['context'] not in body):
                    raise ValueError('Verified terms and context must occur in the matching work.')
                if entry.get('checked_on') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', entry['checked_on']):
                    raise ValueError('Invalid glossary check date.')
                result.setdefault(slug, []).append(entry)
    return result


def plain(text):
    parser = MarkdownIt("commonmark", {"html": False})
    tokens = parser.parse(text)
    return " ".join(child.content for token in tokens if token.children
                    for child in token.children if child.type in {"text", "code_inline"})


def render_work(work, notes=()):
    parser = MarkdownIt("commonmark", {"html": False, "breaks": True})
    tokens = parser.parse(work["body"])
    sections = [("original", "原文")]
    for i, token in enumerate(tokens):
        if token.type == "heading_open":
            # Source H3+ headings remain optional notes/translation/appreciation sections.
            identifier = "section-" + str(len(sections))
            token.attrSet("id", identifier)
            sections.append((identifier, tokens[i + 1].content))
    # Mark only the reviewed occurrence in its exact context, preserving all text.
    marked = set()
    for token in tokens:
        if not token.children: continue
        for child in token.children:
            if child.type != 'text': continue
            spans = []
            for index, entry in enumerate(notes):
                if index in marked: continue
                context = entry.get('context') or entry['term']
                at = child.content.find(context)
                offset = context.find(entry['term'])
                if at < 0 or offset < 0: continue
                start, end = at + offset, at + offset + len(entry['term'])
                if any(start < b and end > a for a, b, _ in spans): continue
                spans.append((start, end, index)); marked.add(index)
            if spans:
                original, parts, cursor = child.content, [], 0
                for start, end, index in sorted(spans):
                    text = original[start:end]
                    parts += [escape(original[cursor:start]), f'<span class="anthology-annotation" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="anthology-note" aria-label="查看{escape(text, quote=True)}注释" data-note-index="{index}">{escape(text)}</span>']
                    cursor = end
                parts.append(escape(original[cursor:]))
                child.type = 'html_inline'; child.content = ''.join(parts)
    body = parser.renderer.render(tokens, parser.options, {})
    return body, sections


def build_anthology(root, output, address):
    root, output = Path(root), Path(output)
    works = load_anthology(root)
    glossary = load_glossary(root, works)
    glossary_total = sum(map(len, glossary.values()))
    template = (root / "home/anthology.template.html").read_text(encoding="utf-8")
    categories = Counter(w["category"] for w in works)

    def write(path, title, description, content):
        page = template
        for key, value in {"site_url": escape(address, quote=True), "route": path,
                           "title": escape(title), "description": escape(description, quote=True), "content": content}.items():
            page = page.replace("{{" + key + "}}", value)
        if "{{" in page:
            raise ValueError("Unresolved anthology template placeholder.")
        target = output / path.lstrip("/") / "index.html"
        if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in (output / "anthology", target.parent, target)):
            raise ValueError("Linked anthology output is not supported.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8", newline="\n")

    cards = []
    for w in works:
        excerpt = plain(w["body"])
        cards.append(f'''<li class="anthology-card" id="entry-{w['slug']}" data-work data-category="{escape(w['category'], quote=True)}" data-language="{w['language']}" data-search="{escape(' '.join((w['title'], w['credit'], w['category'], excerpt)), quote=True)}">
<p class="anthology-meta">{escape(w['category'])} <span aria-hidden="true">·</span> <span lang="{w['language']}">{LANGUAGES[w['language']]}</span></p>
<h2 lang="{w['language']}"><a data-detail href="{route(w)}">{escape(w['title'])}</a></h2>
<p class="anthology-credit">{escape(w['credit']) if w['credit'] else '源文未标注作者与时代'}</p>
<p class="anthology-excerpt" lang="{w['language']}">{escape(excerpt[:125])}{'…' if len(excerpt) > 125 else ''}</p>
<a class="anthology-read" data-detail href="{route(w)}" aria-label="阅读全文：{escape(w['title'], quote=True)}">阅读全文 <span aria-hidden="true">→</span></a></li>''')
    category_options = ''.join(f'<option value="{escape(c, quote=True)}">{escape(c)}（{n}）</option>' for c, n in categories.items())
    language_options = ''.join(f'<option value="{code}">{label}</option>' for code, label in LANGUAGES.items() if any(w['language'] == code for w in works))
    category_links = ''.join(f'<li><a href="/anthology/?{escape(urlencode({"category": c}), quote=True)}#catalog">{escape(c)}<span>{n}</span></a></li>' for c, n in categories.items())
    index = f'''<section class="anthology-intro"><p class="eyebrow"><span aria-hidden="true"></span> ANTHOLOGY · 阅读与收藏</p>
<h1>雨聊文选</h1><p>把喜欢的文字，留在这里慢慢读。</p><p class="anthology-intro-note">{len(works)} 篇选文 · {len(categories)} 类 · 中文、English、Français 原文<br><span lang="en">Selected readings in their original languages. No automatic translation.</span></p></section>
<div class="anthology-layout"><section id="catalog" aria-labelledby="catalog-title">
<div class="anthology-list-heading"><h2 id="catalog-title">文选目录</h2><p id="anthology-count" role="status" aria-live="polite">共 {len(works)} 篇</p></div>
<form class="anthology-filters" id="anthology-filters" role="search" hidden>
<label class="anthology-query">搜索文选<input id="anthology-query" name="q" type="search" placeholder="篇名、作者或正文中的一句话" autocomplete="off"></label>
<label>分类<select id="anthology-category" name="category"><option value="">全部分类</option>{category_options}</select></label>
<label>语言<select id="anthology-language" name="language"><option value="">全部语言</option>{language_options}</select></label>
<button type="reset">重置筛选</button></form>
<noscript><p class="anthology-note">以下为完整目录；搜索与筛选需要 JavaScript。每篇原文均可直接阅读。</p></noscript>
<div class="anthology-empty anthology-card" id="anthology-empty" hidden><h3>没有找到匹配的文选</h3><p>试试更短的关键词，或重置筛选查看全部。</p><button type="button" data-reset>重置筛选</button></div>
<ol class="anthology-list">{''.join(cards)}</ol></section>
<aside class="anthology-aside" aria-label="文选辅助信息"><section><h2>按分类读</h2><ul class="anthology-categories">{category_links}</ul></section>
<section><h2>关于这份文选</h2><p>这是个人选录的中外文学原文，与本站的原创文章分开编目。</p><p>作者与时代沿用源文标注；未标注处保留空缺。源文未附译注；另有 {glossary_total} 条注明来源的语境简释。</p><a href="/articles/">阅读我的原创文章 →</a></section></aside></div>'''
    write('/anthology/', '雨聊文选', '谢雨卿选录的中外文学原文，按分类与语言浏览，搜索篇名、作者或正文。', index)
    for position, w in enumerate(works):
        local_entries = glossary.get(w['slug'], [])
        rendered, sections = render_work(w, local_entries)
        section_links = ''.join(f'<li><a href="#{identifier}">{escape(label)}</a></li>' for identifier, label in sections)
        related = [item for item in works if item['category'] == w['category'] and item != w]
        related_links = ''.join(f'<li><a href="{route(item)}" lang="{item["language"]}">{escape(item["title"])}</a></li>' for item in related)
        adjacent = ''.join(f'<a href="{route(works[i])}"><small>{label}</small><span lang="{works[i]["language"]}">{escape(works[i]["title"])}</span></a>' for i, label in ((position-1, '上一篇'), (position+1, '下一篇')) if 0 <= i < len(works))
        reading_note = f'<p class="anthology-note">本篇 {len(local_entries)} 处词句有淡色虚线注释标记。</p>' if local_entries else ''
        glossary_json = json.dumps(glossary.get(w['slug'], []), ensure_ascii=False).replace('<', '\\u003c')
        content = f'''<nav class="anthology-breadcrumb" aria-label="面包屑"><a data-back href="/anthology/#entry-{w['slug']}">← 返回文选目录</a><span>{escape(w['category'])}</span></nav>
<div class="anthology-layout anthology-reading-layout"><article class="anthology-paper" aria-labelledby="work-title">
<header class="anthology-work-header"><p class="eyebrow">雨聊文选 · {escape(w['category'])}</p><h1 id="work-title" lang="{w['language']}">{escape(w['title'])}</h1>
<p class="anthology-credit">{escape(w['credit']) if w['credit'] else '源文未标注作者与时代'} <span aria-hidden="true">·</span> <span lang="{w['language']}">{LANGUAGES[w['language']]}</span></p>{'<p class="anthology-note-guide">淡色虚线词句有注释，可点击或用键盘聚焦查看。</p>' if local_entries else ''}</header>

<section id="original" class="anthology-text" lang="{w['language']}" aria-label="原文">{rendered}</section>
<footer class="anthology-source"><p>选录自《{escape(Path(w['source']).stem)}》。正文与署名按源文保留。</p><a data-back href="/anthology/#entry-{w['slug']}">返回文选目录</a> <a href="#work-title">回到篇首 ↑</a></footer>
</article><aside class="anthology-aside" aria-label="阅读辅助"><section><h2>本篇阅读</h2><ul>{section_links}</ul>{reading_note}</section>{'<section><h2>同类选文</h2><ul>' + related_links + '</ul></section>' if related else ''}<section><h2>继续阅读</h2><nav class="anthology-adjacent" aria-label="前后篇">{adjacent}</nav><a data-back href="/anthology/#entry-{w['slug']}">全部文选 →</a></section></aside></div>'''
        content += f'''<script type="application/json" id="anthology-glossary">{glossary_json}</script>
<div class="anthology-selection" id="anthology-selection" role="toolbar" aria-label="选中文字操作" hidden><button type="button" id="anthology-copy">复制</button><button type="button" id="anthology-search" aria-label="搜索选中文字：打开 Google 外部搜索新页" title="在 Google 新页搜索，只发送选中文字">搜索 <small aria-hidden="true">Google ↗</small></button><span class="anthology-selection-status" id="anthology-copy-status" role="status" aria-live="polite"></span></div>
<section class="anthology-note-popup" id="anthology-note" role="dialog" aria-modal="false" aria-labelledby="anthology-note-title" tabindex="-1" hidden><header><h2 id="anthology-note-title"></h2><button type="button" id="anthology-note-close" aria-label="关闭注释">关闭</button></header><p class="anthology-note">据参考资料整理的语境简释，非辞典逐字引文。</p><p id="anthology-note-explanation"></p><p class="anthology-note" id="anthology-note-source"></p><a id="anthology-note-source-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">查看辞典原条目 ↗</a></section>'''
        write(route(w), w['title'] + ' · 雨聊文选', plain(w['body'])[:150], content)
    (output / 'assets').mkdir(exist_ok=True)
    for name in ('anthology.css', 'anthology.js', 'anthology-selection.css', 'anthology-selection.js'):
        shutil.copyfile(root / 'home/assets' / name, output / 'assets' / name)
    return {'glossary_entries': glossary_total, 'glossary_works': len(glossary), 'works': len(works), 'collections': len(categories), 'routes': ['/anthology/', *map(route, works)]}
