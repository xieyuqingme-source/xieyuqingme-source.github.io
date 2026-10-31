"""Render the reviewed anthology independently of original articles and translations."""
from collections import Counter
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import urlencode, urlsplit
import ipaddress
import json
import re
import shutil
import unicodedata

from markdown_it import MarkdownIt
from site_safety import PRIVATE_PATH
from reading_annotations import mark_reviewed_terms

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
                   or (key != 'source_url' and PRIVATE_PATH.search(value)) for key, value in entry.items()):
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
    def marker(text,index,entry):
        label_attr = (f' data-i18n-aria-label="{escape(entry["_key"], quote=True)}.label"' if entry.get("_key") else "")
        return f'<span class="anthology-annotation" role="button" tabindex="0" aria-haspopup="dialog" aria-controls="anthology-note" aria-label="查看{escape(text, quote=True)}注释" data-note-index="{index}"{label_attr}>{escape(text)}</span>'
    mark_reviewed_terms(tokens,notes,marker)
    body = parser.renderer.render(tokens, parser.options, {})
    return body, sections


def build_anthology(root, output, address, language="zh-CN"):
    from site_i18n import localized_path, localize_page
    if language not in {"zh-CN", "en"}:
        raise ValueError("Unsupported anthology interface language.")
    root, output = Path(root), Path(output)
    works = load_anthology(root)
    glossary = load_glossary(root, works)
    catalogue = json.loads((root / "home/locales/anthology.json").read_text(encoding="utf-8"))
    def tr(key): return catalogue[language]["anthology." + key]
    def node(key, tag="span", attrs=""):
        return f'<{tag} data-i18n="anthology.{key}"{attrs}>{escape(tr(key))}</{tag}>'
    def link(path): return escape(localized_path(path, language), quote=True)
    def title_key(work): return "work." + work["slug"] + ".title"
    def credit_key(work): return "work." + work["slug"] + ".credit"
    categories = Counter(w["category"] for w in works)
    category_keys = {c: "category." + str(i) for i, c in enumerate(categories)}
    glossary_total = sum(map(len, glossary.values()))
    template = (root / "home/anthology.template.html").read_text(encoding="utf-8")
    def write(path, title_key_value, description_key, content):
        titles = {code: catalogue[code]["anthology." + title_key_value] for code in catalogue}
        descriptions = {code: catalogue[code]["anthology." + description_key] for code in catalogue}
        page = template
        for key, value in {"site_url": escape(address, quote=True), "route": path,
                           "title": escape(titles[language]), "description": escape(descriptions[language], quote=True), "content": content}.items():
            page = page.replace("{{" + key + "}}", value)
        if "{{" in page: raise ValueError("Unresolved anthology template placeholder.")
        page = localize_page(page, root, address, path, language=language,
                             modules=("anthology",), title=titles, description=descriptions)
        target = output / localized_path(path, language).lstrip("/") / "index.html"
        if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in (output, output / 'en', output / 'anthology', output / 'en/anthology', target.parent, target)):
            raise ValueError("Linked anthology output is not supported.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8", newline="\n")
    cards = []
    for w in works:
        excerpt = plain(w["body"])
        slug, ck = w["slug"], category_keys[w["category"]]
        search = ' '.join([w['title'], w['credit'], w['category'], excerpt] +
                          [catalogue[code]["anthology." + k] for code in catalogue for k in
                           (title_key(w), credit_key(w), ck, 'work.' + slug + '.guide')])
        cards.append(f'''<li class="anthology-card" id="entry-{slug}" data-work data-order="{len(cards)}" data-category="{escape(w['category'], quote=True)}" data-language="{w['language']}" data-search="{escape(search, quote=True)}">
<p class="anthology-meta">{node(ck)} <span aria-hidden="true">·</span> {node('language.' + w['language'])}</p>
<h2><a data-detail href="{link(route(w))}">{node(title_key(w))}</a></h2>
{node(credit_key(w), 'p', ' class="anthology-credit"')}
<p class="anthology-excerpt" data-source-excerpt lang="{w['language']}"{' hidden' if language == 'en' else ''}>{escape(excerpt[:125])}{'…' if len(excerpt)>125 else ''}</p>
<p class="anthology-excerpt" data-reading-guide{' hidden' if language != 'en' else ''}>{node('guideLabel', 'small')} {node('work.' + slug + '.guide')}</p>
<a class="anthology-read" data-detail href="{link(route(w))}" data-i18n-aria-label="anthology.work.{slug}.readLabel" aria-label="{escape(tr('work.'+slug+'.readLabel'), quote=True)}">{node('read')} <span aria-hidden="true">→</span></a></li>''')
    category_options = ''.join(f'<option value="{escape(c, quote=True)}" data-i18n="anthology.{category_keys[c]}.count">{escape(tr(category_keys[c]+".count"))}</option>' for c in categories)
    language_options = ''.join(f'<option value="{code}" data-i18n="anthology.language.{code}">{escape(tr("language."+code))}</option>' for code in LANGUAGES if any(w['language']==code for w in works))
    category_links = ''.join(f'<li><a href="{link("/anthology/?"+urlencode({"category":c})+"#catalog")}">{node(category_keys[c])}<span>{n}</span></a></li>' for c,n in categories.items())
    index = f'''<section class="anthology-intro"><p class="eyebrow"><span aria-hidden="true"></span> {node('eyebrow')}</p>
{node('name','h1')}{node('tagline','p')}{node('inventory','p',' class="anthology-intro-note"')}</section>
<div class="anthology-layout"><section id="catalog" aria-labelledby="catalog-title">
<div class="anthology-list-heading">{node('catalog','h2',' id="catalog-title"')}<p id="anthology-count" role="status" aria-live="polite">{escape(tr('countInitial').replace('{total}',str(len(works))))}</p></div>
<form class="anthology-filters" id="anthology-filters" role="search" hidden>
<label class="anthology-query">{node('searchLabel')}<input id="anthology-query" name="q" type="search" data-i18n-placeholder="anthology.searchPlaceholder" placeholder="{escape(tr('searchPlaceholder'),quote=True)}" autocomplete="off"></label>
<label>{node('categoryLabel')}<select id="anthology-category" name="category">{node('allCategories','option',' value=""')}{category_options}</select></label>
<label>{node('languageLabel')}<select id="anthology-language" name="language">{node('allLanguages','option',' value=""')}{language_options}</select></label>
<label>{node('sortLabel')}<select id="anthology-sort" name="sort">{node('sortSource','option',' value="source"')}{node('sortTitle','option',' value="title"')}</select></label>
<button type="reset">{node('reset')}</button></form>
<noscript>{node('noScript','p',' class="anthology-note"')}</noscript>
<div class="anthology-empty anthology-card" id="anthology-empty" hidden>{node('emptyTitle','h3')}{node('emptyHelp','p')}<button type="button" data-reset>{node('reset')}</button></div>
<ol class="anthology-list">{''.join(cards)}</ol></section>
<aside class="anthology-aside" data-i18n-aria-label="anthology.catalogAside" aria-label="{escape(tr('catalogAside'),quote=True)}"><section>{node('byCategory','h2')}<ul class="anthology-categories">{category_links}</ul></section>
<section>{node('about','h2')}{node('aboutText','p')}{node('creditsHelp','p')}{node('notesHelp','p')}<a href="{link('/articles/')}">{node('originalArticles')} →</a></section></aside></div>'''
    write('/anthology/','name','description',index)
    for position,w in enumerate(works):
        slug,ck=w['slug'],category_keys[w['category']]
        local_entries=[dict(e, _key=f"anthology.note.{slug}.{i}") for i,e in enumerate(glossary.get(slug,[]))]
        rendered, sections=render_work(w,local_entries)
        section_links=''.join(f'<li><a href="#{identifier}">{node("original") if identifier=="original" else escape(label)}</a></li>' for identifier,label in sections)
        related=[item for item in works if item['category']==w['category'] and item!=w]
        related_links=''.join(f'<li><a href="{link(route(item))}">{node(title_key(item))}</a></li>' for item in related)
        adjacent=''.join(f'<a href="{link(route(works[i]))}">{node(label,"small")}{node(title_key(works[i]))}</a>' for i,label in ((position-1,'previous'),(position+1,'next')) if 0<=i<len(works))
        guide=node('noteGuide','p',' class="anthology-note-guide"') if local_entries else ''
        glossary_json=json.dumps(local_entries,ensure_ascii=False).replace('<','\\u003c')
        content=f'''<nav class="anthology-breadcrumb" data-i18n-aria-label="anthology.breadcrumb" aria-label="{escape(tr('breadcrumb'),quote=True)}"><a data-back href="{link('/anthology/#entry-'+slug)}">← {node('back')}</a>{node(ck)}</nav>
<div class="anthology-layout anthology-reading-layout"><article class="anthology-paper" aria-labelledby="work-title">
<header class="anthology-work-header"><p class="eyebrow">{node('name')} · {node(ck)}</p>{node(title_key(w),'h1',' id="work-title"')}
<p data-original-title lang="{w['language']}"{' hidden' if language!='en' or w['title']==catalogue['en']['anthology.'+title_key(w)] else ''}>{escape(w['title'])}</p>
<p class="anthology-credit">{node(credit_key(w))} <span aria-hidden="true">·</span> {node('language.'+w['language'])}</p>{guide}</header>
<section id="original" class="anthology-text" lang="{w['language']}" data-i18n-aria-label="anthology.original" aria-label="{escape(tr('original'),quote=True)}">{rendered}</section>
<footer class="anthology-source">{node('source.'+str(list(categories).index(w['category'])),'p')}<a data-back href="{link('/anthology/#entry-'+slug)}">{node('back')}</a> <a href="#work-title">{node('top')} ↑</a></footer>
</article><aside class="anthology-aside" data-i18n-aria-label="anthology.readingAside" aria-label="{escape(tr('readingAside'),quote=True)}"><section>{node('thisWork','h2')}<ul>{section_links}</ul></section>{'<section>'+node('related','h2')+'<ul>'+related_links+'</ul></section>' if related else ''}<section>{node('continue','h2')}<nav class="anthology-adjacent" data-i18n-aria-label="anthology.adjacent" aria-label="{escape(tr('adjacent'),quote=True)}">{adjacent}</nav><a data-back href="{link('/anthology/#entry-'+slug)}">{node('allWorks')} →</a></section></aside></div>'''
        content+=f'''<script type="application/json" id="anthology-glossary">{glossary_json}</script>
<div class="anthology-selection" id="anthology-selection" role="toolbar" data-i18n-aria-label="anthology.selection" aria-label="{escape(tr('selection'),quote=True)}" hidden><button type="button" id="anthology-copy">{node('copy')}</button><button type="button" id="anthology-search" data-i18n-aria-label="anthology.selectionSearchAria" data-i18n-title="anthology.selectionSearchTitle" aria-label="{escape(tr('selectionSearchAria'),quote=True)}" title="{escape(tr('selectionSearchTitle'),quote=True)}">{node('search')} <small aria-hidden="true">Google ↗</small></button><span class="anthology-selection-status" id="anthology-copy-status" role="status" aria-live="polite"></span></div>
<section class="anthology-note-popup" id="anthology-note" role="dialog" aria-modal="false" aria-labelledby="anthology-note-title" tabindex="-1" hidden><header><h2 id="anthology-note-title"></h2><button type="button" id="anthology-note-close" data-i18n-aria-label="anthology.closeNote" aria-label="{escape(tr('closeNote'),quote=True)}">{node('close')}</button></header>{node('noteProvenance','p',' class="anthology-note"')}<p id="anthology-note-explanation"></p><p class="anthology-note" id="anthology-note-source"></p><a id="anthology-note-source-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">{node('dictionarySource')} ↗</a></section>'''
        write(route(w),'work.'+slug+'.pageTitle','work.'+slug+'.guide',content)
    (output/'assets').mkdir(exist_ok=True)
    for name in ('anthology.css','anthology.js','anthology-selection.css','anthology-selection.js','reading-annotations.css','reading-annotations.js'):
        shutil.copyfile(root/'home/assets'/name,output/'assets'/name)
    return {'glossary_entries':glossary_total,'glossary_works':len(glossary),'works':len(works),'collections':len(categories),'routes':[localized_path(p,language) for p in ['/anthology/',*map(route,works)]]}
