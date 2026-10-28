"""Build the personal home, projects, about, games and articles into one Pages directory."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit
from xml.etree import ElementTree as ET
from datetime import datetime
import argparse
import json
import ipaddress
import re
import shutil

from PIL import Image

from build_blog import Blog, ROOT
from photo_pages import build_photos, validate_catalog as validate_photo_catalog, _safe_path as safe_photo_path
from map_pages import load_map, build_map
from anthology_pages import load_anthology, load_glossary, build_anthology
from site_i18n import localize_page, localized_path, load_catalogues, check_site_languages
from news_snapshot import load_sources, load_snapshot, render_snapshot
from history_today import load_history, render_history
from daily_brief import load_daily, load_brief_extras, safe_json, render_brief_bottom, CHINA

OUTPUT = ROOT / "_site_unified"
GAME_PAGES = (("game.template.html", "game"), ("ranking.template.html", "game/ranking"))
GAME_ASSETS = ("game.css", "ranking-skins.css", "ranking.js", "ranking-model.js", "ranking-storage.js", "ranking-export.js", "ranking-images.js", "ranking-view.js")
GAME_FOOD_ASSETS = ("hotpot.webp", "noodles.webp", "dumpling.webp", "burger.webp", "watermelon.webp",
                    "chicken.webp", "sushi.webp", "pizza.webp", "cake.webp", "tea.webp",
                    "mianyang-rice-noodles.webp", "jiaxing-zongzi.webp", "houttuynia.webp", "frozen-dumplings.webp",
                    "douzhi.webp", "durian.webp", "loofah-noodles.webp", "mooncake.webp",
                    "pea-mince-noodles.webp", "handmade-dumplings.webp",
                    "japanese-ramen.webp", "egg-noodles.webp", "bak-kut-teh.webp", "dongpo-pork.webp",
                    "sea-intestine-rice.webp", "eight-treasure-tofu.webp", "vietnamese-chicken-noodles.webp",
                    "pad-krapow-rice.webp", "egg-tart.webp", "barbecue.webp", "lamb-shumai.webp",
                    "zhejiang-dry-noodles.webp", "bread.webp", "lanzhou-noodles.webp",
                    "beijing-zhajiang-noodles.webp", "west-lake-vinegar-fish.webp",
                    "sichuan-hotpot.webp", "donkey-burger.webp", "smoked-pork-flatbread.webp")
GAME_SPORT_ASSETS = ("walking.webp", "hiking.webp", "running.webp", "weight-training.webp",
                     "swimming.webp", "badminton.webp", "cycling.webp", "football.webp",
                     "tennis.webp", "table-tennis.webp", "combat-training.webp", "tree-climbing.webp",
                     "skydiving.webp", "rock-climbing.webp", "diving.webp", "golf.webp", "gaming.webp")

PROJECT_FIELDS = {"id", "title", "english_title", "kind", "summary", "problem", "features",
                  "contribution", "usage", "license", "screenshot", "screenshot_alt", "screenshot_caption", "source_url", "guide_url"}
PROJECT_OPTIONAL_FIELDS = {"download_url", "download_label", "guide_label", "link_status", "demo_url"}
PROJECT_DEMO_ROUTES = {"/map/", "/game/ranking/"}
BRAND_ASSETS = ("share-cover.png", "favicon.svg", "favicon.ico", "favicon.png")
HOME_DAILY_ASSETS = ("home-daily.css", "home-daily.js", "daily-reading.js", "weather-map.js", "weather-map.css", "home-earth.js", "astronomy-solar.js", "home-ink.webp",
                     "vendor/d3-7.9.0.min.js", "vendor/D3-LICENSE",
                     "vendor/lunar-javascript-1.7.7.js", "vendor/lunar-javascript-1.7.7.LICENSE")
HOME_PHOTO = "/photos/images/p-71f77ab6511ec1ce656a58a3-18000666287e1d55-640.webp"
TODAY_TITLES = {"zh-CN": "今天 · 谢雨卿", "en": "Today · Xie Yuqing"}
TODAY_DESCRIPTIONS = {
    "zh-CN": "从此刻地球与天气，到历史、每日阅读和重点新闻。",
    "en": "Earth and weather, historical anniversaries, daily reading and source headlines.",
}
ABOUT_FIELDS = {"name", "english_name", "chinese_bio", "english_bio", "chinese_colophon", "english_colophon",
                "written_note", "english_written_note", "wechat", "email", "zhihu", "x_handle"}
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)
EXTERNAL_ICON = '''<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>'''


def project_url(value):
    if not isinstance(value, str) or not value or any(c.isspace() for c in value) or "\\" in value:
        raise ValueError("Project links must be public HTTPS URLs.")
    parts = urlsplit(value)
    hostname = parts.hostname
    if (parts.scheme != "https" or not hostname or parts.username or parts.password
            or parts.query or hostname == "localhost"
            or hostname.endswith((".localhost", ".local", ".internal"))):
        raise ValueError("Project links must be public HTTPS URLs without credentials or query tokens.")
    try:
        numeric_address = ipaddress.ip_address(hostname)
    except ValueError:
        numeric_address = None
    if numeric_address is not None and not numeric_address.is_global:
        raise ValueError("Private network links cannot be published as project links.")
    if parts.port not in {None, 443}:
        raise ValueError("Project links must use the standard public HTTPS port.")
    return value


def validate_projects(data):
    if not isinstance(data, dict) or set(data) != {"projects"}:
        raise ValueError("home/projects.json must contain only a projects list.")
    projects = data["projects"]
    if not isinstance(projects, list) or not 1 <= len(projects) <= 100:
        raise ValueError("Keep between 1 and 100 public project entries.")
    seen = set()
    for item in projects:
        required = (PROJECT_FIELDS - {"source_url", "guide_url"}
                    if isinstance(item, dict) and item.get("link_status") == "pending" else PROJECT_FIELDS)
        if (not isinstance(item, dict) or not required.issubset(item)
                or set(item) - PROJECT_FIELDS - PROJECT_OPTIONAL_FIELDS):
            raise ValueError("Project fields are incomplete or contain unsupported private metadata.")
        status = item.get("link_status", "published")
        if not isinstance(status, str) or status not in {"pending", "published"}:
            raise ValueError("Project link status must be pending or published.")
        if status == "pending" and any(name in item for name in ("source_url", "guide_url", "guide_label", "download_url", "download_label", "demo_url")):
            raise ValueError("Pending projects must not contain unconfirmed publication links.")
        if "download_label" in item and "download_url" not in item:
            raise ValueError("A download label requires a confirmed download URL.")
        for name, value in item.items():
            if (not isinstance(value, str) or not value.strip() or len(value) > 2000
                    or (name not in {"source_url", "guide_url", "download_url"} and PRIVATE_PATH.search(value)) or any(ord(c) < 32 for c in value)):
                raise ValueError(f"Invalid public project field: {name}.")
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", item["id"]) or item["id"] in seen:
            raise ValueError("Project IDs must be unique lowercase slugs.")
        seen.add(item["id"])
        if not re.fullmatch(r"/assets/projects/[a-z][a-z0-9-]*\.webp", item["screenshot"]):
            raise ValueError("Project screenshots must use an explicit local WebP asset.")
        if "demo_url" in item and item["demo_url"] not in PROJECT_DEMO_ROUTES:
            raise ValueError("Project browser demos must use a confirmed site route.")
        for name in ("source_url", "guide_url", "download_url"):
            if name in item:
                project_url(item[name])
    return projects


def load_projects():
    source = ROOT / "home/projects.json"
    if source.is_symlink():
        raise ValueError("Project data symlinks are not supported.")
    return validate_projects(json.loads(source.read_text(encoding="utf-8")))


def validate_about(data):
    if not isinstance(data, dict) or set(data) != ABOUT_FIELDS:
        raise ValueError("home/about.json must contain only the public biography fields.")
    list_fields = {"chinese_bio", "english_bio", "chinese_colophon", "english_colophon"}
    for field in list_fields:
        paragraphs = data[field]
        maximum = 2 if field.endswith("colophon") else 20
        if not isinstance(paragraphs, list) or not 1 <= len(paragraphs) <= maximum:
            raise ValueError(f"The {field} needs a short list of paragraphs.")
    values = [(key, value) for key, value in data.items() if key not in list_fields]
    values += [(field, value) for field in list_fields for value in data[field]]
    optional_notes = {"written_note", "english_written_note"}
    if any(not isinstance(value, str) or (not value.strip() and key not in optional_notes) or len(value) > 2000
           or PRIVATE_PATH.search(value) or any(ord(c) < 32 for c in value) for key, value in values):
        raise ValueError("Invalid public biography text.")
    if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", data["email"]):
        raise ValueError("The contact email must be a plain public email address.")
    if len(data["zhihu"]) > 80 or any(character in data["zhihu"] for character in "<>"):
        raise ValueError("The Zhihu display name must be short public plain text.")
    if not re.fullmatch(r"[A-Za-z0-9_]{1,15}", data["x_handle"]):
        raise ValueError("The X account must be a plain public handle.")
    return data


def load_about():
    source = ROOT / "home/about.json"
    if source.is_symlink():
        raise ValueError("Biography data symlinks are not supported.")
    return validate_about(json.loads(source.read_text(encoding="utf-8")))


def render_about(data, language="zh-CN"):
    data = validate_about(data)
    if language not in {"zh-CN", "en"}:
        raise ValueError("Biography language must be zh-CN or en.")
    english = language == "en"
    text = {key: escape(value, quote=True) for key, value in data.items() if isinstance(value, str)}
    paragraphs = "\n".join(f'<p>{escape(value, quote=True)}</p>' for value in data["english_bio" if english else "chinese_bio"])
    colophon = "".join(f'<p>{escape(value, quote=True)}</p>' for value in data["english_colophon" if english else "chinese_colophon"])
    written = text["english_written_note" if english else "written_note"]
    written_note = f'<hr><p class="about-written-note">{written}</p>' if written.strip() else ""
    if english:
        contact = f'''<h2 id="about-contact-title">Get in touch</h2>
    <dl><dt>WeChat official account</dt><dd><span lang="zh-CN">{text["wechat"]}</span>
      <figure class="about-wechat-qr"><a href="/assets/wechat-qrcode.jpg" aria-label="View the original WeChat QR code"><img src="/assets/wechat-qrcode.jpg" width="180" height="180" style="max-width:100%;height:auto" alt="Official QR code for the WeChat account" loading="lazy" decoding="async"></a>
        <figcaption><a href="/assets/wechat-qrcode.jpg">View original QR code</a><br>On a computer, scan with WeChat. On a phone, save the image and recognise its QR code in WeChat.</figcaption>
      </figure>
    </dd><dt>Email</dt><dd><a href="mailto:{text["email"]}">{text["email"]}</a></dd>
    <dt>Zhihu</dt><dd><span lang="zh-CN">@{text["zhihu"]}</span></dd>
    <dt>X</dt><dd><a href="https://x.com/{text["x_handle"]}" target="_blank" rel="noopener noreferrer">@{text["x_handle"]}</a></dd></dl>'''
    else:
        contact = f'''<h2 id="about-contact-title">联系我</h2>
    <dl><dt>微信公众号</dt><dd>{text["wechat"]}
      <figure class="about-wechat-qr">
        <a href="/assets/wechat-qrcode.jpg" aria-label="查看{text["wechat"]}公众号二维码原图"><img src="/assets/wechat-qrcode.jpg" width="180" height="180" style="max-width:100%;height:auto" alt="{text["wechat"]}公众号官方二维码" loading="lazy" decoding="async"></a>
        <figcaption><a href="/assets/wechat-qrcode.jpg">查看二维码原图</a><br>电脑端请用微信扫码；手机端可保存图片后，在微信中识别二维码。</figcaption>
      </figure>
    </dd><dt>邮箱</dt><dd><a href="mailto:{text["email"]}">{text["email"]}</a></dd>
    <dt>知乎</dt><dd>@{text["zhihu"]}</dd>
    <dt>X</dt><dd><a href="https://x.com/{text["x_handle"]}" target="_blank" rel="noopener noreferrer">@{text["x_handle"]}</a></dd></dl>'''
    return f'''<article class="about-profile" aria-labelledby="about-page-title">
  <div class="about-story">
    <div class="about-bio" lang="{language}">{paragraphs}</div>
    <div class="about-colophon">{colophon}</div>
    {written_note}
  </div>
  <section class="about-contact" aria-labelledby="about-contact-title">{contact}</section>
</article>'''


def render_site_notes(waline, repository, language="zh-CN"):
    """Technical and privacy notes, gathered on /about/#site instead of scattered across pages."""
    host = escape(waline.get("hostingProvider", ""))
    database = escape(waline.get("databaseProvider", ""))
    if language == "en":
        items = ['Pages are generated with Python and use system fonts only, with no external font files.',
                 'The Today page presents Earth, weather, history, reading and news, in that order. The calendar and globe are calculated live; historical events and reading rotate from local collections using Beijing time. Historical entries link to their sources, with selection and review coverage explained on the Today page. The homepage shows only the date, solar term and a small globe.',
                 'Weather comes from Open-Meteo. City searches send the name you enter to its geocoding service; choosing a point on the map sends its coordinates for weather. The page never requests your device location, and saves your selected city or coordinates and the latest weather only in your browser. The homepage makes no weather request.',
                 'News follows source newsroom selections and preset rules, with original headlines, publication times and links. Chinese quotations from Marx, Engels, Lenin and Mao quote the Chinese Marxists Internet Archive texts; English quotations use independent English texts. Edition notes explicitly label the permitted AI translations of some Lei Feng English and Che Guevara Chinese entries. Other sources include the Lei Feng Memorial Hall and published translations of How the Steel Was Tempered. The reading collections are stored locally; browsing them makes no automatic request to the sources.',
                 'Article view counts and comments use Waline. These requests send your IP address and browser information to the Waline backend and its providers'
                 + (f' (hosting: {host}; database: {database})' if host and database else '') + '. The comment area explains what is shown publicly.',
                 'Map geography comes from Natural Earth (public domain). Project screenshots and other third-party sources are credited in each project.']
        title = "About this site"
    else:
        items = ['页面用 Python 生成。全站使用设备自带的字体，不加载外部字体文件。',
                 '「今天」页依次展示地球、天气、历史、阅读和新闻。日历和地球实时计算，历史事件与阅读内容从本地资料库按北京时间轮换。历史条目附具体出处，编选与核查范围见今天页资料说明。首页只放日期、节气和一个小地球。',
                 '天气来自 Open-Meteo；搜索城市会向其地名服务发送输入的城市名，地图选点会发送所选坐标以查询天气，不读取设备定位。页面仅在浏览器里保存所选城市或坐标及最近一次天气。首页不请求天气。',
                 '新闻按来源媒体选题和预设规则自动汇集，保留原题、原文发布时间与链接。马克思主义名句中，马恩列毛中文直接采用马克思主义者网（中马库）中文原文，英文分别采用英文文本；部分雷锋英文和切·格瓦拉中文按保留规则使用本站AI译文，并在版本说明中明确标注。其他来源包括雷锋纪念馆日记与《钢铁是怎样炼成的》出版译本。阅读资料随本站保存，浏览和换句时不自动请求来源网站。',
                 '文章的浏览量和留言由 Waline 提供：相关请求会把 IP 和浏览器信息发送给 Waline 后端及其托管商'
                 + (f'（服务托管：{host}；数据库：{database}）' if host and database else '') + '。留言区另有说明。',
                 '足迹地图的底图来自 Natural Earth（公有领域）；作品截图与其他第三方来源见各项目说明。']
        title = "关于本站"
    if not waline.get("enabled"):
        items = [item for item in items if "Waline" not in item]
    lis = "".join(f"<li>{item}</li>" for item in items)
    return f'<section class="about-site" id="site" aria-labelledby="site-title"><h2 id="site-title">{title}</h2><ul>{lis}</ul></section>'


