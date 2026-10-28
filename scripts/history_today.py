"""Validate and render the offline anniversary collection; never access the network."""
from datetime import date, datetime, timedelta, timezone
from html import escape
import ipaddress
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


CHINA = timezone(timedelta(hours=8))
LANGUAGES = {"zh-CN", "en"}
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
ALL_DAYS = frozenset((date(2000, 1, 1) + timedelta(days=n)).strftime("%m-%d") for n in range(366))
ITEM_FIELDS = {"id", "month_day", "year", "title", "text", "source", "url", "source_page", "source_revision", "verification"}
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)


def _text(value, maximum=1200):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or PRIVATE_PATH.search(value) or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError("History needs short public text without controls or local paths.")
    return value


def _localized(value, maximum=1200):
    if not isinstance(value, dict) or set(value) != LANGUAGES:
        raise ValueError("History text must contain Chinese and English.")
    for text in value.values():
        _text(text, maximum)


def _public_url(value):
    _text(value)
    if any(c.isspace() for c in value) or "\\" in value:
        raise ValueError("History sources must be public HTTPS URLs.")
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError as error:
        raise ValueError("History source port is invalid.") from error
    host = parts.hostname
    if (parts.scheme != "https" or not host or parts.username or parts.password or parts.query
            or port not in {None, 443} or host == "localhost"
            or host.endswith((".localhost", ".local", ".internal"))):
        raise ValueError("History sources must be public HTTPS URLs without credentials or query tokens.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("History sources cannot point to a private network.")
    return parts


def _month_day(value):
    if not isinstance(value, str) or value not in ALL_DAYS:
        raise ValueError("History month_day must be a real, zero-padded MM-DD, including February 29.")
    return value


def _source_day(value):
    parts = _public_url(value)
    path = unquote(parts.path)
    if parts.fragment:
        raise ValueError("History date-source pages must not have a fragment.")
    if parts.hostname == "en.wikipedia.org":
        match = re.fullmatch(r"/wiki/Wikipedia:Selected_anniversaries/([A-Za-z]+)_([1-9][0-9]?)", path)
        if match and match[1] in MONTHS:
            return f"{MONTHS.index(match[1]) + 1:02}-{int(match[2]):02}"
    if parts.hostname == "zh.wikipedia.org":
        match = re.fullmatch(r"/wiki/Wikipedia:(?:历史上的今天|歷史上的今天)/([1-9][0-9]?)月([1-9][0-9]?)日", path)
        if match:
            return f"{int(match[1]):02}-{int(match[2]):02}"
    raise ValueError("History date-source page must identify its Wikipedia anniversary date.")


def validate_history(data):
    """Check the public schema, complete 366-day coverage, and source-date consistency.

    These are local integrity checks, not a claim that an original historical
    document has been independently verified for each imported event.
    """
    if (not isinstance(data, dict) or set(data) != {"version", "attribution", "selection_policy", "items"}
            or type(data["version"]) is not int or data["version"] != 1):
        raise ValueError("History needs the version 1 offline collection schema.")
    _localized(data["attribution"])
    _localized(data["selection_policy"])
    items = data["items"]
    if not isinstance(items, list) or not 366 <= len(items) <= 3660:
        raise ValueError("History must cover all 366 calendar dates with at most ten events per date.")
    seen, counts = set(), {}
    for item in items:
        if not isinstance(item, dict) or set(item) != ITEM_FIELDS:
            raise ValueError("History entry has missing or unsupported fields.")
        identifier = item["id"]
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z][a-z0-9-]{1,79}", identifier) or identifier in seen:
            raise ValueError("History IDs must be unique lowercase slugs.")
        seen.add(identifier)
        month_day = _month_day(item["month_day"])
        counts[month_day] = counts.get(month_day, 0) + 1
        if counts[month_day] > 10:
            raise ValueError("History supports at most ten events per date.")
        year = item["year"]
        if type(year) is not int or not 1 <= year <= datetime.now(CHINA).year:
            raise ValueError("History years must be positive historical years, not future dates.")
        # The source's day/month convention is retained; it is not converted from
        # Julian dates or interpreted as a UTC instant. Leap-day events still
        # require a year in which February 29 actually exists in this calendar.
        if month_day == "02-29":
            try:
                date(year, 2, 29)
            except ValueError as error:
                raise ValueError("A February 29 history event must be in a leap year.") from error
        _localized(item["title"], 240)
        _localized(item["text"], 800)
        _text(item["source"], 240)
        _public_url(item["url"])
        if _source_day(item["source_page"]) != month_day:
            raise ValueError("History month_day disagrees with its anniversary source page.")
        if type(item["source_revision"]) is not int or item["source_revision"] <= 0:
            raise ValueError("History needs an explicit positive source-page revision.")
        if not isinstance(item["verification"], str) or item["verification"] not in {"automated_import", "editorial_review"}:
            raise ValueError("History needs an honest import or editorial review status.")
    if set(counts) != ALL_DAYS:
        raise ValueError("History is missing one or more of the 366 calendar dates.")
    return data


