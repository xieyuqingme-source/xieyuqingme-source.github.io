"""Shared static localization and explicit bilingual feature routes (no network)."""
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

LANGUAGES = ("zh-CN", "en")
FEATURES = ("/today", "/about", "/projects", "/photos", "/map", "/game", "/anthology")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
NAV_KEYS = {"/": "home", "/today/": "today", "/articles/": "articles", "/anthology/": "anthology", "/projects/": "projects",
            "/photos/": "photos", "/map/": "map", "/game/": "games", "/about/": "about"}


def localized_path(path, language="zh-CN"):
    """Map public feature URLs only, preserving query/hash and original articles."""
    if language not in LANGUAGES:
        raise ValueError("Site language must be zh-CN or en.")
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/"):
        return path
    chinese = parsed.path[3:] if parsed.path.startswith("/en/") else ("/" if parsed.path == "/en" else parsed.path)
    is_feature = chinese == "/" or chinese in {"/articles", "/articles/", "/articles/index.html"}
    is_feature = is_feature or any(chinese == prefix or chinese.startswith(prefix + "/") for prefix in FEATURES)
    # Media, scripts and stylesheet URLs are shared by both languages.
    if re.search(r"/(?:assets|images|data)(?:/|$)", chinese) or re.search(r"\.(?:png|jpe?g|webp|gif|svg|json|css|js|xml|mp4|webm)$", chinese, re.I):
        is_feature = False
    if not is_feature:
        return path
    if chinese == "/articles/index.html":
        chinese = "/articles/"
    selected = ("/en" + chinese) if language == "en" else chinese
    return urlunsplit(("", "", selected, parsed.query, parsed.fragment))


def load_catalogues(root, modules=()):
    result = {language: {} for language in LANGUAGES}
    for module in ("common", *modules):
        if not re.fullmatch(r"[a-z][a-z0-9_-]*", module):
            raise ValueError("Invalid localization module name.")
        source = Path(root) / "home/locales" / (module + ".json")
        if not source.is_file() and module == "common":
            # Minimal isolated legacy fixtures have no shared assets. Real
            # publication checks below require the bootstrap/runtime and keys.
            continue
        if source.is_symlink():
            raise ValueError("Localization catalogues cannot be symlinks.")
        data = json.loads(source.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict) or set(data) != set(LANGUAGES):
            raise ValueError(f"Catalogue needs zh-CN and en objects: {source.name}")
        for language in LANGUAGES:
            if not isinstance(data[language], dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in data[language].items()):
                raise ValueError(f"Catalogue keys and values must be text: {source.name}")
            for key, value in data[language].items():
                if key in result[language] and result[language][key] != value:
                    raise ValueError(f"Localization key collision: {key}")
                result[language][key] = value
    return result