def project_asset_sources(projects):
    """Only copy reviewed screenshots, never a tool's private exports or asset folder."""
    sources = []
    folder = ROOT / "home/assets/projects"
    for parent in (ROOT / "home", ROOT / "home/assets", folder):
        if linked_directory(parent):
            raise ValueError("Project screenshot directory links are not supported.")
    for item in projects:
        source = folder / Path(item["screenshot"]).name
        if linked_directory(source) or not source.is_file():
            raise ValueError(f"Missing or linked project screenshot: {source.name}")
        with Image.open(source) as image:
            if image.format != "WEBP" or min(image.size) < 200:
                raise ValueError(f"Project screenshot must be a readable WebP: {source.name}")
        sources.append(source)
    return sources


def render_projects(projects, language="zh-CN"):
    projects = validate_projects({"projects": projects})
    cards = []
    for item in projects:
        text = {name: escape(value, quote=True) for name, value in item.items()}
        if "demo_url" in text:
            text["demo_url"] = localized_path(text["demo_url"], language)
        with Image.open(ROOT / "home" / item["screenshot"].lstrip("/")) as image:
            width, height = image.size
        labels = {"解决的问题": "Problem", "主要功能": "Features", "实际贡献": "My contribution", "来源与许可": "Sources & licensing"}
        facts = "".join(f'<div><dt>{escape(labels[label] if language == "en" else label)}</dt><dd>{text[name]}</dd></div>' for label, name in (
            ("解决的问题", "problem"), ("主要功能", "features"),
            ("实际贡献", "contribution"), ("来源与许可", "license")))
        download_label = text.get("download_label", "下载工作流")
        guide_label = text.get("guide_label", "下载与使用说明")
        download = (f'<a class="project-guide" href="{text["download_url"]}">{download_label}</a>'
                    if "download_url" in text else "")
        demo = (f'<a class="project-demo" href="{text["demo_url"]}">打开体验 <span aria-hidden="true">→</span></a>'
                if "demo_url" in text else "")
        actions = ('<span class="project-pending">发布链接待确认</span>'
                   if item.get("link_status") == "pending" else
                   demo + f'<a class="project-source" href="{text["source_url"]}">查看 GitHub {EXTERNAL_ICON}</a>'
                   f'<a class="project-guide" href="{text["guide_url"]}">{guide_label}</a>{download}')
        cards.append(f'''<article class="project-card" aria-labelledby="project-{text["id"]}">
  <figure class="project-visual"><img src="{text["screenshot"]}" width="{width}" height="{height}" alt="{text["screenshot_alt"]}" loading="lazy" decoding="async"><figcaption>{text["screenshot_caption"]}</figcaption></figure>
  <div class="project-body">
    <p class="project-kind">{text["kind"]}</p>
    <h2 id="project-{text["id"]}">{text["title"]}{'' if language == 'en' else '<span class="project-english" lang="en">' + text['english_title'] + '</span>'}</h2>
    <p class="project-summary">{text["summary"]}</p>
    <div class="project-usage"><strong>从这里开始</strong><p>{text["usage"]}</p></div>
    <details class="project-details"><summary>功能、贡献与来源</summary><dl class="project-facts">{facts}</dl></details>
    <div class="project-actions">{actions}</div>
  </div>
</article>''')
    result = "\n".join(cards)
    if language == "en":
        for chinese, english in {"从这里开始": "Start here", "功能、贡献与来源": "Features, contribution & sources",
                                  "发布链接待确认": "Publication link pending", "打开体验": "Open tool",
                                  "查看 GitHub": "View GitHub", "下载工作流": "Download workflow", "下载与使用说明": "Download & usage guide"}.items():
            result = result.replace(chinese, english)
    return result


