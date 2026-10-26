"""Render a strictly public photo catalog; never read the private photo vault."""
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import shutil

from image_assets import _is_link
from site_i18n import localize_page, localized_path

ALBUM_FIELDS = {"id", "title", "description", "date", "location", "photos"}
PHOTO_FIELDS = {"id", "title", "caption", "date", "date_text", "time", "location", "width", "height",
                "src", "thumbnail", "thumbnail_width", "thumbnail_height"}
TEXT_FIELDS = {"title", "caption", "date", "date_text", "time", "location", "description"}
IMAGE_URL = re.compile(r"/photos/images/(p-[0-9a-f]{24})-([0-9a-f]{12,64})-([1-9][0-9]{0,4})\.webp\Z")
SLUG = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)
OWNED_FILE = re.compile(r"(?:index\.html|[a-z][a-z0-9]*(?:-[a-z0-9]+)*/index\.html|images/p-[0-9a-f]{24}-[0-9a-f]{12,64}-[1-9][0-9]{0,4}\.webp)\Z")
MARKER = ".generated-by-photo-pages"
MANIFEST = ".photo-files.json"
MARKER_TEXT = "PhotoPages generated public pages, ownership version 1.\n"


def _text(value, field):
    if (not isinstance(value, str) or len(value) > (12000 if field in {"caption", "description"} else 1000)
            or PRIVATE_PATH.search(value) or any(ord(c) < 32 and c != "\n" for c in value)
            or "\r" in value or "\x7f" in value):
        raise ValueError(f"Invalid public photo text: {field}.")


def validate_catalog(data):
    """Return the same catalog after checking its public field and URL allowlists."""
    if not isinstance(data, dict) or set(data) != {"version", "albums"} or type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Photo catalog must contain only version 1 and albums.")
    if not isinstance(data["albums"], list) or len(data["albums"]) > 1000:
        raise ValueError("Photo catalog albums must be a list of at most 1000 entries.")
    album_ids = set()
    for album in data["albums"]:
        if not isinstance(album, dict) or set(album) != ALBUM_FIELDS:
            raise ValueError("Album fields are incomplete or contain private metadata.")
        slug = album["id"]
        if not isinstance(slug, str) or len(slug) > 64 or not SLUG.fullmatch(slug) or slug in album_ids or slug == "images":
            raise ValueError("Photo album IDs must be unique lowercase slugs outside reserved routes.")
        album_ids.add(slug)
        for field in ("title", "description", "date", "location"):
            _text(album[field], field)
        if not album["title"].strip():
            raise ValueError("Albums require their original title.")
        if not isinstance(album["photos"], list) or len(album["photos"]) > 10000:
            raise ValueError("Album photos must be a list of at most 10000 entries.")
        photo_ids = set()
        for photo in album["photos"]:
            if not isinstance(photo, dict) or set(photo) != PHOTO_FIELDS:
                raise ValueError("Photo fields are incomplete or contain private metadata.")
            if not isinstance(photo["id"], str) or not re.fullmatch(r"p-[0-9a-f]{24}", photo["id"]) or photo["id"] in photo_ids:
                raise ValueError("Photo IDs must be stable unique p- identifiers within each album.")
            photo_ids.add(photo["id"])
            for field in PHOTO_FIELDS & TEXT_FIELDS:
                _text(photo[field], field)
            for field in ("width", "height", "thumbnail_width", "thumbnail_height"):
                if type(photo[field]) is not int or not 1 <= photo[field] <= 30000:
                    raise ValueError("Photo dimensions must be positive bounded integers.")
            for field, width in (("src", "width"), ("thumbnail", "thumbnail_width")):
                match = IMAGE_URL.fullmatch(photo[field]) if isinstance(photo[field], str) else None
                if not match or match[1] != photo["id"] or int(match[3]) != photo[width]:
                    raise ValueError("Photo URLs must reference their own compressed public WebP derivatives.")
            if photo["thumbnail_width"] > photo["width"] or photo["thumbnail_height"] > photo["height"]:
                raise ValueError("Photo thumbnail dimensions cannot exceed the large derivative.")
            if abs(photo["thumbnail_width"] / photo["thumbnail_height"] - photo["width"] / photo["height"]) > .03:
                raise ValueError("Photo thumbnail and large image must share their orientation and aspect ratio.")
    return data


def _tr(catalogue, language, key, fallback, **values):
    value = (catalogue or {}).get(language, {}).get(key, fallback)
    for name, replacement in values.items():
        value = value.replace("{" + name + "}", str(replacement))
    return value


