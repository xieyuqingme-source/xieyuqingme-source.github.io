"""Static English pages and source-hash-checked, full article translations.

No translation service is called. Chinese sources and original English writing
remain the sole originals for article totals, RSS and Waline identities.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import replace
from hashlib import sha256
from html import escape
from pathlib import Path, PurePosixPath
import json
import re
from urllib.parse import quote, urlsplit, urlunsplit

TOPICS = {"学习与思考": "Learning & reflection", "科技与写作": "Technology & writing",
          "经济与社会": "Economy & society", "历史与文化": "History & culture",
          "城市生活": "City life", "生活与思考": "Life & reflection"}


def source_sha256(source: Path) -> str:
    """Hash source content consistently across Git LF and Windows CRLF checkouts.

    Only CRLF line endings are normalized. All other bytes, including whitespace,
    a final newline and any BOM, still participate in freshness checks. Never
    rewrite the original source file to calculate its digest.
    """
    return sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def site_origin(blog):
    return urlunsplit((*urlsplit(blog.site_url)[:2], "", "", ""))


def english_article_url(blog, article):
    return "/en/articles/" + quote(article.source.with_suffix(".html").name, safe="")


def alternate_links(origin, chinese, english):
    return (f'<link rel="alternate" hreflang="zh-CN" href="{escape(origin + chinese)}">'
            f'<link rel="alternate" hreflang="en" href="{escape(origin + english)}">')


def markdown_signature(parser, text):
    """Language-independent content that must survive a complete translation."""
    links, code = [], []
    tokens = parser.parse(text)
    def visit(token):
        if token.type == "code_inline":
            code.append((token.type, "", token.content))
        for attr in ("href", "src"):
            if token.attrGet(attr) is not None:
                links.append((attr, token.attrGet(attr)))
        for child in token.children or []:
            visit(child)
    for token in tokens:
        visit(token)
        if token.type in {"fence", "code_block"}:
            code.append((token.type, token.info, token.content))
    structure = Counter(token.type for token in tokens if token.type in {
        "heading_open", "table_open", "tr_open", "list_item_open", "blockquote_open"})
    hierarchy = tuple((token.type, token.tag) for token in tokens if token.type in {
        "heading_open", "heading_close", "table_open", "table_close", "tr_open", "tr_close",
        "bullet_list_open", "bullet_list_close", "ordered_list_open", "ordered_list_close",
        "list_item_open", "list_item_close", "blockquote_open", "blockquote_close"})
    return Counter(links), code, structure, hierarchy


def collect_translations(blog):
    """Validate the manifest, then expose only current complete English files.

    Missing, pending and stale entries are directory states, never English pages.
    Malformed manifests and unsafe paths fail before publication.
    """
    root = blog.source_root
    manifest_path = root / "blog/translations/manifest.json"
    originals = {a.source.relative_to(root).as_posix(): a for a in blog.articles if a.language == "zh-CN"}
    states = {key: "pending" for key in originals}
    complete = {}
    if not manifest_path.exists():
        return complete, states
    for folder in (manifest_path.parent, manifest_path.parent.parent):
        if folder.is_symlink():
            raise ValueError("Translation directories cannot be symlinks.")
    if manifest_path.is_symlink():
        raise ValueError("The translation manifest cannot be a symlink.")
    data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict) or set(data) != {"version", "translations"} or data["version"] != 1 or not isinstance(data["translations"], dict):
        raise ValueError("Translation manifest needs version 1 and a translations object.")
    for key, entry in data["translations"].items():
        if key not in originals:
            raise ValueError(f"Translation has no Chinese original: {key}")
        if not isinstance(entry, dict) or set(entry) - {"file", "source_sha256", "title", "status", "method", "notes"}:
            raise ValueError(f"Invalid translation metadata: {key}")
        status = entry.get("status", "pending")
        if status not in {"complete", "pending"}:
            raise ValueError(f"Translation status must be complete or pending: {key}")
        if status == "pending":
            continue
        if not all(isinstance(entry.get(field), str) and entry[field].strip() for field in ("file", "source_sha256", "title", "method")):
            raise ValueError(f"Complete translation metadata is incomplete: {key}")
        source = originals[key]
        expected_file = "blog/translations/en/" + source.source.name
        if entry["file"] != expected_file or PurePosixPath(entry["file"]).is_absolute() or "\\" in entry["file"]:
            raise ValueError(f"Translation file must match its original basename: {key}")
        digest = entry["source_sha256"]
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError(f"Invalid translation source hash: {key}")
        if digest != source_sha256(source.source):
            states[key] = "stale"
            continue
        path = root / entry["file"]
        if path.parent.is_symlink() or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Unsafe translation file: {key}")
        if not path.is_file():
            raise ValueError(f"Complete translation file is missing: {key}")
        text = path.read_text(encoding="utf-8-sig")
        tokens = blog.parser.parse(text)
        if not tokens or tokens[0].type != "heading_open" or tokens[0].tag != "h1":
            raise ValueError(f"English translation must begin with # title: {key}")
        from build_blog import plain_inline
        title = plain_inline(tokens[1])
        if title != entry["title"] or not re.search(r"[A-Za-z]", title):
            raise ValueError(f"English translation title does not match its manifest: {key}")
        body = "\n".join(text.splitlines()[tokens[0].map[1]:]).lstrip("\n")
        # Fenced examples, links, images, tables, lists and section counts are
        # checked without interpreting translated prose as a generated summary.
        original_text = source.source.read_text(encoding="utf-8-sig")
        if markdown_signature(blog.parser, original_text) != markdown_signature(blog.parser, text):
            raise ValueError(f"Translation must preserve links, images, code and block structure: {key}")
        prose = " ".join(token.content for token in blog.parser.parse(body) if token.type == "inline")
        if not body.strip() or text.strip() == original_text.strip() or len(re.findall(r"[A-Za-z]", prose)) < len(re.findall(r"[\u3400-\u9fff]", prose)):
            raise ValueError(f"Translation must contain the full English body: {key}")
        complete[key] = replace(source, destination=source.source.with_suffix(".html").name,
                                title=title, language="en", category="English translation",
                                listing="index.html", markdown=body, original=source)
        states[key] = "complete"
    destinations = [a.destination for a in complete.values()]
    if len(destinations) != len(set(destinations)):
        raise ValueError("English translations require unique original basenames.")
    return complete, states


def translation_report(blog, require_complete=False):
    states = blog.translation_states
    counts = {name: sum(value == name for value in states.values()) for name in ("complete", "pending", "stale")}
    report = {"chinese_originals": len(states), **counts,
              "english_originals": sum(a.language == "en" for a in blog.articles),
              "needs_translation": [key for key, value in states.items() if value != "complete"]}
    if require_complete and counts["complete"] != len(states):
        raise ValueError(f"English translation coverage is incomplete: {counts}")
    return report


def translated_render(blog, article):
    """Retain original heading IDs with English labels and original media paths."""
    rendered = blog.render(article.markdown, article.source)
    if not article.original:
        return rendered
    original = blog.render(article.original.markdown, article.source)
    old_ids = re.findall(r'<h[1-6] id="([^"]+)"', original)
    new_ids = re.findall(r'<h[1-6] id="([^"]+)"', rendered)
    if len(old_ids) != len(new_ids):
        raise ValueError("Translated headings must retain their original hierarchy.")
    ids = iter(old_ids)
    return re.sub(r'<(h[1-6]) id="([^"]+)"', lambda match: f'<{match.group(1)} id="{next(ids)}"', rendered)


def english_archive(blog):
    """English directory with one record per original and honest unavailable states."""
    cards, topics = [], Counter()
    for index, original in enumerate(blog.articles, 1):
        key = original.source.relative_to(blog.source_root).as_posix()
        article = blog.translations.get(key, original)
        ready = original.language == "en" or article.original is not None
        state = blog.translation_states.get(key, "original")
        topic = TOPICS[blog.topic(original)]
        topics[topic] += 1
        url = english_article_url(blog, original) if article.original else blog.href(original.destination)
        excerpt = blog.excerpt(article) if ready else ("The English translation needs an update." if state == "stale" else "The English translation is pending.")
        label = "English translation" if article.original else ("English original" if ready else ("Translation out of date" if state == "stale" else "Translation pending"))
        action = "Read article" if ready else "Read Chinese original"
        searchable = escape(f"{article.title} {original.title} {excerpt} {topic} {original.published}", quote=True)
        kind = "original" if original.language == "en" else "translation"
        cards.append(f'''<li class="article-card"><span class="article-number" aria-hidden="true">{index:02d}</span>
<div class="article-card-content" data-topic="{escape(topic)}" data-year="{original.published[:4]}" data-language="{kind}" data-search="{searchable}">
<p class="article-meta"><span class="topic-tag">{escape(topic)}</span>{blog.publication(article, 'en')}<span class="translation-status" data-translation-status="{state}">{label}</span>{blog.metrics(article, 'en')}</p>
<h2 class="article-title"><a href="{escape(url)}" lang="{'en' if ready else 'zh-CN'}">{escape(article.title)}</a></h2>
<p class="article-excerpt">{escape(excerpt)}</p><p class="article-read"><span>{str(blog.reading_minutes(article)) + ' min read' if ready else 'Chinese original available'}</span><a href="{escape(url)}">{action} →</a></p></div></li>''')
    filters = '<button type="button" class="filter-button active" data-filter="all" aria-pressed="true">All<span>' + str(len(cards)) + '</span></button>'
    filters += ''.join(f'<button type="button" class="filter-button" data-filter="{escape(topic)}" aria-pressed="false">{escape(topic)}<span>{count}</span></button>' for topic, count in sorted(topics.items()))
    years = sorted({a.published[:4] for a in blog.articles if a.published}, reverse=True)
    options = ''.join(f'<option value="{year}">{year}</option>' for year in years)
    if any(not a.published for a in blog.articles):
        options += '<option value="unknown">Date unconfirmed</option>'
    report = translation_report(blog)
    return f'''<section class="page-intro"><p class="eyebrow">ESSAYS &amp; NOTES</p><h1>Articles</h1><p>{escape(blog.config['article_english_description'])}</p>
<p>{report['complete']} English translations · {report['english_originals']} English original. Translations are AI-assisted; each links to its exact Chinese original.</p>
<p class="translation-coverage">{report['pending']} pending · {report['stale']} awaiting an update. Unavailable translations link to the Chinese original.</p></section>
<section class="archive" id="archive" aria-labelledby="archive-heading"><div class="section-heading"><h2 id="archive-heading">All articles</h2><span class="archive-total">{len(cards)} <small>original articles</small></span></div>
<div class="archive-controls" hidden><div class="language-filters" role="group" aria-label="Filter article language"><button type="button" data-language-filter="all" aria-pressed="true">All</button><button type="button" data-language-filter="translation" aria-pressed="false">Translations from Chinese</button><button type="button" data-language-filter="original" aria-pressed="false">English originals</button></div>
<div class="topic-filters" role="group" aria-label="Filter topic">{filters}</div><div class="archive-query"><label class="year-filter"><span class="sr-only">Publication year</span><select id="article-year" aria-label="Publication year"><option value="all">All years</option>{options}</select></label><label class="search-box"><span class="search-icon" aria-hidden="true"></span><span class="sr-only">Search titles or excerpts</span><input type="search" id="article-search" placeholder="Search titles or excerpts…" autocomplete="off" aria-controls="archive-results"><span class="search-key" aria-hidden="true">/</span></label></div></div>
{blog.statistics_notice('en')}<p class="search-status" id="archive-results" role="status" aria-live="polite" hidden></p><ul class="article-list">{''.join(cards)}</ul>
<nav class="archive-pagination" aria-label="Article pages" hidden><button type="button" data-page="prev">← Previous</button><span class="pagination-position"></span><button type="button" data-page="next">Next →</button><form class="page-jump" novalidate><label for="article-page">Page</label><input id="article-page" name="page" type="text" inputmode="numeric" autocomplete="off" aria-label="Go to page" aria-describedby="page-jump-message"><span></span><button type="submit">Go</button></form><p id="page-jump-message" class="page-jump-message" role="status" aria-live="polite" hidden></p></nav><div class="search-empty" hidden><p>No matching articles.</p><button type="button" class="reset-search">Clear search and filters</button></div></section>'''


def build_english_site(blog, output, address, projects, about_data, values):
    """Generate only English routes; never add translations to blog.articles."""
    from build_blog import Blog
    from build_site import render_projects
    from site_i18n import localize_page
    class EnglishView(Blog):
        def href(self, destination):
            if destination == "index.html":
                return "/en/articles/"
            if destination in {a.destination for a in self.translations.values()}:
                return "/en/articles/" + quote(destination, safe="/")
            return blog.href(destination)

        def canonical(self, destination):
            return address + self.href(destination)

        def original_href(self, article):
            return blog.href((article.original or article).destination)

    view = object.__new__(EnglishView)
    view.__dict__ = blog.__dict__.copy()
    en_root = output / "en"
    if en_root.is_symlink() or not en_root.resolve().is_relative_to(output.resolve()):
        raise ValueError("Unsafe generated English output path.")
    marker = en_root / ".generated-by-english"
    if en_root.exists() and any(en_root.iterdir()) and not marker.is_file():
        raise ValueError("Keep unrecognized English output intact.")
    en_root.mkdir(parents=True, exist_ok=True)
    manifest = en_root / ".generated-routes.json"
    previous = json.loads(manifest.read_text(encoding="utf-8")) if manifest.is_file() else []
    pages = {"en/articles/index.html": view.document("Articles", english_archive(blog), "index.html", language="en",
                  alternates=alternate_links(address, "/articles/", "/en/articles/"), switch_href="/articles/")}
    for article in blog.translations.values():
        pages["en/articles/" + article.destination] = view.article_document(article, list(blog.translations.values()))
    english_projects = json.loads((blog.source_root / "home/en/projects.json").read_text(encoding="utf-8"))["projects"]
    originals = {p["id"]: p for p in projects}
    if {p.get("id") for p in english_projects} != set(originals):
        raise ValueError("English project descriptions must cover exactly the current projects.")
    merged = []
    fields = {"id", "title", "english_title", "kind", "summary", "problem", "features", "contribution", "usage", "license", "screenshot_alt", "screenshot_caption", "guide_label", "download_label"}
    for item in english_projects:
        if not isinstance(item, dict) or set(item) - fields:
            raise ValueError("English project data must contain only translated public descriptions.")
        merged.append({**originals[item["id"]], **item})
    english_values = {**values, "project_cards": render_projects(merged, language="en"),
                      "english_available": str(len(blog.translations) + sum(a.language == "en" for a in blog.articles))}
    recent = []
    for original in blog.articles:
        article = blog.translations.get(original.source.relative_to(blog.source_root).as_posix(), original)
        if article.language != "en":
            continue
        url = english_article_url(blog, original) if article.original else blog.href(article.destination)
        recent.append(f'<li><div class="article-meta">{blog.publication(article, "en")}<span>{escape(TOPICS[blog.topic(original)])}</span></div><h3><a href="{escape(url)}">{escape(article.title)}</a></h3></li>')
        if len(recent) == 3:
            break
    english_values["recent_articles"] = ''.join(recent) or '<li>English translations are being prepared.</li>'
    english_values["about_name"] = escape(about_data["english_name"])
    english_values["about_email"] = escape(about_data["email"], quote=True)
    english_values["about_wechat"] = escape(about_data["wechat"])
    for name, route in (("index", "en/index.html"), ("about", "en/about/index.html"), ("projects", "en/projects/index.html")):
        page = (blog.source_root / f"home/en/{name}.template.html").read_text(encoding="utf-8")
        for key, value in english_values.items():
            page = page.replace("{{" + key + "}}", value)
        if "{{" in page:
            raise ValueError(f"Unresolved English template: {name}")
        chinese_route = "/" + route.removeprefix("en/").removesuffix("index.html")
        pages[route] = localize_page(page, blog.source_root, address, chinese_route, "en")
    routes = sorted(pages)
    # Remove only old routes registered by this generator. A stale translation
    # cannot survive an incremental unified build or enter the root sitemap.
    for route in previous:
        target = output / route
        if not isinstance(route, str) or not route.startswith("en/") or not target.resolve().is_relative_to(en_root.resolve()) or target.is_symlink():
            raise ValueError("Unsafe previously generated English route.")
        if route not in pages and target.is_file():
            target.unlink()
    for route, page in pages.items():
        target = output / route
        if target.is_symlink() or not target.resolve().is_relative_to(en_root.resolve()):
            raise ValueError("Unsafe generated English page.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8")
    marker.write_text("Generated English pages only.\n", encoding="utf-8")
    manifest.write_text(json.dumps(routes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {**translation_report(blog), "routes": ["/en/", "/en/about/", "/en/projects/", "/en/articles/",
             *[english_article_url(blog, article) for article in blog.translations.values()]]}


def check_english_publication(blog, output, address, require_complete=False):
    """Check reciprocal language metadata and original discussion identities."""
    from build_site import Elements
    from urllib.parse import unquote
    report = translation_report(blog, require_complete)
    pages = {p.resolve(): Elements(p.read_text(encoding="utf-8")).elements for p in output.rglob("*.html")}
    def target(url):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != urlsplit(address).netloc or parts.query or parts.fragment:
            raise ValueError(f"Language alternates require the publication origin: {url}")
        path = (output / unquote(parts.path).lstrip("/")).resolve()
        if path.is_dir():
            path /= "index.html"
        if not path.is_relative_to(output.resolve()) or path not in pages:
            raise ValueError(f"Language alternate target is missing: {url}")
        return path
    pairs = 0
    for page, elements in pages.items():
        links = [(a.get("hreflang"), a.get("href")) for tag, a in elements if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang")]
        if not links:
            continue
        if len(links) != 2 or {lang for lang, _ in links} != {"zh-CN", "en"}:
            raise ValueError(f"Each language pair needs exactly Chinese and English alternates: {page}")
        paths = {lang: target(url) for lang, url in links}
        if page not in paths.values():
            raise ValueError(f"Language alternates must include their own page: {page}")
        for lang, path in paths.items():
            other = pages[path]
            if not any(tag == "html" and attrs.get("lang") == lang for tag, attrs in other):
                raise ValueError(f"Language alternate does not match the target language: {path}")
            reciprocal = {(a.get("hreflang"), a.get("href")) for tag, a in other if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang")}
            if reciprocal != set(links):
                raise ValueError(f"Language alternate links are not reciprocal: {page}")
        pairs += 1
    for article in blog.translations.values():
        route = english_article_url(blog, article)
        elements = pages[target(address + route)]
        original = blog.href(article.original.destination)
        discussions = [a.get("data-article-path") for _, a in elements if "data-article-path" in a]
        counters = [a.get("data-stats-path") for _, a in elements if "data-stats-path" in a]
        if blog.waline["enabled"] and (discussions != [original] or counters != [original]):
            raise ValueError(f"English comments and counters must reuse the exact original path: {route}")
        if not any(tag == "a" and a.get("class") == "article-original" and a.get("href") == original for tag, a in elements):
            raise ValueError(f"English translation needs its exact Chinese original link: {route}")
    expected = {a.destination for a in blog.translations.values()} | {"index.html"}
    actual = {p.name for p in (output / "en/articles").glob("*.html")}
    if actual != expected:
        raise ValueError("English article output contains missing, stale or unregistered translations.")
    directory = pages[(output / "en/articles/index.html").resolve()]
    cards = sum("article-card-content" in a.get("class", "").split() for _, a in directory)
    if cards != len(blog.articles):
        raise ValueError("English directory must contain exactly one record per original article.")
    for article in blog.articles:
        if article.language == "en":
            original = pages[(output / "articles" / article.destination).resolve()]
            if not any(tag == "html" and a.get("lang") == "en" for tag, a in original):
                raise ValueError("Original English writing must retain its original URL with English UI.")
    report["language_metadata_pages"] = pairs
    report["directory_entries"] = cards
    return report