def home_articles(blog, language="zh-CN"):
    """Use the same real article selection for recent writing and random links."""
    from english_site import english_article_url
    originals = sorted(blog.articles, key=lambda item: (item.published or "", item.destination), reverse=True)
    for original in originals:
        article = original
        url = blog.href(article.destination)
        if language == "en":
            article = blog.translations.get(original.source.relative_to(blog.source_root).as_posix(), original)
            if article.language != "en":
                continue
            if article.original:
                url = english_article_url(blog, original)
        elif article.language != "zh-CN":
            continue
        yield original, article, url


def home_article_links(blog, language="zh-CN"):
    return safe_json([url for _, _, url in home_articles(blog, language)])


def load_home_photos():
    """Read only the same validated public photo catalog used by photo_pages."""
    path = ROOT / "photos/catalog.json"
    safe_photo_path(ROOT, path)
    return (validate_photo_catalog(json.loads(path.read_text(encoding="utf-8")))
            if path.is_file() else {"version": 1, "albums": []})


def render_home_photos(catalog, language="zh-CN", limit=6):
    catalog = validate_photo_catalog(catalog)
    photos = [(photo, album) for album in catalog["albums"] for photo in album["photos"]]
    photos.sort(key=lambda pair: (pair[0]["date"] or pair[1]["date"], pair[0]["time"], pair[0]["id"]), reverse=True)
    if not photos:
        return ""
    catalogue = load_catalogues(ROOT, ("photos",))[language]
    cards, seen = [], set()
    for photo, album in photos:
        if photo["id"] in seen:
            continue
        seen.add(photo["id"])
        prefix = "photos.photo." + photo["id"]
        location = catalogue.get(prefix + ".location", photo["location"]) or catalogue.get("photos.album." + album["id"] + ".location", album["location"])
        stamp = photo["date"] or catalogue.get(prefix + ".date_text", photo["date_text"]) or album["date"]
        alt = catalogue.get(prefix + ".alt", photo["title"] or location or photo["caption"])
        url = localized_path("/photos/" + album["id"] + "/", language)
        caption = " · ".join(value for value in (location, stamp) if value)
        cards.append(f'<figure class="home-photo-card"><a href="{escape(url, quote=True)}"><img src="{escape(photo["thumbnail"], quote=True)}" width="{photo["thumbnail_width"]}" height="{photo["thumbnail_height"]}" alt="{escape(alt, quote=True)}" loading="lazy" decoding="async"></a><figcaption>{escape(caption)}</figcaption></figure>')
        if len(cards) == limit:
            break
    return "\n".join(cards)


