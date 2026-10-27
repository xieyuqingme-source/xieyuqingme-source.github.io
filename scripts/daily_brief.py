"""Validate explicit public briefing files; never fetch or scrape news."""
from datetime import date, datetime, timedelta, timezone
from html import escape
import ipaddress
import json
import re
from urllib.parse import unquote, urlsplit


LANGUAGES = {"zh-CN", "en"}
CHINA = timezone(timedelta(hours=8))
CATEGORY_ORDER = ("domestic", "world", "economy", "science", "culture")
CATEGORIES = set(CATEGORY_ORDER)
CATEGORY_LABELS = {
    "zh-CN": {"domestic": "时政", "world": "国际", "economy": "经济", "science": "科技", "culture": "文化"},
    "en": {"domestic": "China", "world": "World", "economy": "Economy", "science": "Science", "culture": "Culture"},
}
BRIEF_NOTICE = {"zh-CN": "新闻由人工挑选，标题和摘要依据原文；点「阅读原文」看全文。",
                "en": "News is selected by hand; titles and summaries follow the sources. Select “Read source” for the full text."}
SOLAR_TERMS = set("冬至 小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪".split())
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)


def _text(value, *, allow_empty=False):
    if (not isinstance(value, str) or (not allow_empty and not value.strip()) or len(value) > 2000
            or PRIVATE_PATH.search(value) or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError("Daily content needs short public text without local paths.")
    return value


def _localized(value, *, allow_empty=False):
    if not isinstance(value, dict) or set(value) != LANGUAGES:
        raise ValueError("Daily content needs both Chinese and English text.")
    for text in value.values():
        _text(text, allow_empty=allow_empty)


def _url(value, *, local=False):
    _text(value)
    if any(c.isspace() for c in value) or "\\" in value:
        raise ValueError("Daily source links must be public HTTPS URLs.")
    if local and re.fullmatch(r"/articles/(?:[A-Za-z0-9%._~!$&'()*+,;=:@-]+/)*[A-Za-z0-9%._~!$&'()*+,;=:@-]+\.html", value):
        decoded = unquote(value)
        if ".." not in decoded and "\\" not in decoded and not any(c.isspace() and c != " " for c in decoded):
            return
    parts = urlsplit(value)
    host = parts.hostname
    if (parts.scheme != "https" or not host or parts.username or parts.password or parts.query
            or host == "localhost" or host.endswith((".localhost", ".local", ".internal"))
            or parts.port not in {None, 443}):
        raise ValueError("Daily source links must be public HTTPS URLs without credentials or tokens.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Daily source links cannot point to a private network.")


def _date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Daily publication dates must be ISO calendar dates.")
    return date.fromisoformat(value)


def _entries(items, required, optional=frozenset(), *, minimum=1, maximum=30):
    if not isinstance(items, list) or not minimum <= len(items) <= maximum:
        raise ValueError(f"Daily content needs between {minimum} and {maximum} reviewed entries.")
    seen = set()
    for item in items:
        if not isinstance(item, dict) or not required.issubset(item) or set(item) - required - optional:
            raise ValueError("Daily content contains incomplete or unsupported fields.")
        if not isinstance(item["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", item["id"]) or item["id"] in seen:
            raise ValueError("Daily content IDs must be unique lowercase slugs.")
        seen.add(item["id"])


def _timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})", value):
        raise ValueError("Daily timestamps need an ISO date, time and timezone.")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_brief(data):
    if not isinstance(data, dict) or set(data) != {"version", "edition_date", "updated_at", "status", "items"} or type(data["version"]) is not int or data["version"] != 2:
        raise ValueError("Daily briefing data needs the version 2 public schema.")
    edition = _date(data["edition_date"])
    updated = _timestamp(data["updated_at"])
    if updated.utcoffset() != timedelta(hours=8) or updated.date() != edition:
        raise ValueError("Update timestamp must use the edition date and Beijing timezone.")
    if not isinstance(data["status"], str) or data["status"] not in {"manual", "auto"}:
        raise ValueError("Briefing status must be manual or auto.")
    _entries(data["items"], {"id", "category", "title", "summary", "source", "published", "url", "priority"}, {"major_reason"}, maximum=12)
    normal_categories = set()
    for item in data["items"]:
        if not isinstance(item["category"], str) or item["category"] not in CATEGORIES:
            raise ValueError("Daily briefing category must use the reviewed category set.")
        for name in ("title", "summary", "source"):
            _localized(item[name])
        # Chinese 字 counts printed characters; formatting whitespace is excluded.
        if len(re.sub(r"\s", "", item["summary"]["zh-CN"])) > 60:
            raise ValueError("A Chinese news summary cannot exceed 60 non-whitespace characters.")
        if not isinstance(item["priority"], str) or item["priority"] not in {"normal", "major"}:
            raise ValueError("News priority must be normal or major.")
        if item["priority"] == "major" and "major_reason" not in item:
            raise ValueError("Major news needs a bilingual major_reason.")
        if "major_reason" in item:
            _localized(item["major_reason"])
        if item["priority"] == "normal":
            if item["category"] in normal_categories:
                raise ValueError("Additional news in a category must be marked major with its reason.")
            normal_categories.add(item["category"])
        _url(item["url"])
        published = (_date(item["published"]) if isinstance(item["published"], str) and len(item["published"]) == 10
                     else _timestamp(item["published"]).astimezone(CHINA).date())
        if published > edition:
            raise ValueError("A briefing cannot predate its source publication.")
    return data


