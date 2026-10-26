"""Reviewed homepage reading samples and source-backed daily content.

This module reads only explicit public data. It never fetches, scrapes or labels
the sample as a live news service; dates belong to the original publications.
"""
from datetime import date
from html import escape
import ipaddress
import json
import re
from urllib.parse import unquote, urlsplit


LANGUAGES = {"zh-CN", "en"}
CATEGORIES = {"domestic", "world", "business", "science", "culture"}
CATEGORY_LABELS = {
    "zh-CN": {"domestic": "国内", "world": "国际", "business": "商业", "science": "科学", "culture": "文化"},
    "en": {"domestic": "China", "world": "World", "business": "Business", "science": "Science", "culture": "Culture"},
}
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)


def _text(value):
    if (not isinstance(value, str) or not value.strip() or len(value) > 2000
            or PRIVATE_PATH.search(value) or any(ord(c) < 32 for c in value)):
        raise ValueError("Daily content needs short public text without local paths.")
    return value


def _localized(value):
    if not isinstance(value, dict) or set(value) != LANGUAGES:
        raise ValueError("Daily content needs both Chinese and English text.")
    for text in value.values():
        _text(text)


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
    date.fromisoformat(value)


def _entries(items, required, optional=frozenset()):
    if not isinstance(items, list) or not 1 <= len(items) <= 30:
        raise ValueError("Daily content needs between 1 and 30 reviewed entries.")
    seen = set()
    for item in items:
        if not isinstance(item, dict) or not required.issubset(item) or set(item) - required - optional:
            raise ValueError("Daily content contains incomplete or unsupported fields.")
        if not isinstance(item["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{1,63}", item["id"]) or item["id"] in seen:
            raise ValueError("Daily content IDs must be unique lowercase slugs.")
        seen.add(item["id"])


def validate_brief(data):
    if not isinstance(data, dict) or set(data) != {"version", "edition_date", "status", "notice", "items"} or data["version"] != 1:
        raise ValueError("Daily briefing data needs the version 1 public schema.")
    _date(data["edition_date"])
    if data["status"] != "sample":
        raise ValueError("This reviewed briefing is a reading sample, not an automated daily feed.")
    _localized(data["notice"])
    _entries(data["items"], {"id", "categories", "title", "summary", "source", "published", "published_label", "url"})
    for item in data["items"]:
        if (not isinstance(item["categories"], list) or not item["categories"]
                or any(not isinstance(category, str) or category not in CATEGORIES for category in item["categories"])
                or len(set(item["categories"])) != len(item["categories"])):
            raise ValueError("Daily briefing categories must use the reviewed category set.")
        for name in ("title", "summary", "published_label"):
            _localized(item[name])
        _text(item["source"])
        _url(item["url"])
        if item["published"] is not None:
            _date(item["published"])
            if item["published"] > data["edition_date"]:
                raise ValueError("A sample cannot predate its source publication.")
    return data


def validate_content(data):
    if not isinstance(data, dict) or set(data) != {"version", "quotes", "concepts", "street"} or data["version"] != 1:
        raise ValueError("Daily content data needs the version 1 public schema.")
    _entries(data["quotes"], {"id", "text", "author", "work", "url", "translation_note"})
    _entries(data["concepts"], {"id", "title", "text", "source", "url"})
    _entries(data["street"], {"id", "title", "text", "source", "url"}, {"related_url", "related_label"})
    for group in ("quotes", "concepts", "street"):
        for item in data[group]:
            for name in ("text", "title", "author", "work", "translation_note", "related_label"):
                if name in item:
                    _localized(item[name])
            if "source" in item:
                _text(item["source"])
            _url(item["url"])
            if ("related_url" in item) != ("related_label" in item):
                raise ValueError("Related reading needs both a public link and its label.")
            if "related_url" in item:
                _url(item["related_url"], local=True)
    return data


def load_daily(root, linked):
    """Validate explicit files before the builder writes any homepage outputs."""
    for parent in (root / "home",):
        if linked(parent):
            raise ValueError("Daily content directory links are not supported.")
    result = []
    for name, validator in (("daily-brief.json", validate_brief), ("daily-content.json", validate_content)):
        path = root / "home" / name
        if linked(path) or not path.is_file():
            raise ValueError(f"Missing or linked public daily content: {name}")
        result.append(validator(json.loads(path.read_text(encoding="utf-8"))))
    return tuple(result)


def safe_json(data):
    """JSON for both a standalone asset and an inert HTML script element."""
    return (json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            .replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def render_brief(data, language="zh-CN"):
    """Readable source links remain available when JavaScript is disabled."""
    data = validate_brief(data)
    language = "en" if language == "en" else "zh-CN"
    source_link = "Read source ↗" if language == "en" else "阅读原文 ↗"
    heading = "Reading sample" if language == "en" else "选读样刊"
    cards = []
    for index, item in enumerate(data["items"]):
        title, summary = (escape(item[name][language]) for name in ("title", "summary"))
        url = escape(item["url"], quote=True)
        published = (f'<time datetime="{item["published"]}">{item["published"]}</time>' if item["published"]
                     else escape(item["published_label"][language]))
        source = f'<div class="yl-source">{escape(item["source"])} · {published} <a href="{url}" target="_blank" rel="noopener noreferrer">{source_link}</a></div>'
        if index == 0:
            cards.append(f'<article class="yl-lead"><span class="yl-label">{heading}</span><h2><a href="{url}" target="_blank" rel="noopener noreferrer">{title}</a></h2><p>{summary}</p>{source}</article><div class="yl-news-grid">')
        else:
            cards.append(f'<article class="yl-item"><span class="yl-num">{index + 1:02d}</span><div><h3><a href="{url}" target="_blank" rel="noopener noreferrer">{title}</a></h3>{source}</div></article>')
    cards.append('</div>')
    return "\n".join(cards)