def render_home_avatar(language="zh-CN"):
    source = ROOT / "home/assets/avatar-line.svg"
    label = "Line drawing of Xie Yuqing" if language == "en" else "谢雨卿的简笔头像"
    if linked_directory(source):
        raise ValueError("Homepage avatar links are not supported.")
    modifier, text = ("home-avatar-line", "") if source.is_file() else ("home-avatar-placeholder", "谢")
    return f'<span class="home-avatar {modifier}" role="img" aria-label="{label}">{text}</span>'


def render_home_recent(blog, language="zh-CN", limit=5):
    """List actual writing by original publication date, with direct article links."""
    from english_site import TOPICS
    rows = []
    for original, article, url in home_articles(blog, language):
        topic = blog.topic(article) if article.language == "zh-CN" or article.original else "English"
        if language == "en":
            topic = TOPICS.get(topic, topic)
        published = (f'<time datetime="{escape(original.published, quote=True)}">{escape(original.published.replace("-", "."))}</time>'
                     if original.published else '<span class="yl-date">' + ("Date unconfirmed" if language == "en" else "发表时间待确认") + '</span>')
        excerpt = blog.excerpt(article)
        if len(excerpt) > 100:
            excerpt = excerpt[:100].rstrip() + "…"
        rows.append(f'<li>{published}<div><h3 lang="{escape(article.language, quote=True)}"><a href="{escape(url, quote=True)}">{escape(article.title)}</a></h3><p lang="{escape(article.language, quote=True)}">{escape(excerpt)}</p></div><span class="yl-article-topic">{escape(topic)}</span></li>')
        if len(rows) == limit:
            break
    return "\n".join(rows)


def render_home_projects(projects, language="zh-CN"):
    """Two usable browser tools, without changing the full projects catalogue."""
    by_id = {item["id"]: item for item in projects}
    if language == "en":
        source = ROOT / "home/en/projects.json"
        if linked_directory(source) or linked_directory(source.parent):
            raise ValueError("English project data links are not supported.")
        translated = json.loads(source.read_text(encoding="utf-8"))["projects"]
        for item in translated:
            if item["id"] in by_id:
                by_id[item["id"]] = {**by_id[item["id"]], **item}
    cards = []
    for project_id in ("footprints-map", "tier-ranking"):
        item = validate_projects({"projects": [by_id[project_id]]})[0]
        text = {name: escape(value, quote=True) for name, value in item.items()}
        url = escape(localized_path(item["demo_url"], language), quote=True)
        with Image.open(ROOT / "home" / item["screenshot"].lstrip("/")) as image:
            width, height = image.size
        label = "Open tool →" if language == "en" else "打开体验 →"
        cards.append(f'<article class="yl-project"><a href="{url}" aria-label="{text["title"]}"><img src="{text["screenshot"]}" width="{width}" height="{height}" alt="{text["screenshot_alt"]}" loading="lazy" decoding="async"></a><div><h3><a href="{url}">{text["title"]}</a></h3><p>{text["summary"]}</p><a class="yl-link" href="{url}">{label}</a></div></article>')
    return "\n".join(cards)