def _validate_archive(data):
    """Keep the original 26 October sample without inventing unverified dates."""
    if (not isinstance(data, dict) or set(data) != {"version", "edition_date", "status", "notice", "items"}
            or type(data["version"]) is not int or data["version"] != 1
            or data["edition_date"] != "2026-10-26" or data["status"] != "sample"):
        raise ValueError("Only the original 2026-10-26 archive may retain schema version 1.")
    _localized(data["notice"])
    _entries(data["items"], {"id", "categories", "title", "summary", "source", "published", "published_label", "url"})
    for item in data["items"]:
        categories = item["categories"]
        if (not isinstance(categories, list) or not categories
                or any(not isinstance(category, str) or category not in {"domestic", "world", "business", "science", "culture"} for category in categories)
                or len(set(categories)) != len(categories)):
            raise ValueError("Archive categories must use the original reviewed set.")
        for name in ("title", "summary", "published_label"):
            _localized(item[name])
        _text(item["source"])
        _url(item["url"])
        if item["published"] is not None and _date(item["published"]) > _date(data["edition_date"]):
            raise ValueError("An archived sample cannot predate its source.")
    return data


def validate_content(data):
    if not isinstance(data, dict) or set(data) != {"version", "quotes"} or type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Daily content data contains version 1 and quotes only.")
    _entries(data["quotes"], {"id", "text", "author", "work", "url", "translation_note"})
    for item in data["quotes"]:
        for name in ("text", "author", "work", "translation_note"):
            _localized(item[name])
        _url(item["url"])
    return data


def _collection(data, required, optional=frozenset(), *, minimum=1):
    if not isinstance(data, dict) or set(data) != {"version", "items"} or type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Brief collections need version 1 and an items array.")
    _entries(data["items"], required, optional, minimum=minimum, maximum=365)


def validate_knowledge(data):
    _collection(data, {"id", "title", "text", "source", "url"}, {"trigger"})
    for item in data["items"]:
        _localized(item["title"])
        _localized(item["text"])
        if len(re.sub(r"\s", "", item["text"]["zh-CN"])) > 120:
            raise ValueError("Chinese knowledge entries cannot exceed 120 non-whitespace characters.")
        _text(item["source"])
        _url(item["url"])
        if "trigger" in item:
            trigger = item["trigger"]
            if not isinstance(trigger, dict) or set(trigger) not in ({"solar_term"}, {"date"}):
                raise ValueError("Knowledge triggers select one solar term or MM-DD date.")
            if "solar_term" in trigger:
                if not isinstance(trigger["solar_term"], str) or trigger["solar_term"] not in SOLAR_TERMS:
                    raise ValueError("Knowledge solar term must be one of the 24 terms.")
            elif not isinstance(trigger["date"], str) or not re.fullmatch(r"\d{2}-\d{2}", trigger["date"]):
                raise ValueError("Knowledge date triggers must use MM-DD.")
            else:
                _date("2000-" + trigger["date"])
    return data


def validate_memes(data):
    _collection(data, {"id", "term", "meaning", "source", "url", "added"},
                {"origin", "example", "why_popular", "related_url", "related_label"}, minimum=0)
    for item in data["items"]:
        (_localized if isinstance(item["term"], dict) else _text)(item["term"])
        _localized(item["meaning"])
        for name in ("origin", "example", "why_popular"):
            if name in item:
                _localized(item[name], allow_empty=True)
        _text(item["source"])
        _url(item["url"])
        _date(item["added"])
        if ("related_url" in item) != ("related_label" in item):
            raise ValueError("Related reading needs both a public link and its label.")
        if "related_url" in item:
            _url(item["related_url"], local=True)
            _localized(item["related_label"])
    return data