def _label(key, value, tag="span", attributes=""):
    return f'<{tag}{attributes} data-i18n="{escape(key, quote=True)}">{escape(value)}</{tag}>'


def _facts(date="", time="", location="", *, prefix="", date_field="date_text", language="zh-CN", catalogue=None):
    values = [(date, date_field), (time if time and time not in date else "", None), (location, "location")]
    items = []
    for value, field in values:
        if not value:
            continue
        key = prefix + "." + field if prefix and field else ""
        text = _tr(catalogue, language, key, value) if key else value
        items.append(_label(key, text, "li") if key else f"<li>{escape(text)}</li>")
    return '<ul class="photo-facts">' + "".join(items) + "</ul>" if items else ""


def _photo_count(count, language, catalogue):
    key = "photos.count_one" if count == 1 else "photos.count_many"
    text = _tr(catalogue, language, key, "{count} 张照片", count=count)
    return f'<p class="photo-help" data-photo-count="{count}">{escape(text)}</p>'


def render_index(albums, *, language="zh-CN", catalogue=None):
    cards = []
    tr = lambda key, fallback: _tr(catalogue, language, key, fallback)
    for album in albums:
        prefix = "photos.album." + album["id"]
        photos = album["photos"]
        if photos:
            photo = photos[0]
            photo_key = "photos.photo." + photo["id"] + ".alt"
            alt = tr(photo_key, photo["title"] or photo["location"] or photo["caption"])
            cover = (f'<img src="{escape(photo["thumbnail"])}" width="{photo["thumbnail_width"]}" '
                     f'height="{photo["thumbnail_height"]}" alt="{escape(alt, quote=True)}" data-i18n-alt="{photo_key}" loading="lazy" decoding="async">')
        else:
            cover = _label("photos.no_cover", tr("photos.no_cover", "暂无公开照片"))
        description = (_label(prefix + ".description", tr(prefix + ".description", album["description"]), "p", ' class="album-description"')
                       if album["description"] else "")
        title = _label(prefix + ".title", tr(prefix + ".title", album["title"]))
        route = localized_path("/photos/" + album["id"] + "/", language)
        cards.append(f"""<article class="album-card"><a href="{route}"><div class="album-cover">{cover}</div>
<h2>{title} <span class="album-arrow" aria-hidden="true">→</span></h2></a>{description}
{_facts(album["date"], location=album["location"], prefix=prefix, date_field="date", language=language, catalogue=catalogue)}{_photo_count(len(photos), language, catalogue)}</article>""")
    body = ('<div class="album-grid">' + "\n".join(cards) + "</div>" if cards else
            _label("photos.empty_index", tr("photos.empty_index", "相册正在整理中。"), "p", ' class="photos-empty"'))
    return ('<section class="photos-intro" aria-labelledby="photos-title"><p class="eyebrow">'
            + _label("photos.eyebrow", tr("photos.eyebrow", "PHOTOGRAPHY · 摄影")) + '</p>'
            + _label("photos.heading", tr("photos.heading", "摄影"), "h1", ' id="photos-title"') + '</section>' + body)