def daily_asset_sources():
    folder = ROOT / "home/assets"
    if any(linked_directory(path) for path in (ROOT / "home", folder, folder / "vendor")):
        raise ValueError("Daily homepage asset directory links are not supported.")
    sources = []
    for name in HOME_DAILY_ASSETS:
        source = folder / name
        if linked_directory(source) or not source.is_file():
            raise ValueError(f"Missing or linked daily homepage asset: {name}")
        sources.append((name, source))
    return sources


def copy_daily_assets(sources, brief, content, extras):
    folder = OUTPUT / "assets"
    vendor = folder / "vendor"
    if linked_directory(folder) or linked_directory(vendor):
        raise ValueError("Generated daily homepage directory links are not supported.")
    folder.mkdir(exist_ok=True)
    vendor.mkdir(exist_ok=True)
    for name, source in sources:
        destination = folder / name
        if linked_directory(destination) or (destination.exists() and not destination.is_file()):
            raise ValueError("Generated daily homepage assets must be regular files.")
        shutil.copy2(source, destination)
    for name in ("history-sources.md", "quotes-sources.md"):
        source = ROOT / "home/brief" / name
        destination = folder / name
        if linked_directory(source) or linked_directory(destination) or not source.is_file():
            raise ValueError("Reading source notes must be regular public files.")
        shutil.copy2(source, destination)
    datasets = [("daily-brief.json", brief), ("daily-content.json", content)]
    datasets += [("brief-" + key + ".json", value) for key, value in extras.items()]
    for name, data in datasets:
        destination = folder / name
        if linked_directory(destination) or (destination.exists() and not destination.is_file()):
            raise ValueError("Generated daily content must be regular files.")
        destination.write_text(safe_json(data) + "\n", encoding="utf-8")

    if extras["holidays"]["years"]:
        destination = folder / "brief-holidays.LICENSE"
        if linked_directory(destination) or (destination.exists() and not destination.is_file()):
            raise ValueError("Generated holiday license must be a regular file.")
        shutil.copy2(ROOT / "home/brief/holidays/LICENSE", destination)


def site_root(address):
    parts = urlsplit(address)
    if (parts.scheme != "https" or not parts.netloc or parts.path not in {"", "/"}
            or parts.query or parts.fragment or parts.username or parts.password):
        raise ValueError("Unified Pages needs a root HTTPS URL; a project /articles base would duplicate the path.")
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


def default_root():
    config = json.loads((ROOT / "blog/config.json").read_text(encoding="utf-8"))
    parts = urlsplit(config["site_url"])
    return site_root(urlunsplit((parts.scheme, parts.netloc, "", "", "")))