def validate_rules(data):
    if not isinstance(data, dict) or set(data) != {"version", "weather"} or type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Weather rules need version 1 and a weather array.")
    _entries(data["weather"], {"id", "field", "operator", "threshold", "text"}, maximum=3)
    fields = {"precipitation_probability_max", "temperature_2m_max", "temperature_2m_min"}
    seen = set()
    for rule in data["weather"]:
        if not isinstance(rule["field"], str) or rule["field"] not in fields or rule["field"] in seen:
            raise ValueError("Weather rules must use distinct supported weather fields.")
        seen.add(rule["field"])
        if not isinstance(rule["operator"], str) or rule["operator"] not in {"gte", "lte"}:
            raise ValueError("Weather rules must compare with gte or lte.")
        if type(rule["threshold"]) not in {int, float} or not -100 <= rule["threshold"] <= 100:
            raise ValueError("Weather thresholds must be bounded finite numbers.")
        _localized(rule["text"])
    return data


def validate_holidays(data, year=None):
    if not isinstance(data, dict) or set(data) != {"$schema", "$id", "year", "papers", "days"}:
        raise ValueError("Holiday data must retain the holiday-cn public schema.")
    if type(data["year"]) is not int or not 1900 <= data["year"] <= 2200 or (year is not None and data["year"] != year):
        raise ValueError("Holiday data year must match its filename.")
    _url(data["$schema"])
    _url(data["$id"])
    if not isinstance(data["papers"], list) or not 1 <= len(data["papers"]) <= 30:
        raise ValueError("Published holiday data needs at least one official source paper.")
    for paper in data["papers"]:
        _url(paper)
    if not isinstance(data["days"], list) or not 1 <= len(data["days"]) <= 366:
        raise ValueError("Published holiday data needs dated holiday entries.")
    dates = set()
    for item in data["days"]:
        if not isinstance(item, dict) or set(item) != {"name", "date", "isOffDay"}:
            raise ValueError("Holiday entries contain unsupported fields.")
        _text(item["name"])
        if _date(item["date"]).year != data["year"] or item["date"] in dates or type(item["isOffDay"]) is not bool:
            raise ValueError("Holiday entries need unique dates in their year and a boolean isOffDay.")
        dates.add(item["date"])
    return data


def _safe(root, path, linked):
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("Daily content paths must stay in the public repository.")
    current = path
    while current != root:
        if linked(current):
            raise ValueError("Daily content paths cannot contain links.")
        current = current.parent