def _attribute(raw, name, value):
    field = re.compile(r"(?<![\w:-])" + re.escape(name) + r"\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
    replacement = name + '="' + escape(value, quote=True) + '"'
    if field.search(raw):
        return field.sub(lambda _: replacement, raw, count=1)
    return re.sub(r"\s*/?>$", lambda match: " " + replacement + match.group(0), raw, count=1)


class _Localizer(HTMLParser):
    def __init__(self, page, catalogue, language, route, counterpart):
        super().__init__(convert_charrefs=False)
        self.page, self.catalogue, self.language = page, catalogue, language
        self.route, self.counterpart = route, counterpart
        self.lines, total = [], 0
        for line in page.splitlines(keepends=True):
            self.lines.append(total)
            total += len(line)
        self.stack, self.edits = [], []
        self.feed(page)
        self.close()

    def source_offset(self):
        row, column = self.getpos()
        return self.lines[row - 1] + column

    def translated(self, key):
        if key not in self.catalogue:
            raise ValueError(f"Missing {self.language} localization key: {key}")
        return self.catalogue[key]

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        raw, start = self.get_starttag_text(), self.source_offset()
        updated = raw
        for field in ("title", "aria-label", "placeholder", "alt"):
            if values.get("data-i18n-" + field):
                updated = _attribute(updated, field, self.translated(values["data-i18n-" + field]))
        content_key = values.get("data-i18n")
        in_main = any(item[0] == "main" for item in self.stack)
        chrome = not in_main and any(item[0] in {"header", "footer"} for item in self.stack)
        classes = values.get("class", "").split()
        if "skip-link" in classes and "common.skip" in self.catalogue:
            content_key = "common.skip"
        if tag == "nav" and "site-nav" in classes and "common.nav.label" in self.catalogue:
            updated = _attribute(updated, "aria-label", self.catalogue["common.nav.label"])
            updated = _attribute(updated, "data-i18n-aria-label", "common.nav.label")
        if tag == "a" and "brand" in classes and "common.brandHome" in self.catalogue:
            updated = _attribute(updated, "aria-label", self.catalogue["common.brandHome"])
            updated = _attribute(updated, "data-i18n-aria-label", "common.brandHome")
        if "theme-toggle" in classes and "common.theme.switchDark" in self.catalogue:
            updated = _attribute(updated, "aria-label", self.catalogue["common.theme.switchDark"])
            updated = _attribute(updated, "title", self.catalogue["common.theme.switchDark"])
        if "theme-label" in classes and "common.theme.dark" in self.catalogue:
            content_key = "common.theme.dark"
        if tag == "a" and "data-i18n-link" in values and "data-preserve-language-link" not in values and values.get("href"):
            updated = _attribute(updated, "href", localized_path(values["href"], self.language))
        if tag == "html":
            updated = _attribute(updated, "lang", self.language)
        if tag in {"header", "footer"} and not in_main and "lang" in values:
            updated = _attribute(updated, "lang", self.language)
        if tag == "a" and "site-language-switch" in classes:
            if self.counterpart:
                updated = _attribute(updated, "href", self.counterpart)
            updated = _attribute(updated, "lang", "zh-CN" if self.language == "en" else "en")
            updated = _attribute(updated, "data-site-language-switch", "zh-CN" if self.language == "en" else "en")
            updated = _attribute(updated, "aria-label", "Switch site language to Chinese" if self.language == "en" else "切换网站语言为英语")
            if "common.languageSwitch" in self.catalogue:
                content_key = "common.languageSwitch"
        elif tag == "a" and chrome and "data-preserve-language-link" not in values and values.get("href"):
            href = localized_path(values["href"], self.language)
            updated = _attribute(updated, "href", href)
            chinese = localized_path(href, "zh-CN")
            key = "common.nav." + NAV_KEYS[chinese] if chinese in NAV_KEYS and "brand" not in classes else ""
            if key in self.catalogue and not content_key:
                content_key = key
            if chinese == "/articles/feed.xml" and "common.rss" in self.catalogue:
                content_key = "common.rss"
        if updated != raw:
            self.edits.append((start, start + len(raw), updated))
        if tag not in VOID:
            self.stack.append((tag, start + len(raw), content_key))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not self.stack:
            return
        index = next((i for i in range(len(self.stack) - 1, -1, -1) if self.stack[i][0] == tag), None)
        if index is None:
            return
        _, start, key = self.stack[index]
        del self.stack[index:]
        if key:
            # Authored data-i18n is reserved for text-only elements. Chrome
            # labels may originally contain a bilingual span; replace just the
            # label with a marked text span, retaining the outer anchor.
            label = escape(self.translated(key))
            replacement = f'<span data-i18n="{escape(key, quote=True)}">{label}</span>' if tag == "a" else label
            self.edits = [edit for edit in self.edits if not (start <= edit[0] < self.source_offset())]
            self.edits.append((start, self.source_offset(), replacement))

    def result(self):
        page = self.page
        for start, end, replacement in sorted(self.edits, reverse=True):
            page = page[:start] + replacement + page[end:]
        return page


def _metadata_values(value, fallback, language):
    if isinstance(value, dict):
        if any(key not in LANGUAGES or not isinstance(text, str) for key, text in value.items()):
            raise ValueError("Localized SEO values must contain language-to-text pairs.")
        return {lang: value.get(lang, fallback) for lang in LANGUAGES}
    selected = value if value is not None else fallback
    return {lang: selected for lang in LANGUAGES}


def appearance_bootstrap():
    """Resolve light/dark before CSS: a saved choice, otherwise the system setting."""
    return '<script>(()=>{let saved;try{saved=localStorage.getItem("xieyuqing-blog-theme");}catch(_){}const mode=saved==="light"||saved==="dark"?saved:"system";let tone=mode;if(mode==="system"){tone="light";try{if(window.matchMedia("(prefers-color-scheme: dark)").matches)tone="dark";}catch(_){}}document.documentElement.dataset.theme=tone;document.documentElement.dataset.themeMode=mode;})();</script>'


def version_shared_assets(page, root):
    """Refresh shared UI after local/production updates without flushing user data."""
    import hashlib
    sources = {name: Path(root) / 'home/assets' / name for name in ['site-themes.css', 'portal.css', 'portfolio.css', 'photos.css', 'anthology.css', 'anthology-selection.css', 'game.css', 'ranking-skins.css', 'site-nav.css', 'site-music.css', 'portal.js', 'site-navigation.js', 'site-music.js', 'home-daily.css', 'home-daily.js', 'home-now.js', 'home-earth.js', 'astronomy-solar.js']}
    sources['style.css'] = Path(root) / 'blog/style.css'
    for name in ('d3-7.9.0.min.js', 'lunar-javascript-1.7.7.js'):
        sources[name] = Path(root) / 'home/assets/vendor' / name
    def version(match):
        route = match.group(2); source = sources.get(route.rsplit('/', 1)[-1])
        if source is None or not source.is_file():
            return match.group(0)
        if source.is_symlink():
            raise ValueError('Shared UI assets cannot be symlinks.')
        return match.group(1) + route + '?v=' + hashlib.sha256(source.read_bytes()).hexdigest()[:12] + match.group(3)
    return re.sub(r'((?:src|href)=["\'])(/(?:(?:articles/)?assets)/(?:site-themes|portal|portfolio|photos|anthology|anthology-selection|game|ranking-skins|site-nav|site-music|site-navigation|home-daily|home-now|home-earth|astronomy-solar|style|vendor/(?:d3-7\.9\.0\.min|lunar-javascript-1\.7\.7))\.(?:css|js))(?:\?[^"\']*)?(["\'])', version, page)


NAV_GROUPS = (('/articles/', 'articles', [('/articles/', 'myArticles'), ('/anthology/', 'classics')], ['/articles/', '/anthology/']),
              ('/projects/', 'projects', [('/projects/', 'aiApps'), ('/game/', 'games')], ['/projects/', '/game/']),
              ('/map/', 'map', [('/map/', 'myFootprints'), ('/photos/', 'myPhotos')], ['/map/', '/photos/']),
              ('/about/', 'about', [], ['/about/']))
NAV_REQUIRED = (*NAV_KEYS.values(), "myArticles", "classics", "aiApps", "myFootprints", "myPhotos", "footprints",
                "more.articles", "more.projects", "more.map")
FOOTER_LINKS = (('/today/', 'today'), ('/articles/', 'articles'), ('/anthology/', 'anthology'), ('/projects/', 'projects'), ('/game/', 'games'),
                ('/map/', 'map'), ('/photos/', 'photos'), ('/about/', 'about'))
CONTACT_EMAIL = "xieyuqing.me@gmail.com"


def compact_header(page, route, paired, language="zh-CN"):
    """The bilingual name links home; three native menu buttons and an About link."""
    def render(match):
        raw = match.group(0)
        theme = re.search(r'<button\b[^>]*class=["\'][^"\']*theme-toggle[^"\']*["\'][^>]*>.*?</button>', raw, re.S)
        if not theme:
            return raw
        def link(path, key, primary=False):
            current = ' aria-current="page"' if route == path else ''
            css = ' class="nav-entry"' if primary else ''
            return f'<a{css} href="{path}"{current} data-i18n="common.nav.{key}"></a>'
        preserved = ''.join(re.findall(r'<a\b(?=[^>]*data-preserve-language-link)[^>]*>.*?</a>', raw, re.S))
        nav = ''
        for path, key, links, branches in NAV_GROUPS:
            active = route == path or any(route.startswith(branch) for branch in branches)
            nav += f'<div class="nav-item{" is-current" if active else ""}" data-nav-group="{key}">'
            if links:
                extras = ''.join(link(*item) for item in links) + (preserved if key == 'articles' else '')
                label_key = 'footprints' if key == 'map' else key
                nav += (f'<details class="nav-group"><summary class="nav-entry" data-i18n-aria-label="common.nav.more.{key}">'
                        f'<span data-i18n="common.nav.{label_key}"></span><span class="nav-chevron" aria-hidden="true">⌄</span></summary>'
                        f'<div class="nav-menu">{extras}</div></details>')
            else:
                nav += link(path, key, primary=True)
            nav += '</div>'
        original_switch = re.search(r'<a\b[^>]*class=["\'][^"\']*site-language-switch[^"\']*["\'][^>]*>.*?</a>', raw, re.S)
        switch = original_switch.group(0) if original_switch else ('<a class="site-language-switch" href="/en/" lang="en">EN</a>' if paired else '')
        theme_control = ('<button class="theme-toggle" id="theme-toggle" type="button" hidden>'
                         '<span class="theme-icon" aria-hidden="true"></span><span class="theme-label sr-only"></span></button>')
        return (f'<header class="site-header container header-compact" lang="{language}"><a class="brand" href="/" aria-label="谢雨卿的个人主页"><span class="brand-name" data-i18n="common.brandName">谢雨卿</span> <span class="brand-english" lang="en" data-i18n="common.brandEnglish">Xie Yuqing · Carl</span></a>'
                + '<nav class="site-nav" aria-label="主导航">' + nav + '</nav><div class="header-tools">' + switch + theme_control + '</div></header>')
    return re.sub(r'<header\b[^>]*class=["\'][^"\']*site-header[^"\']*["\'][^>]*>.*?</header>', render, page, count=1, flags=re.S)


def unified_footer(page, route, language="zh-CN"):
    """Every page ends with the same signature, section links and contact line."""
    def link(path, key):
        current = ' aria-current="page"' if route == path else ''
        return f'<a href="{path}"{current} data-i18n="common.nav.{key}"></a>'
    links = ''.join(link(path, key) for path, key in FOOTER_LINKS)
    footer = (f'<footer class="site-footer container" lang="{language}">'
              '<div class="footer-sign"><p class="footer-brand"><span data-i18n="common.brandName">谢雨卿</span>'
              '<span class="footer-yuliao" data-i18n="common.footer.yuliao"></span></p>'
              '<p class="footer-note" data-i18n="common.signature.2"></p></div>'
              f'<nav class="footer-links" aria-label="页脚导航" data-i18n-aria-label="common.footer.label">{links}</nav>'
              '<p class="footer-meta"><span data-i18n="common.footer.wechat"></span>'
              f'<a href="mailto:{CONTACT_EMAIL}" data-i18n="common.footer.email"></a>'
              '<a href="/articles/feed.xml" data-i18n="common.rss"></a>'
              '<a href="/about/#site" data-i18n="common.footer.site"></a></p></footer>')
    return re.sub(r'<footer\b[^>]*class=["\'][^"\']*\bsite-footer\b[^"\']*["\'][^>]*>.*?</footer>', lambda _: footer, page, count=1, flags=re.S)


def localize_page(page, root, address, route, language="zh-CN", modules=(), title=None, description=None):
    """Translate marked UI and inject shared runtime/SEO without touching content.

    `route` is the Chinese counterpart. `title`/`description` may be plain
    strings or {"zh-CN": text, "en": text} mappings for runtime SEO updates.
    Exact article URLs retain their existing canonical/hreflang/Original links.
    """
    if language not in LANGUAGES or not route.startswith("/"):
        raise ValueError("Localize a root route in zh-CN or en.")
    catalogues = load_catalogues(root, modules)
    chinese = localized_path(route, "zh-CN")
    english = localized_path(chinese, "en")
    paired = chinese != english
    if all("common.nav." + key in catalogues[language] for key in NAV_REQUIRED) and all(key in catalogues[language] for key in ("common.brandName", "common.brandEnglish")):
        page = compact_header(page, chinese, paired, language)
        if "common.footer.note" in catalogues[language]:
            page = unified_footer(page, chinese, language)
    current = localized_path(chinese, language)
    canonical_path = "/articles/index.html" if route == "/articles/index.html" and language == "zh-CN" else current
    counterpart = localized_path(chinese, "zh-CN" if language == "en" else "en") if paired else None
    if counterpart and not re.search(r'class=["\'][^"\']*\bsite-language-switch\b', page):
        label = "中文" if language == "en" else "EN"
        switch = f'<a class="site-language-switch" href="{escape(counterpart, quote=True)}" lang="{"zh-CN" if language == "en" else "en"}">{label}</a>'
        page = re.sub(r'(<nav\b[^>]*class=["\'][^"\']*\bsite-nav\b[^"\']*["\'][^>]*>.*?)(</nav>)', lambda match: match.group(1) + switch + match.group(2), page, count=1, flags=re.I | re.S)
    if "common.brandName" in catalogues[language]:
        def brand_name(match):
            raw = match.group(0)
            if re.search(r'data-i18n=["\']common\.brandName["\']', raw):
                return raw
            return re.sub(r'(?<=>)(?:谢雨卿|Xie Yuqing)(?=\s*<)',
                          '<span data-i18n="common.brandName">' + escape(catalogues[language]["common.brandName"]) + '</span>', raw)
        page = re.sub(r'<a\b[^>]*class=["\'][^"\']*\bbrand\b[^"\']*["\'][^>]*>.*?</a>', brand_name, page, flags=re.I | re.S)
    page = _Localizer(page, catalogues[language], language, chinese, counterpart).result()
    title_match = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    default_title = unescape(re.sub(r"<[^>]+>", "", title_match.group(1))) if title_match else ""
    description_match = re.search(r'<meta\s+[^>]*name=["\']description["\'][^>]*>', page, re.I)
    default_description = ""
    if description_match:
        value = re.search(r'content=(["\'])(.*?)\1', description_match.group(0), re.I | re.S)
        default_description = unescape(value.group(2)) if value else ""
    titles = _metadata_values(title, default_title, language)
    descriptions = _metadata_values(description, default_description, language)
    # Replace only metadata, never body links or text matching a translated word.
    page = re.sub(r"<title\b[^>]*>.*?</title>", "<title>" + escape(titles[language]) + "</title>", page, count=1, flags=re.I | re.S)
    def meta(match):
        raw = match.group(0)
        if re.search(r'(?:name|property)=["\'](?:description|og:description)["\']', raw, re.I):
            return _attribute(raw, "content", descriptions[language])
        if re.search(r'property=["\']og:title["\']', raw, re.I):
            return _attribute(raw, "content", titles[language])
        if re.search(r'property=["\']og:image:alt["\']', raw, re.I) and "common.shareImageAlt" in catalogues[language]:
            return _attribute(raw, "content", catalogues[language]["common.shareImageAlt"])
        if paired and re.search(r'property=["\']og:url["\']', raw, re.I):
            return _attribute(raw, "content", address.rstrip("/") + canonical_path)
        return raw
    page = re.sub(r"<meta\b[^>]*>", meta, page, flags=re.I)
    if paired:
        page = re.sub(r'<link\b(?=[^>]*\brel=["\'](?:canonical|alternate)["\'])(?=[^>]*(?:\brel=["\']canonical["\']|\bhreflang=))[^>]*>\s*', "", page, flags=re.I)
        metadata = (f'<link rel="canonical" href="{escape(address.rstrip("/") + canonical_path, quote=True)}">\n'
                    f'<link rel="alternate" hreflang="zh-CN" href="{escape(address.rstrip("/") + chinese, quote=True)}">\n'
                    f'<link rel="alternate" hreflang="en" href="{escape(address.rstrip("/") + english, quote=True)}">\n')
    else:
        metadata = ""
    # Feature apps preserve state; static profiles/articles keep their authored
    # complete counterpart documents, including translated article links/bodies.
    preserve_state = any(chinese == prefix + "/" or chinese.startswith(prefix + "/") for prefix in ("/photos", "/map", "/game", "/anthology"))
    bootstrap = {**catalogues, "page": {"route": chinese, "titles": titles, "descriptions": descriptions,
                 "switchMode": "history" if preserve_state else "navigate"}}
    encoded = json.dumps(bootstrap, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    page = re.sub(r'<script\b[^>]*\bid=["\']site-i18n-data["\'][^>]*>.*?</script>\s*', "", page, flags=re.I | re.S)
    page = re.sub(r'<script\b[^>]*\bsrc=["\']/assets/site-i18n\.js["\'][^>]*>\s*</script>\s*', "", page, flags=re.I)
    bootstrap_html = f'{metadata}<script id="site-i18n-data" type="application/json">{encoded}</script>\n<script src="/assets/site-i18n.js"></script>\n'
    if (Path(root) / "home/assets/site-music.js").is_file() and "music.open" in catalogues[language]:
        bootstrap_html += '<link rel="stylesheet" href="/assets/site-nav.css"><link rel="stylesheet" href="/assets/site-music.css"><script src="/assets/site-music.js" defer></script>\n'
    if (Path(root) / "home/assets/site-navigation.js").is_file():
        page = re.sub(r'<script\b[^>]*\bsrc=["\']/assets/portal\.js["\'][^>]*>\s*</script>\s*', "", page, flags=re.I)
        bootstrap_html += '<script src="/assets/portal.js" defer></script>\n<script src="/assets/site-navigation.js" defer></script>\n'
    # Choose appearance before every injected stylesheet, including on direct article loads.
    appearance = re.search(r'<script>(?:(?!</script>).)*xieyuqing-blog-theme(?:(?!</script>).)*</script>', page, re.S)
    if appearance:
        bootstrap_html = appearance_bootstrap() + "\n" + bootstrap_html
        page = page[:appearance.start()] + page[appearance.end():]
    # Synchronous shared runtime must precede all module and deferred UI scripts.
    if re.search(r'<meta\b[^>]*charset\s*=', page, re.I):
        page = re.sub(r'<meta\b[^>]*charset\s*=[^>]*>', lambda match: match.group(0) + "\n" + bootstrap_html, page, count=1, flags=re.I)
    else:
        page = re.sub(r"<head\b[^>]*>", lambda match: match.group(0) + "\n" + bootstrap_html, page, count=1, flags=re.I)
    if (Path(root) / "home/assets/site-themes.css").is_file():
        page = page.replace("</head>", '<link rel="stylesheet" href="/assets/site-themes.css">\n</head>', 1)
    return version_shared_assets(page, root)


def check_site_languages(output, address):
    """Check localized feature shells and shared-runtime bootstrap offline."""
    output = Path(output).resolve()
    checked, english = 0, 0
    class Page(HTMLParser):
        def __init__(self, text):
            super().__init__()
            self.elements, self.bootstrap, self.in_bootstrap = [], "", False
            self.feed(text)
        def handle_starttag(self, tag, attrs):
            values = dict(attrs)
            self.elements.append((tag, values))
            if tag == "script" and values.get("id") == "site-i18n-data":
                self.in_bootstrap = True
        def handle_data(self, text):
            if self.in_bootstrap:
                self.bootstrap += text
        def handle_endtag(self, tag):
            if tag == "script":
                self.in_bootstrap = False
    for path in output.rglob("*.html"):
        relative = path.relative_to(output).as_posix()
        if not relative.endswith("index.html"):
            continue  # Original/translated content identities have their own strict checks.
        route = "/" + relative.removesuffix("index.html")
        chinese = localized_path(route, "zh-CN")
        if chinese == localized_path(chinese, "en"):
            continue
        text = path.read_text(encoding="utf-8")
        page = Page(text)
        language = "en" if route.startswith("/en/") else "zh-CN"
        if not any(tag == "html" and attrs.get("lang") == language for tag, attrs in page.elements):
            raise ValueError(f"Feature HTML language does not match its explicit route: {route}")
        settings = [attrs for tag, attrs in page.elements if tag == "script" and attrs.get("id") == "site-i18n-data"]
        runtimes = [attrs for tag, attrs in page.elements if tag == "script" and attrs.get("src") == "/assets/site-i18n.js"]
        if len(settings) != 1 or len(runtimes) != 1:
            raise ValueError(f"Feature page requires one shared bootstrap and runtime: {route}")
        data = json.loads(page.bootstrap)
        if data.get("page", {}).get("route") != chinese or not all(isinstance(data.get(lang), dict) for lang in LANGUAGES):
            raise ValueError(f"Feature bootstrap route/catalogues are invalid: {route}")
        for lang in LANGUAGES:
            if not isinstance(data["page"].get("titles", {}).get(lang), str) or not isinstance(data["page"].get("descriptions", {}).get(lang), str):
                raise ValueError(f"Feature page needs both SEO languages: {route}")
        for _, attrs in page.elements:
            for field in ("data-i18n", "data-i18n-title", "data-i18n-aria-label", "data-i18n-placeholder", "data-i18n-alt"):
                if attrs.get(field) and attrs[field] not in data[language]:
                    raise ValueError(f"Feature UI key missing from bootstrap: {route}: {attrs[field]}")
        runtime_pos = text.find('src="/assets/site-i18n.js"')
        for tag, attrs in page.elements:
            if tag == "script" and attrs.get("src") and attrs["src"] != "/assets/site-i18n.js":
                if text.find(attrs["src"]) < runtime_pos:
                    raise ValueError(f"Shared runtime must load before feature scripts: {route}")
        checked += 1
        english += language == "en"
    if not (output / "assets/site-i18n.js").is_file():
        raise ValueError("The common localization runtime was not published.")
    return {"success": True, "feature_pages": checked, "english_feature_pages": english}