class Elements(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.elements = []; self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


def check_site(address):
    address = site_root(address)
    pages = {p.resolve(): Elements(p.read_text(encoding="utf-8")) for p in OUTPUT.rglob("*.html")}
    links = fragments = images = 0
    for p, page in pages.items():
        ids = [a["id"] for _, a in page.elements if "id" in a]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate IDs: {p}")
        for tag, attrs in page.elements:
            images += tag == "img"
            references = [attrs[key] for key in ("href", "src") if attrs.get(key)]
            if attrs.get("srcset"):
                for candidate in attrs["srcset"].split(","):
                    match = re.fullmatch(r"\s*(\S+)\s+([1-9]\d*)w\s*", candidate)
                    if not match:
                        raise ValueError(f"Invalid generated image srcset in {p}.")
                    references.append(match.group(1))
            for reference in references:
                parsed = urlsplit(reference)
                if parsed.netloc and parsed.netloc != urlsplit(address).netloc: continue
                if parsed.scheme and parsed.scheme not in {"http", "https"}: continue
                if "/articles/articles/" in parsed.path:
                    raise ValueError(f"Duplicated article prefix: {reference}")
                target = (OUTPUT / unquote(parsed.path).lstrip("/")).resolve() if parsed.path.startswith("/") else (p.parent / unquote(parsed.path)).resolve() if parsed.path else p
                if target.is_dir(): target /= "index.html"
                if not target.is_relative_to(OUTPUT.resolve()) or not target.is_file():
                    raise ValueError(f"Broken or outside-publication link in {p}: {reference}")
                links += 1
                if parsed.fragment and target.suffix == ".html":
                    targets = {a["id"] for _, a in pages[target.resolve()].elements if "id" in a}
                    if unquote(parsed.fragment) not in targets:
                        raise ValueError(f"Missing anchor in {p}: {reference}")
                    fragments += 1
    return {"success": True, "pages": len(pages), "local_links": links,
            "valid_fragments": fragments, "image_references": images,
            "site_root": address + "/", "article_root": address + "/articles/"}


def check_publication_metadata(address):
    """Validate the requested origin and actual targets, rather than skipping foreign canonicals."""
    address = site_root(address)
    expected_origin = urlsplit(address).netloc

    def target_for(url):
        parsed = urlsplit(url or "")
        if (parsed.scheme != "https" or parsed.netloc != expected_origin or parsed.username
                or parsed.password or parsed.query or parsed.fragment):
            raise ValueError(f"Publication metadata must use the requested site domain: {url}")
        target = (OUTPUT / unquote(parsed.path).lstrip("/")).resolve()
        if target.is_dir(): target /= "index.html"
        if not target.is_relative_to(OUTPUT.resolve()) or not target.is_file():
            raise ValueError(f"Metadata target is missing or outside publication: {url}")
        return target

    canonicals = set()
    article_canonicals = set()
    compatibility_redirects = 0
    pages = list(OUTPUT.rglob("*.html"))
    if not pages:
        raise ValueError("Build the unified site before checking publication metadata.")
    for page in pages:
        elements = Elements(page.read_text(encoding="utf-8")).elements
        canonical = [attrs.get("href") for tag, attrs in elements
                     if tag == "link" and attrs.get("rel") == "canonical"]
        og = [attrs.get("content") for tag, attrs in elements
              if tag == "meta" and attrs.get("property") == "og:url"]
        if len(canonical) != 1 or len(og) != 1 or canonical != og:
            raise ValueError(f"Each page needs one matching canonical and OG URL: {page}")
        if page.resolve() == (OUTPUT / "articles/about.html").resolve():
            robots = [attrs.get("content", "").lower().replace(" ", "") for tag, attrs in elements
                      if tag == "meta" and attrs.get("name", "").lower() == "robots"]
            refresh = [attrs.get("content", "") for tag, attrs in elements
                       if tag == "meta" and attrs.get("http-equiv", "").lower() == "refresh"]
            manual = any(tag == "a" and attrs.get("href") == "/about/" for tag, attrs in elements)
            if (canonical[0] != address + "/about/" or target_for(canonical[0]) != (OUTPUT / "about/index.html").resolve()
                    or robots != ["noindex,follow"] or refresh != ["0; url=/about/"] or not manual):
                raise ValueError("The legacy about page must be a noindex redirect to /about/.")
            compatibility_redirects += 1
            continue
        if target_for(canonical[0]) != page.resolve():
            raise ValueError(f"Canonical points to a different page: {page}")
        if canonical[0] in canonicals:
            raise ValueError("Two publication pages claim the same canonical URL.")
        canonicals.add(canonical[0])
        if page.is_relative_to(OUTPUT / "articles"):
            article_canonicals.add(canonical[0])

    def sitemap_urls(path, expected):
        urls = [node.text for node in ET.parse(path).findall(".//{*}loc")]
        if len(urls) != len(set(urls)) or set(urls) != expected:
            raise ValueError(f"Sitemap must contain each generated canonical exactly once: {path}")
        for url in urls: target_for(url)
        return len(urls)

    total = sitemap_urls(OUTPUT / "sitemap.xml", canonicals)
    sitemap_urls(OUTPUT / "articles/sitemap.xml", article_canonicals)
    rss = ET.parse(OUTPUT / "articles/feed.xml")
    if rss.findtext("./channel/link") != address + "/articles/":
        raise ValueError("RSS channel must use the requested article root.")
    seen = set()
    for item in rss.findall("./channel/item"):
        link = item.findtext("link")
        if link != item.findtext("guid") or link not in article_canonicals or link in seen:
            raise ValueError("RSS item links and GUIDs must match unique article canonicals.")
        target_for(link)
        seen.add(link)
    robots = (OUTPUT / "robots.txt").read_text(encoding="utf-8")
    if robots.count("Sitemap: " + address + "/sitemap.xml") != 1:
        raise ValueError("robots.txt must reference the requested root sitemap.")
    report = {"success": True, "canonical_pages": len(canonicals), "sitemap_urls": total,
            "rss_items": len(seen), "domain": expected_origin}
    if compatibility_redirects:
        report["compatibility_redirects"] = compatibility_redirects
    return report


def linked_directory(path):
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def game_photo_sources(directory, names, label):
    """Validate a fixed local photo set without writing generated publication files."""
    relative = "home/assets/" + directory
    folder = ROOT / relative
    for parent in (ROOT / "home", ROOT / "home/assets", folder):
        if linked_directory(parent):
            raise ValueError(f"Game {label} asset directory symlinks or junctions are not supported: {parent.relative_to(ROOT).as_posix()}")
    sources = []
    for name in names:
        source = folder / name
        if source.is_symlink():
            raise ValueError(f"Game {label} asset symlinks are not supported: {relative}/{name}")
        if not source.is_file():
            raise ValueError(f"Missing required game {label} photo: {relative}/{name}")
        sources.append(source)
    return sources


def game_food_sources():
    return game_photo_sources("foods", GAME_FOOD_ASSETS, "food")


def game_sport_sources():
    return game_photo_sources("sports", GAME_SPORT_ASSETS, "sport")


def copy_game_photo_assets(photo_sets):
    if linked_directory(OUTPUT / "assets"):
        raise ValueError("Generated game asset directory symlinks or junctions are not supported.")
    for directory, label, sources in photo_sets:
        photo_output = OUTPUT / "assets" / directory
        if linked_directory(photo_output):
            raise ValueError(f"Generated game {label} asset directory symlinks or junctions are not supported.")
        photo_output.mkdir(exist_ok=True)
        for source in sources:
            destination = photo_output / source.name
            if linked_directory(destination):
                raise ValueError(f"Generated game {label} asset symlinks or junctions are not supported: {source.name}")
            if destination.exists() and not destination.is_file():
                raise ValueError(f"Generated game {label} photo destination must be a regular file: {source.name}")
            shutil.copy2(source, destination)


def build_site(address, map_preview_source=None):
    address = site_root(address)
    projects = load_projects()
    about_data = load_about()
    home_photos = load_home_photos()
    brief_data, daily_content = load_daily(ROOT, linked_directory)
    brief_extras = load_brief_extras(ROOT, linked_directory)
    daily_sources = daily_asset_sources()
    # Every template's complete photo set must pass before any output is generated.
    photo_sets = (("foods", "food", game_food_sources()), ("sports", "sport", game_sport_sources()))
    news_sources = load_sources(ROOT)
    news_snapshot = load_snapshot(ROOT)
    history_data = load_history(ROOT, linked_directory)
    brief_extras["history"] = history_data
    project_sources = project_asset_sources(projects)
    map_data = load_map(ROOT, map_preview_source)
    anthology_works = load_anthology(ROOT)  # Validate reviewed content before writing outputs.
    load_glossary(ROOT, anthology_works)
    expected_output = "_site_map_preview" if map_preview_source else "_site_unified"
    if OUTPUT.is_symlink() or OUTPUT.resolve() != ROOT.resolve() / expected_output:
        raise ValueError("Unsafe unified output path.")
    if linked_directory(OUTPUT / "assets"):
        raise ValueError("Generated game asset directory symlinks or junctions are not supported.")
    if OUTPUT.exists() and any(OUTPUT.iterdir()) and not (OUTPUT / ".generated-by-unified-site").is_file():
        raise ValueError("Keep the existing unrecognized output directory intact.")
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT / ".generated-by-unified-site").write_text("Generated unified website.\n", encoding="utf-8")
    photo_report = build_photos(ROOT, OUTPUT, address, allow_local_map_preview=bool(map_preview_source), language="zh-CN")
    map_report = build_map(ROOT, OUTPUT, address, map_data, preview=bool(map_preview_source), language="zh-CN")
    blog = Blog(address + "/articles", output=OUTPUT / "articles")
    # Keep the legacy _site and every pre-existing file; CI starts from a clean checkout.
    blog.build(clean=False)
    home = (ROOT / "home/index.template.html").read_text(encoding="utf-8")
    recent = []
    for article in blog.articles[:3]:
        published = (f'<time datetime="{escape(article.published)}">{escape(article.published)}</time>'
                     if article.published else '<time>发表时间待确认</time>')
        topic = blog.topic(article) if article.language == "zh-CN" else "English"
        recent.append(f'        <li><div class="article-meta">{published}<span>{escape(topic)}</span></div><h3 lang="{article.language}"><a href="{escape(blog.href(article.destination))}">{escape(article.title)}{EXTERNAL_ICON}</a></h3></li>')
    values = {"article_total": str(len(blog.articles)), "chinese_total": str(sum(a.language == "zh-CN" for a in blog.articles)),
              "english_total": str(sum(a.language != "zh-CN" for a in blog.articles)), "recent_articles": "\n".join(recent), "site_url": escape(address, quote=True),
              "project_total": str(len(projects)), "anthology_total": str(len(anthology_works)),
              "photo_album_total": str(photo_report["albums"]),
              "photo_total": str(photo_report["photos"])}
    has_home_photo = (ROOT / HOME_PHOTO.lstrip("/")).is_file()
    beijing_today = datetime.now(CHINA).date()
    values.update({
        "today_date_title": f"{beijing_today.year}年{beijing_today.month}月{beijing_today.day}日",
        "today_date_title_en": f"{beijing_today.day} {beijing_today.strftime('%B')} {beijing_today.year}",
        "news_snapshot_data": safe_json(news_snapshot),
        "news_sources_data": safe_json({"sources": [{"name": item["name"], "home_url": item["home_url"]} for item in news_sources["sources"]]}),
        "news_snapshot_feed": render_snapshot(news_snapshot, "zh-CN", news_sources, include_sources=False, include_stamp=False),
        "news_snapshot_feed_en": render_snapshot(news_snapshot, "en", news_sources, include_sources=False, include_stamp=False),
        "news_checked_label": escape("最近检查：" + datetime.fromisoformat(news_snapshot["collected_at"].replace("Z", "+00:00")).astimezone(CHINA).strftime("%Y-%m-%d %H:%M · 北京时间") if news_snapshot["collected_at"] else "等待首次自动更新"),
        "news_checked_label_en": escape("Last checked: " + datetime.fromisoformat(news_snapshot["collected_at"].replace("Z", "+00:00")).astimezone(CHINA).strftime("%Y-%m-%d %H:%M · Beijing time") if news_snapshot["collected_at"] else "Awaiting the first automatic update"),
        "news_source_links": " ".join('<a href="' + escape(item["home_url"], quote=True) + '" target="_blank" rel="noopener noreferrer">' + escape(item["name"]) + '</a>' for item in news_sources["sources"]),
        "news_source_links_en": " ".join('<a href="' + escape(item["home_url"], quote=True) + '" target="_blank" rel="noopener noreferrer">' + escape(item["name"]) + '</a>' for item in news_sources["sources"]),
        "history_data": safe_json(history_data),
        "history_today": render_history(history_data), "history_today_en": render_history(history_data, "en"),
        "daily_content_data": safe_json(daily_content),
        "brief_rules_data": safe_json(brief_extras["rules"]), "brief_holidays_data": safe_json(brief_extras["holidays"]),
        "home_photos": render_home_photos(home_photos), "home_photos_en": render_home_photos(home_photos, "en"),
        "home_article_links": home_article_links(blog), "home_article_links_en": home_article_links(blog, "en"),
        "home_avatar": render_home_avatar(), "home_avatar_en": render_home_avatar("en"),
        "home_recent_articles": render_home_recent(blog), "home_recent_articles_en": render_home_recent(blog, "en"),
        "home_project_cards": render_home_projects(projects), "home_project_cards_en": render_home_projects(projects, "en"),
        "home_photo_src": HOME_PHOTO if has_home_photo else "/assets/home-ink.webp",
        "home_photo_srcset": (HOME_PHOTO + " 640w, " + HOME_PHOTO.replace("-640.webp", "-1706.webp") + " 1706w") if has_home_photo else "/assets/home-ink.webp 2172w",
        "home_photo_alt": "谢雨卿摄影：北京小清河公园的雪和河面" if has_home_photo else "水墨山景",
        "home_photo_alt_en": "Photograph by Xie Yuqing: snow and the river in Xiaoqinghe Park, Beijing" if has_home_photo else "An ink-wash mountain landscape",
        "home_photo_caption": "小清河公园在社科大东边一公里左右，那时常来这里散步。" if has_home_photo else "在主题之间，慢慢探索。",
        "home_photo_caption_en": "Xiaoqinghe Park, about a kilometre east of my university in Beijing. I often walked here." if has_home_photo else "Explore at your own pace.",
    })
    values.update({
        "brief_bottom_cards": render_brief_bottom(daily_content, brief_extras),
        "brief_bottom_cards_en": render_brief_bottom(daily_content, brief_extras, "en"),
        "site_notes_en": render_site_notes(blog.waline, blog.config["repository_url"], "en"),
    })
    for name, value in values.items(): home = home.replace("{{" + name + "}}", value)
    if "{{" in home: raise ValueError("Unresolved home template placeholder.")
    (OUTPUT / "index.html").write_text(localize_page(home, ROOT, address, "/"), encoding="utf-8")
    today_page = (ROOT / "home/today.template.html").read_text(encoding="utf-8")
    for name, value in values.items():
        today_page = today_page.replace("{{" + name + "}}", value)
    if "{{" in today_page:
        raise ValueError("Unresolved today template placeholder.")
    (OUTPUT / "today").mkdir(exist_ok=True)
    (OUTPUT / "today/index.html").write_text(localize_page(today_page, ROOT, address, "/today/",
        title=TODAY_TITLES, description=TODAY_DESCRIPTIONS), encoding="utf-8")
    projects_page = (ROOT / "home/projects.template.html").read_text(encoding="utf-8")
    project_values = {"site_url": escape(address, quote=True), "project_total": str(len(projects)),
                      "project_cards": render_projects(projects)}
    for name, value in project_values.items():
        projects_page = projects_page.replace("{{" + name + "}}", value)
    if "{{" in projects_page:
        raise ValueError("Unresolved projects template placeholder.")
    (OUTPUT / "projects").mkdir(exist_ok=True)
    (OUTPUT / "projects/index.html").write_text(localize_page(projects_page, ROOT, address, "/projects/"), encoding="utf-8")
    about_page = (ROOT / "home/about.template.html").read_text(encoding="utf-8")
    for name, value in {**values, "site_url": escape(address, quote=True), "about_content": render_about(about_data),
                        "site_notes": render_site_notes(blog.waline, blog.config["repository_url"])}.items():
        about_page = about_page.replace("{{" + name + "}}", value)
    if "{{" in about_page:
        raise ValueError("Unresolved about template placeholder.")
    (OUTPUT / "about").mkdir(exist_ok=True)
    (OUTPUT / "about/index.html").write_text(localize_page(about_page, ROOT, address, "/about/"), encoding="utf-8")
    anthology_report = build_anthology(ROOT, OUTPUT, address, language="zh-CN")
    from english_site import build_english_site
    english_report = build_english_site(blog, OUTPUT, address, projects, about_data, values)
    photo_english_report = build_photos(ROOT, OUTPUT, address, allow_local_map_preview=bool(map_preview_source), language="en")
    map_english_report = build_map(ROOT, OUTPUT, address, map_data, preview=bool(map_preview_source), language="en")
    anthology_english_report = build_anthology(ROOT, OUTPUT, address, language="en")
    maker_routes = []
    for language in ("zh-CN", "en"):
        build_map(ROOT, OUTPUT, address, map_data, language=language, maker=True)
        maker_routes.append(localized_path("/game/footprints/", language))
    game_catalogue = load_catalogues(ROOT, ("games",))
    game_routes = maker_routes
    for template, route in GAME_PAGES:
        source = ROOT / "home" / template
        if source.is_symlink():
            raise ValueError("Game template symlinks are not supported.")
        template_page = source.read_text(encoding="utf-8").replace("{{site_url}}", escape(address, quote=True))
        if "{{" in template_page:
            raise ValueError(f"Unresolved game template placeholder: {template}")
        page_name = "ranking" if route.endswith("ranking") else "game"
        titles = {language: game_catalogue[language][f"games.page.{page_name}.title"] for language in ("zh-CN", "en")}
        descriptions = {language: game_catalogue[language][f"games.page.{page_name}.description"] for language in ("zh-CN", "en")}
        for language in ("zh-CN", "en"):
            localized_route = localized_path("/" + route + "/", language)
            page = localize_page(template_page, ROOT, address, "/" + route + "/", language,
                                 modules=("games",), title=titles, description=descriptions)
            destination = OUTPUT / localized_route.strip("/")
            destination.mkdir(parents=True, exist_ok=True)
            (destination / "index.html").write_text(page, encoding="utf-8")
            game_routes.append(localized_route)
    (OUTPUT / "assets").mkdir(exist_ok=True)
    copy_daily_assets(daily_sources, brief_data, daily_content, brief_extras)
    avatar_source = ROOT / "home/assets/avatar-line.svg"
    if avatar_source.is_file():
        if linked_directory(avatar_source):
            raise ValueError("Homepage avatar links are not supported.")
        shutil.copy2(avatar_source, OUTPUT / "assets/avatar-line.svg")
    for name in ("portal.css", "site-themes.css", "portfolio.css", "portal.js", "site-i18n.js", "wechat-qrcode.jpg", *BRAND_ASSETS, *GAME_ASSETS):
        source = ROOT / "home/assets" / name
        if source.is_symlink(): raise ValueError("Home asset symlinks are not supported.")
        shutil.copy2(source, OUTPUT / "assets" / name)
    for name in ("site-music.js", "site-music.css", "site-navigation.js", "site-nav.css"):
        source = ROOT / "home/assets" / name
        if source.is_file():
            if source.is_symlink(): raise ValueError("Music asset symlinks are not supported.")
            shutil.copy2(source, OUTPUT / "assets" / name)
    music_source = ROOT / "home/assets/music"
    if music_source.is_dir():
        if linked_directory(music_source): raise ValueError("Music directory links are not supported.")
        music_output = OUTPUT / "assets/music"
        if linked_directory(music_output): raise ValueError("Music output directory links are not supported.")
        music_output.mkdir(exist_ok=True)
        for name in ("gentle.wav", "travel.wav", "credits.txt"):
            source = music_source / name
            if source.is_symlink(): raise ValueError("Music file links are not supported.")
            shutil.copy2(source, music_output / name)
    project_output = OUTPUT / "assets/projects"
    if linked_directory(project_output):
        raise ValueError("Generated project screenshot directory links are not supported.")
    project_output.mkdir(exist_ok=True)
    for source in project_sources:
        destination = project_output / source.name
        if linked_directory(destination) or (destination.exists() and not destination.is_file()):
            raise ValueError("Generated project screenshot destination must be a regular file.")
        shutil.copy2(source, destination)
    copy_game_photo_assets(photo_sets)
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
    sitemap = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = address + "/"
    ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = address + "/projects/"
    ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = address + "/about/"
    feature_routes = ["/today/", "/map/", "/en/map/", *game_routes,
                      *anthology_report["routes"], *anthology_english_report["routes"],
                      *photo_report["routes"], *photo_english_report["routes"]]
    for route in feature_routes:
        ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = address + "/" + route.strip("/") + "/"
    for route in english_report["routes"]:
        ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = address + route
    article_sitemap = ET.parse(OUTPUT / "articles/sitemap.xml")
    for loc in article_sitemap.findall(".//{*}loc"):
        ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = loc.text
    (OUTPUT / "sitemap.xml").write_bytes(ET.tostring(sitemap, encoding="utf-8", xml_declaration=True))
    (OUTPUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {address}/sitemap.xml\n", encoding="utf-8")
    from site_navigation import wrap_page_scripts
    navigation_report = wrap_page_scripts(OUTPUT)
    report = check_site(address)
    report["navigation"] = navigation_report
    report["metadata"] = check_publication_metadata(address)
    from english_site import check_english_publication
    english_report.update(check_english_publication(blog, OUTPUT, address))
    report["photography"] = photo_report
    report["footprints"] = map_report
    report["english"] = english_report
    report["anthology"] = anthology_report
    report["english_features"] = {"photography": photo_english_report, "footprints": map_english_report,
                                  "anthology": anthology_english_report, "games": game_routes[1::2]}
    report["localization"] = check_site_languages(OUTPUT, address)
    responsive = getattr(blog, "responsive_images", None)
    if responsive is not None:
        report["responsive_images"] = responsive.report()
    report.update({"articles": len(blog.articles), "projects": len(projects),
                   "publication_directory": expected_output, "waline_enabled": blog.waline["enabled"]})
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", default=default_root())
    args = parser.parse_args()
    print(json.dumps(build_site(args.site_url), ensure_ascii=False, indent=2))