def render_album(album, *, language="zh-CN", catalogue=None):
    rows = []
    tr = lambda key, fallback: _tr(catalogue, language, key, fallback)
    for index, photo in enumerate(album["photos"]):
        prefix = "photos.photo." + photo["id"]
        title = tr(prefix + ".title", photo["title"])
        heading = _label(prefix + ".title", title, "h2") if photo["title"] else ""
        caption = ('<div class="photo-story">' + _label("photos.story", tr("photos.story", "照片故事"), "p", ' class="photo-story-label"')
                   + _label(prefix + ".caption", tr(prefix + ".caption", photo["caption"]), "p", ' class="photo-caption"') + '</div>'
                   if photo["caption"] else "")
        facts = _facts(photo["date_text"] or photo["date"], photo["time"], photo["location"], prefix=prefix,
                       date_field="date_text" if photo["date_text"] else None, language=language, catalogue=catalogue)
        copy = f'<figcaption>{heading}{caption}{facts}</figcaption>' if heading or caption or facts else ""
        aria = _tr(catalogue, language, "photos.open_named" if photo["title"] else "photos.open",
                   "查看第 {number} 张照片" + ("：{title}" if photo["title"] else ""), number=index + 1, title=title)
        alt = tr(prefix + ".alt", photo["title"] or photo["location"] or photo["caption"])
        rows.append(f"""<figure class="photo-item" id="{escape(photo["id"], quote=True)}"><a class="photo-open" data-photo-open data-photo-index="{index}" href="{escape(photo["src"])}" aria-label="{escape(aria, quote=True)}"><img src="{escape(photo["thumbnail"])}" width="{photo["thumbnail_width"]}" height="{photo["thumbnail_height"]}" alt="{escape(alt, quote=True)}" data-i18n-alt="{prefix}.alt" loading="lazy" decoding="async"></a>{copy}</figure>""")
    photos = ('<div class="photo-grid">' + "\n".join(rows) + "</div>" if rows else
              _label("photos.empty_album", tr("photos.empty_album", "此相册暂无公开照片。"), "p", ' class="photos-empty"'))
    prefix = "photos.album." + album["id"]
    description = (_label(prefix + ".description", tr(prefix + ".description", album["description"]), "p", ' class="album-description"')
                   if album["description"] else "")
    header = (f'<a class="photo-back" href="{localized_path("/photos/", language)}" data-i18n="photos.back">{escape(tr("photos.back", "← 全部相册"))}</a>'
              '<section class="photos-intro" aria-labelledby="album-title"><p class="eyebrow">'
              + _label("photos.eyebrow", tr("photos.eyebrow", "PHOTOGRAPHY · 摄影")) + '</p>'
              + _label(prefix + ".title", tr(prefix + ".title", album["title"]), "h1", ' id="album-title"') + description
              + _facts(album["date"], location=album["location"], prefix=prefix, date_field="date", language=language, catalogue=catalogue)
              + _photo_count(len(rows), language, catalogue) + '</section>')
    if not rows:
        return header + photos
    encoded = json.dumps(album["photos"], ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    viewer = """<dialog class="photo-viewer" id="photo-viewer" aria-label="照片查看器" data-i18n-aria-label="photos.viewer" aria-describedby="photo-viewer-caption photo-viewer-facts photo-viewer-hint">
<div class="photo-viewer-head"><p class="photo-position" aria-live="polite"></p><div class="photo-viewer-actions"><button class="site-language-switch" type="button" data-site-language-switch="toggle" data-i18n="photos.language" data-i18n-aria-label="photos.switch_language">English</button><button class="photo-close" type="button"><span data-i18n="photos.close">关闭</span> <span aria-hidden="true">×</span></button></div></div>
<div class="photo-stage"><img class="photo-large" alt=""><button class="photo-previous" type="button" aria-label="上一张照片" data-i18n-aria-label="photos.previous">←</button><button class="photo-next" type="button" aria-label="下一张照片" data-i18n-aria-label="photos.next">→</button></div>
<div class="photo-viewer-copy"><h2 id="photo-viewer-title"></h2><p class="photo-story-label" id="photo-viewer-story-label" data-i18n="photos.story">照片故事</p><p class="photo-caption" id="photo-viewer-caption"></p><ul class="photo-facts" id="photo-viewer-facts"></ul><p class="photo-load-error" id="photo-load-error" role="status" data-i18n="photos.image_error" hidden>照片暂时无法加载。可切换照片或稍后重试。</p><p class="photo-viewer-hint" id="photo-viewer-hint" data-i18n="photos.keyboard_hint">← → 切换 · Esc 关闭 · 手机可左右滑动，双指放大</p></div></dialog>"""
    return header + photos + _label("photos.open_hint", tr("photos.open_hint", "点击照片查看大图"), "p", ' class="photo-help"') + viewer + f'<script type="application/json" id="photo-data">{encoded}</script>'


def _catalogue(root):
    path = root / "home/locales/photos.json"
    _safe_path(root, path)
    if not path.is_file():
        raise ValueError("Photography language catalogue is missing.")
    value = json.loads(path.read_text(encoding="utf-8"))
    if set(value) != {"zh-CN", "en"} or any(not isinstance(group, dict) for group in value.values()):
        raise ValueError("Photography language catalogue needs Chinese and English text.")
    for group in value.values():
        for key, text in group.items():
            if not isinstance(key, str) or not key.startswith("photos."):
                raise ValueError("Photography translations need namespaced keys.")
            _text(text, "caption")
    return value


def _check_english_metadata(catalog, catalogue):
    for album in catalog["albums"]:
        for item, prefix, fields in [(album, "photos.album." + album["id"], ("title", "description", "date", "location")),
                                     *[(photo, "photos.photo." + photo["id"], ("title", "caption", "date_text", "location")) for photo in album["photos"]]]:
            for field in fields:
                key = prefix + "." + field
                if item[field] and (catalogue["zh-CN"].get(key) != item[field] or not catalogue["en"].get(key)):
                    raise ValueError("Photography English metadata is missing or stale: " + key)
            if "photos" not in item and not catalogue["en"].get(prefix + ".alt"):
                raise ValueError("Photography English alt text is missing: " + prefix)


def _safe_path(base, path):
    base, path = Path(base).absolute(), Path(path).absolute()
    if not path.resolve().is_relative_to(base.resolve()):
        raise ValueError("Photo path escapes its owned directory.")
    current = path
    while True:
        if _is_link(current):
            raise ValueError("Photo paths cannot contain symlinks or junctions.")
        if current == base:
            break
        if current.parent == current:
            raise ValueError("Photo path is outside its owned directory.")
        current = current.parent


def _render_page(template, address, route, title, description, content):
    values = {"site_url": address, "photo_path": route, "photo_title": title,
              "photo_description": description, "photo_content": content}
    # Substitute once: literal braces in the user's text are not template syntax.
    result = re.sub(r"\{\{([a-z_]+)\}\}", lambda match: values[match[1]] if match[1] == "photo_content" else escape(values[match[1]], quote=True), template)
    return result


def build_photos(root, output, address, *, allow_local_map_preview=False, language="zh-CN"):
    """Copy only validated public derivatives and render all photography routes."""
    root, output = Path(root).absolute(), Path(output).absolute()
    if language not in {"zh-CN", "en"}:
        raise ValueError("Unsupported photography language.")
    parts = urlsplit(address)
    if parts.scheme != "https" or not parts.netloc or parts.path or parts.query or parts.fragment or parts.username or parts.password:
        raise ValueError("Photo pages need the root HTTPS site origin.")
    allowed_output = "_site_map_preview" if allow_local_map_preview else "_site_unified"
    if output.resolve() != root.resolve() / allowed_output:
        raise ValueError("Photo output must be the existing unified site directory.")
    catalog_path = root / "photos/catalog.json"
    _safe_path(root, catalog_path)
    catalog = validate_catalog(json.loads(catalog_path.read_text(encoding="utf-8"))) if catalog_path.exists() else {"version": 1, "albums": []}
    catalogue = _catalogue(root)
    if language == "en":
        _check_english_metadata(catalog, catalogue)
    template_path = root / "home/photos.template.html"
    _safe_path(root, template_path)
    template = template_path.read_text(encoding="utf-8")
    if set(re.findall(r"\{\{([a-z_]+)\}\}", template)) != {"site_url", "photo_path", "photo_title", "photo_description", "photo_content"}:
        raise ValueError("Photo template placeholders are incomplete or unsupported.")
    assets = {}
    for album in catalog["albums"]:
        for photo in album["photos"]:
            for field, width, height in (("src", "width", "height"), ("thumbnail", "thumbnail_width", "thumbnail_height")):
                relative = photo[field].removeprefix("/photos/")
                source = root / "photos" / relative
                _safe_path(root, source)
                if not source.is_file():
                    raise ValueError("A referenced public photo derivative is missing.")
                dimensions = (photo[width], photo[height])
                if relative in assets and assets[relative][1] != dimensions:
                    raise ValueError("A photo derivative has conflicting dimensions.")
                assets[relative] = (source, dimensions)
    # Check actual encoding and metadata before creating any public output.
    if assets:
        from PIL import Image
        for source, dimensions in assets.values():
            with Image.open(source) as image:
                if image.format != "WEBP" or image.size != dimensions or image.getexif() or any(image.info.get(field) for field in ("exif", "xmp", "icc_profile")) or getattr(image, "is_animated", False):
                    raise ValueError("Public photos must be normalized static WebP images without private metadata.")
                image.verify()
    ui_assets = []
    for name in ("photos.css", "photos.js"):
        source = root / "home/assets" / name
        _safe_path(root, source)
        if not source.is_file():
            raise ValueError("Photography UI assets are missing.")
        destination = output / "assets" / name
        _safe_path(output, destination)
        ui_assets.append((source, destination))
    destination_root = output / ("en/photos" if language == "en" else "photos")
    _safe_path(output, destination_root)
    marker = destination_root / MARKER
    manifest_path = destination_root / MANIFEST
    for path in (marker, manifest_path):
        _safe_path(output, path)
    old_files = []
    if destination_root.exists() and any(destination_root.iterdir()):
        if not marker.is_file() or marker.read_text(encoding="utf-8") != MARKER_TEXT or not manifest_path.is_file():
            raise ValueError("Preserve the unrecognized photography output directory.")
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(previous, dict) or set(previous) != {"version", "files"} or previous["version"] != 1 or not isinstance(previous["files"], list):
            raise ValueError("Photo output ownership manifest is invalid.")
        old_files = previous["files"]
        if any(not isinstance(value, str) or not OWNED_FILE.fullmatch(value) for value in old_files) or len(set(old_files)) != len(old_files):
            raise ValueError("Photo output ownership contains unsafe or duplicate paths.")
    route_prefix = "en/photos" if language == "en" else "photos"
    routes = [route_prefix] + [route_prefix + "/" + album["id"] for album in catalog["albums"]]
    def page(route, title_key, title, description, content):
        full_titles = {lang: _tr(catalogue, lang, title_key, title + " · 谢雨卿") for lang in ("zh-CN", "en")}
        prefix = title_key.removesuffix(".page_title")
        descriptions = {lang: catalogue[lang].get(prefix + ".description") or
                         catalogue[lang].get(prefix + ".title", description) for lang in ("zh-CN", "en")}
        rendered = _render_page(template, address, route.strip("/"), title, description, content)
        rendered = re.sub(r'(<meta property="og:image:alt" content=")[^"]*(">)',
                          lambda match: match[1] + escape(_tr(catalogue, language, "photos.share_alt", "Xie Yuqing · Carl"), quote=True) + match[2], rendered)
        return localize_page(rendered, root, address, route, language=language, modules=("photos",),
                             title=full_titles, description=descriptions)
    files = {"index.html": page("/photos/", "photos.page_title", _tr(catalogue, language, "photos.heading", "摄影"),
             _tr(catalogue, language, "photos.description", "谢雨卿的摄影相册。"),
             render_index(catalog["albums"], language=language, catalogue=catalogue))}
    for album in catalog["albums"]:
        prefix = "photos.album." + album["id"]
        title = _tr(catalogue, language, prefix + ".title", album["title"])
        description = _tr(catalogue, language, prefix + ".description", album["description"]) or title
        files[album["id"] + "/index.html"] = page("/photos/" + album["id"] + "/", prefix + ".page_title", title,
             description, render_album(album, language=language, catalogue=catalogue))
    # Both languages share the public derivative URLs; only the Chinese owner copies/cleans them.
    if language == "en":
        assets = {}
        ui_assets = []
    desired = sorted(set(files) | set(assets))
    allowed_files = {MARKER, MANIFEST, *old_files}
    allowed_directories = set()
    for relative in set(old_files) | set(desired):
        allowed_directories.update(parent.as_posix() for parent in Path(relative).parents if parent != Path("."))
    if destination_root.exists():
        pending = [destination_root]
        while pending:
            directory = pending.pop()
            for entry in directory.iterdir():
                _safe_path(output, entry)
                relative = entry.relative_to(destination_root).as_posix()
                if entry.is_dir() and relative in allowed_directories:
                    pending.append(entry)
                elif not entry.is_file() or relative not in allowed_files:
                    raise ValueError("Preserve an unknown file or directory in photography output.")
    for relative in set(old_files) | set(desired):
        path = destination_root / relative
        _safe_path(output, path)
        if path.exists() and not path.is_file():
            raise ValueError("A generated photo destination is not a regular file.")
    destination_root.mkdir(parents=True, exist_ok=True)
    marker.write_text(MARKER_TEXT, encoding="utf-8")
    manifest_path.write_text(json.dumps({"version": 1, "files": sorted(set(old_files) | set(desired))}) + "\n", encoding="utf-8")
    for source, destination in ui_assets:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    for relative, content in files.items():
        destination = destination_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
    for relative, (source, _) in assets.items():
        destination = destination_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or destination.read_bytes() != source.read_bytes():
            shutil.copy2(source, destination)
    for relative in set(old_files) - set(desired):
        obsolete = destination_root / relative
        if obsolete.is_file():
            obsolete.unlink()
    for relative in sorted(allowed_directories, key=lambda value: len(Path(value).parts), reverse=True):
        directory = destination_root / relative
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    manifest_path.write_text(json.dumps({"version": 1, "files": desired}) + "\n", encoding="utf-8")
    return {"routes": routes, "albums": len(catalog["albums"]), "photos": sum(len(album["photos"]) for album in catalog["albums"])}