def _read(root, path, linked):
    _safe(root, path, linked)
    if not path.is_file():
        raise ValueError(f"Missing public daily content: {path.name}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_daily(root, linked):
    """Validate every dated edition, then select the newest version 2 edition."""
    folder = root / "home/brief/news"
    _safe(root, folder, linked)
    paths = sorted(folder.glob("*.json"))
    if not paths:
        raise ValueError("Daily briefing needs at least one dated news file.")
    editions = []
    for path in paths:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", path.name):
            raise ValueError("News filenames must use YYYY-MM-DD.json.")
        data = _read(root, path, linked)
        if not isinstance(data, dict) or path.stem != data.get("edition_date"):
            raise ValueError("News filename must match edition_date.")
        if path.name == "2026-10-26.json" and path != paths[-1] and data.get("version") == 1:
            _validate_archive(data)
        else:
            validate_brief(data)
        editions.append(data)
    content = validate_content(_read(root, root / "home/daily-content.json", linked))
    return editions[-1], content


def load_brief_extras(root, linked):
    folder = root / "home/brief"
    result = {}
    for name, validator in (("knowledge", validate_knowledge), ("memes", validate_memes), ("rules", validate_rules)):
        result[name] = validator(_read(root, folder / (name + ".json"), linked))
    holiday_folder = folder / "holidays"
    _safe(root, holiday_folder, linked)
    years = {}
    for path in sorted(holiday_folder.glob("*.json")):
        if not re.fullmatch(r"\d{4}\.json", path.name):
            raise ValueError("Holiday filenames must use YYYY.json.")
        years[path.stem] = validate_holidays(_read(root, path, linked), int(path.stem))
    if years:
        license_path = holiday_folder / "LICENSE"
        _safe(root, license_path, linked)
        if not license_path.is_file():
            raise ValueError("Holiday data needs its license.")
    result["holidays"] = {"years": years}
    return result


def safe_json(data):
    """JSON for both a standalone asset and an inert HTML script element."""
    return (json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            .replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def sorted_brief_items(data):
    validate_brief(data)
    return sorted(data["items"], key=lambda item: (item["priority"] != "major", CATEGORY_ORDER.index(item["category"])))


def render_brief(data, language="zh-CN"):
    """Every item retains a summary and readable source link without JavaScript."""
    language = "en" if language == "en" else "zh-CN"
    source_link = "Read source ↗" if language == "en" else "阅读原文 ↗"
    cards = []
    for item in sorted_brief_items(data):
        title, summary = (escape(item[name][language]) for name in ("title", "summary"))
        url = escape(item["url"], quote=True)
        published = escape(item["published"])
        badge = (' <span class="news-major">' + ("Major" if language == "en" else "要闻") + '</span>') if item["priority"] == "major" else ""
        category = escape(CATEGORY_LABELS[language][item["category"]])
        source = f'<div class="yl-source">{escape(item["source"][language])} · <time datetime="{published}">{published}</time> <a href="{url}" target="_blank" rel="noopener noreferrer">{source_link}</a></div>'
        cards.append(f'<article class="yl-item news-row"><div class="news-category">{category}{badge}</div><h3><a href="{url}" target="_blank" rel="noopener noreferrer">{title}</a></h3><p class="news-summary">{summary}</p>{source}</article>')
    return "\n".join(cards)


def render_brief_bottom(content, extras, language="zh-CN", today=None, own_quote=""):
    """Source-backed initial cards; the browser applies live calendar triggers."""
    content = validate_content(content)
    knowledge = validate_knowledge(extras["knowledge"])["items"]
    memes = validate_memes(extras["memes"])["items"]
    today = today or datetime.now(CHINA).date()
    offset = (today - date(1970, 1, 1)).days
    matched = [item for item in knowledge if item.get("trigger", {}).get("date") == today.strftime("%m-%d")]
    concept = matched[0] if matched else knowledge[offset % len(knowledge)]
    quote = content["quotes"][offset % len(content["quotes"])]
    text = lambda value: escape(value[language] if isinstance(value, dict) else value)
    def source_link(url, label, extra=""):
        return f'<a {extra}href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{label} ↗</a>'
    knowledge_title = "Daily knowledge" if language == "en" else "每日小知识"
    quote_title = "Daily quote" if language == "en" else "每日一言"
    concept_source = source_link(concept["url"], text(concept["source"]), 'id="daily-concept-source" class="yl-small" ')
    cards = [f'<article class="yl-daily-card"><h2>{knowledge_title}</h2><h3 class="yl-concept-title" id="daily-concept-title">{text(concept["title"])}</h3><p class="yl-concept-copy" id="daily-concept-text">{text(concept["text"])}</p>{concept_source}</article>']
    if memes:
        meme = max(memes, key=lambda item: item["added"])
        stamp = _date(meme["added"])
        added = f"Added {stamp.day} {stamp.strftime('%B')}" if language == "en" else f"{stamp.month}月{stamp.day}日收录"
        lines = []
        for field, dom in (("origin", "origin"), ("example", "example"), ("why_popular", "why")):
            value = meme.get(field, {}).get(language, "")
            lines.append(f'<p id="daily-meme-{dom}"' + ('' if value else ' hidden') + f'>{escape(value)}</p>')
        links = [source_link(meme["url"], text(meme["source"]))]
        if "related_url" in meme:
            related = (re.sub(r"^/articles/[^/]+/", "/en/articles/", meme["related_url"]) if language == "en" else meme["related_url"])
            links.append(source_link(related, text(meme["related_label"])))
        meme_title = "Internet meme" if language == "en" else "热梗"
        cards.append(f'<article class="yl-daily-card" id="daily-meme-card"><h2>{meme_title}</h2><h3 id="daily-street-title">{text(meme["term"])}</h3><p id="daily-street-text">{text(meme["meaning"])}</p>{"".join(lines)}<p class="yl-small" id="daily-meme-added">{added}</p><div class="yl-street-links" id="daily-street-links">{"".join(links)}</div></article>')
    cards.append(f'<article class="yl-daily-card"><h2>{quote_title}</h2><p class="yl-quote" id="daily-quote">{text(quote["text"])}</p><p class="yl-small yl-quote-source" id="daily-quote-source">{text(quote["author"])} · {source_link(quote["url"], text(quote["work"]))}</p></article>')
    if own_quote:
        cards.append(own_quote)
    return '<section class="yl-bottomline' + (' has-meme' if memes else '') + '" id="brief-bottom">' + "\n".join(cards) + '</section>'