def _no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON keys are not allowed in history data.")
        result[key] = value
    return result


def load_history(root, linked=None):
    """Read the local collection before a build; reject linked or escaped paths."""
    root = Path(root).absolute()
    path = root / "home" / "brief" / "history.json"
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("History data must remain inside the source root.")
    for current in (path, *path.parents):
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()) or (linked and linked(current)):
            raise ValueError("History data links are not supported.")
        if current == root:
            break
    if not path.is_file() or path.stat().st_size > 4_000_000:
        raise ValueError("History data must be a small local JSON file.")
    return validate_history(json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicate_keys))


def history_items(data, month_day):
    """Return this date's entries in the explicit editorial order, without fallback dates."""
    _month_day(month_day)
    return [item for item in data["items"] if item["month_day"] == month_day]


def _beijing_date(today):
    if today is None:
        return datetime.now(CHINA).date()
    if isinstance(today, datetime):
        if today.tzinfo is None:
            raise ValueError("A history datetime must have a timezone.")
        return today.astimezone(CHINA).date()
    if isinstance(today, date):
        return today
    raise ValueError("History rendering needs a date or timezone-aware datetime.")


def render_history(data, language="zh-CN", today=None):
    """Render section contents, leaving the surrounding section and h2 to its template."""
    validate_history(data)
    if language not in LANGUAGES:
        raise ValueError("Unsupported history language.")
    day = _beijing_date(today)
    entries = history_items(data, day.strftime("%m-%d"))
    english = language == "en"
    date_label = day.strftime("%Y-%m-%d")
    date_note = (f"Beijing date · {date_label}. Historical dates follow the cited anniversary pages."
                 if english else f"北京时间 {date_label}。历史月日沿用所引日期页的记法。")

    def listing(items):
        result = []
        for item in items:
            article = escape(item["url"], quote=True)
            title = escape(item["title"][language])
            text = escape(item["text"][language])
            source = escape(item["source"])
            parts = urlsplit(item["source_page"])
            revision_url = f"https://{parts.hostname}/wiki/Special:PermanentLink/{item['source_revision']}"
            revision_label = "Date source" if english else "日期出处"
            result.append(f'<li class="history-item"><span class="history-year">{item["year"]}</span>'
                          f'<div><h3><a href="{article}" target="_blank" rel="noopener noreferrer">{title}</a></h3>'
                          f'<p>{text}</p><p class="history-source"><a href="{article}" target="_blank" '
                          f'rel="noopener noreferrer">{source} ↗</a> · <a href="{escape(revision_url, quote=True)}" '
                          f'target="_blank" rel="noopener noreferrer">{revision_label} ↗</a></p></div></li>')
        return '<ol class="history-list">' + "".join(result) + "</ol>"

    result = f'<p class="history-built-date" data-history-date="{date_label}">{escape(date_note)}</p>' + listing(entries[:3])
    if len(entries) > 3:
        more = "More from this date" if english else "更多这一天的历史"
        result += f'<details class="history-more"><summary>{more}</summary>{listing(entries[3:])}</details>'
    note_label = "About this collection · compiled and adapted" if english else "资料说明 · 自动整理与译编"
    source_label = "Full source notes" if english else "完整来源说明"
    result += ('<details class="history-notes"><summary>' + note_label + '</summary><p class="history-policy">'
               + escape(data["selection_policy"][language]) + '</p></details><p class="history-policy">'
               + escape(data["attribution"][language])
               + ' <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" '
                 'rel="noopener noreferrer">CC BY-SA 4.0</a> · <a href="/assets/history-sources.md">' + source_label + '</a></p>')
    return result
