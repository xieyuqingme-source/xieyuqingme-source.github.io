"""Bounded first-party RSS collection and optional last-known-good news snapshots.

Only the collect command contacts news feeds. Builds load local, validated JSON;
restore reads Release assets, never the news sites. No summaries or translations
are generated. Remote writes require the explicit publish command inside Actions.
"""
import argparse
import gzip
from io import BytesIO
from collections import Counter, deque
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import escape, unescape
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unicodedata
import zlib
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path("home/brief/news-sources.json")
SEED_PATH = Path("home/brief/news-snapshot.json")
RELEASE = "news-data"
REPOSITORY = "xieyuqingme-source/xieyuqingme-source.github.io"
MAX_FEED_BYTES = 1024 * 1024
MAX_SNAPSHOT_BYTES = 64 * 1024
MAX_METADATA_BYTES = 1024 * 1024
REQUEST_TIMEOUT = 8
RESTORE_SECONDS = 25
KEEP_SNAPSHOTS = 30
UTC = timezone.utc
CHINA = timezone(timedelta(hours=8))
CATEGORIES = ("domestic", "world", "economy", "science")
CATEGORY_LABELS = {
    "zh-CN": dict(domestic="国内", world="国际", economy="经济", science="科技"),
    "en": dict(domestic="China", world="World", economy="Economy", science="Science"),
}
SLUG = re.compile(r"[a-z][a-z0-9-]{1,63}\Z")
ASSET = re.compile(r"news-(\d{8}T\d{6}Z)-([a-f0-9]{12})\.json\Z")
PRIVATE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|/(?:Users|home|mnt)/", re.I)
TRACKING = {"at_medium", "at_campaign", "fbclid", "gclid"}


def _now():
    return datetime.now(UTC).replace(microsecond=0)


def _text(value, maximum=500):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or any(unicodedata.category(c) in {"Cc", "Cs"} for c in value)
            or "<" in value or ">" in value or PRIVATE_PATH.search(value)):
        raise ValueError("News needs short public plain text.")
    return value


def _host(host):
    if (not isinstance(host, str) or host != host.lower() or len(host) > 253
            or not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", host)
            or host.endswith((".localhost", ".local", ".internal", ".lan", ".home", ".test", ".invalid", ".onion"))):
        raise ValueError("News hosts must be public DNS names.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return host
    raise ValueError("News cannot use IP address URLs.")


def public_url(value, allowed_hosts=None):
    """Keep legitimate queries; reject credentials, controls and local addresses."""
    _text(value, 2048)
    decoded = value
    for _ in range(6):
        if any(ord(c) < 33 or ord(c) == 127 for c in decoded) or "\\" in decoded:
            raise ValueError("News URLs cannot contain whitespace or controls.")
        next_value = unquote(decoded)
        if next_value == decoded:
            break
        decoded = next_value
    if (any(ord(c) < 33 or ord(c) == 127 for c in decoded) or "\\" in decoded
            or unquote(decoded) != decoded):
        raise ValueError("News URL encoding is too deeply nested.")
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError as error:
        raise ValueError("Invalid news URL port.") from error
    if (parts.scheme != "https" or not parts.hostname or "@" in parts.netloc
            or parts.username is not None or parts.password is not None or port not in {None, 443}):
        raise ValueError("News URLs need public HTTPS without credentials.")
    host = _host(parts.hostname)
    if allowed_hosts is not None and host not in allowed_hosts:
        raise ValueError("News URL is outside its source allowlist.")
    return urlunsplit(("https", host, parts.path or "/", parts.query, ""))


def _json(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError("Duplicate JSON field.")
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError("Nonfinite JSON value.")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=nonfinite)


def _safe_path(path):
    path = Path(path).absolute()
    for parent in (path, *path.parents):
        if parent.is_symlink() or (hasattr(parent, "is_junction") and parent.is_junction()):
            raise ValueError("News data paths cannot use links or junctions.")
    return path


def _read_json(path, maximum=MAX_SNAPSHOT_BYTES):
    path = _safe_path(path)
    if not path.is_file() or path.stat().st_size > maximum:
        raise ValueError("News JSON is missing or too large.")
    with path.open("rb") as stream:
        raw = stream.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError("News JSON is too large.")
    return _json(raw)


def validate_sources(config):
    expected = {"version", "max_items", "max_per_source", "max_per_publisher", "max_age_hours", "sources"}
    version = config.get('version') if isinstance(config, dict) else None
    if (type(version) is not int or version not in {1, 2}
            or set(config) != (expected if version == 1 else expected | {'collect_ids'})):
        raise ValueError("News sources need a supported exact public schema.")
    for key, maximum in (("max_items", 8 if version == 1 else 24), ("max_per_source", 2), ("max_per_publisher", 2), ("max_age_hours", 72)):
        if type(config[key]) is not int or not 1 <= config[key] <= maximum:
            raise ValueError("News source limits cannot exceed reviewed bounds.")
    if not isinstance(config["sources"], list) or not 1 <= len(config["sources"]) <= (6 if version == 1 else 24):
        raise ValueError("News needs a small explicit source allowlist.")
    seen = set()
    fields = {"id", "publisher", "name", "category", "lang", "feed_url", "home_url", "docs_url", "article_hosts"}
    for source in config["sources"]:
        if not isinstance(source, dict) or set(source) not in (fields, fields | {'link_policy'} if version == 2 else fields):
            raise ValueError("Incomplete news source.")
        if (not isinstance(source["id"], str) or not SLUG.fullmatch(source["id"]) or source["id"] in seen
                or not isinstance(source["publisher"], str) or not SLUG.fullmatch(source["publisher"])):
            raise ValueError("News source IDs must be unique slugs.")
        seen.add(source["id"])
        _text(source["name"], 80)
        if source["category"] not in CATEGORIES or source["lang"] not in ({"zh-CN", "en"} if version == 1 else {"zh-CN", "zh-Hant", "en"}):
            raise ValueError("Unsupported news category or language.")
        policy = source.get('link_policy', 'publisher')
        if policy not in {'publisher', 'public-https'} or (policy == 'public-https' and not (
                version == 2 and source['id'] == 'hacker-news' and source['publisher'] == 'hackernews'
                and isinstance(source['home_url'], str)
                and urlsplit(source['home_url']).hostname == 'news.ycombinator.com')):
            raise ValueError('External article links need the reviewed community-feed policy.')
        hosts = source["article_hosts"]
        if not isinstance(hosts, list) or not 1 <= len(hosts) <= 6 or len(set(hosts)) != len(hosts):
            raise ValueError("News article hosts must be a small unique allowlist.")
        for host in hosts:
            _host(host)
        public_url(source["feed_url"])
        public_url(source["home_url"], hosts)
        public_url(source["docs_url"])
    if version == 2:
        active = config['collect_ids']
        if (not isinstance(active, list) or len(active) > 15
                or any(not isinstance(value, str) or value not in seen for value in active)
                or len(active) != len(set(active))):
            raise ValueError('Active feeds must be an explicit bounded subset of known IDs.')
    return config


def load_sources(root=ROOT):
    legacy = validate_sources(_read_json(Path(root) / CONFIG_PATH))
    if (Path(root) / 'home/brief/information-sources.json').exists():
        from world_sources import collection_config, load_catalog
        return collection_config(load_catalog(root), legacy)
    return legacy


def active_sources(config):
    return [source for source in config['sources']
            if config['version'] == 1 or source['id'] in config['collect_ids']]


def article_hosts(source):
    return None if source.get('link_policy') == 'public-https' else source['article_hosts']


def timestamp(value):
    if (not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})", value)):
        raise ValueError("News timestamps need seconds and an explicit timezone.")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _stamp(value):
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def url_key(url):
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_") and key.lower() not in TRACKING]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(sorted(query)), ""))


def title_key(title):
    return " ".join(unicodedata.normalize("NFKC", title).casefold().split())


def validate_snapshot(data, config=None):
    config = validate_sources(config) if config is not None else load_sources()
    if (not isinstance(data, dict) or set(data) != {"version", "collected_at", "items"}
            or type(data["version"]) is not int or data["version"] != 1
            or not isinstance(data["items"], list) or len(data["items"]) > config["max_items"]):
        raise ValueError("News snapshot needs the version 1 public schema.")
    if data["collected_at"] is None:
        if data["items"]:
            raise ValueError("Uncollected news cannot contain entries.")
        return data
    collected = timestamp(data["collected_at"])
    sources = {source["id"]: source for source in config["sources"]}
    ids, urls, titles = set(), set(), set()
    source_counts, publisher_counts = Counter(), Counter()
    for item in data["items"]:
        if not isinstance(item, dict) or set(item) != {"id", "category", "title", "source", "source_id", "published", "lang", "url"}:
            raise ValueError("News entries need exact original-source fields.")
        source = sources.get(item["source_id"]) if isinstance(item["source_id"], str) else None
        if (source is None or item["source"] != source["name"] or item["category"] != source["category"]
                or item["lang"] != source["lang"]):
            raise ValueError("News source metadata must match the allowlist.")
        _text(item["title"])
        url = public_url(item["url"], article_hosts(source))
        if url != item["url"]:
            raise ValueError("Snapshot URLs must use the normalized public form.")
        key = url_key(url)
        expected_id = "news-" + sha256(key.encode("utf-8")).hexdigest()[:20]
        if item["id"] != expected_id or item["id"] in ids or key in urls or title_key(item["title"]) in titles:
            raise ValueError("News IDs, URLs and titles must be unique.")
        ids.add(item["id"])
        urls.add(key)
        titles.add(title_key(item["title"]))
        published = timestamp(item["published"])
        if not collected - timedelta(hours=config["max_age_hours"]) <= published <= collected:
            raise ValueError("News must be dated within the collection window.")
        source_counts[source["id"]] += 1
        publisher_counts[source["publisher"]] += 1
        if (source_counts[source["id"]] > config["max_per_source"]
                or publisher_counts[source["publisher"]] > config["max_per_publisher"]):
            raise ValueError("News source or publisher limit exceeded.")
    return data


def load_snapshot(root=ROOT, override=None):
    """Never fetch. Reject a bad optional override and fall back to the seed."""
    config = load_sources(root)
    override = override or os.environ.get("NEWS_SNAPSHOT_PATH")
    if override:
        try:
            data = validate_snapshot(_read_json(override), config)
            if data["collected_at"] is None or timestamp(data["collected_at"]) > _now() + timedelta(minutes=5):
                raise ValueError("Optional snapshot has an invalid collection time.")
            return data
        except (OSError, ValueError, TypeError):
            print("News override unavailable; using the checked-in seed.", file=sys.stderr)
    seed = Path(root) / SEED_PATH
    if not seed.exists():
        return {"version": 1, "collected_at": None, "items": []}
    return validate_snapshot(_read_json(seed), config)


def fetch_feed(url, allowed_hosts):
    """GET only fixed HTTPS hosts, pinning a verified public DNS address per hop."""
    deadline = time.monotonic() + 20
    for _ in range(4):
        url = public_url(url, allowed_hosts)
        parts = urlsplit(url)
        addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(info[4][0]).is_global for info in addresses):
            raise ValueError("News DNS resolved outside the public internet.")
        address = addresses[0][4][0]
        connection = http.client.HTTPSConnection(parts.hostname, 443, timeout=REQUEST_TIMEOUT, context=ssl.create_default_context())
        connection._create_connection = lambda destination, timeout, source_address=None: socket.create_connection((address, 443), timeout, source_address)
        try:
            target = parts.path + ("?" + parts.query if parts.query else "")
            connection.request("GET", target, headers={"User-Agent": "PersonalSiteNews/1.0 (+https://xieyuqing.me)",
                               "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml", "Accept-Encoding": "identity"})
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                url = urljoin(url, response.getheader("Location", ""))
                continue
            encoding = response.getheader('Content-Encoding', 'identity').lower()
            if response.status != 200 or encoding not in {'', 'identity', 'gzip'}:
                raise ValueError('News source did not return a supported successful feed.')
            length = response.getheader("Content-Length")
            if length is not None and (not length.isdigit() or int(length) > MAX_FEED_BYTES):
                raise ValueError("News feed is too large.")
            chunks, size = [], 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("News source time budget exceeded.")
                if connection.sock is not None:
                    connection.sock.settimeout(min(REQUEST_TIMEOUT, remaining))
                chunk = response.read1(min(65536, MAX_FEED_BYTES + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > MAX_FEED_BYTES:
                    raise ValueError("News feed is too large.")
            raw = b"".join(chunks)
            if len(raw) > MAX_FEED_BYTES:
                raise ValueError("News feed is too large.")
            return decode_feed_body(raw, encoding)
        finally:
            connection.close()
    raise ValueError("Too many news feed redirects.")


def decode_feed_body(raw, encoding='identity'):
    if not isinstance(raw, bytes) or len(raw) > MAX_FEED_BYTES:
        raise ValueError('News feed is too large.')
    if encoding in {'', 'identity'}:
        return raw
    if encoding != 'gzip':
        raise ValueError('Unsupported news content encoding.')
    try:
        with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
            expanded = stream.read(MAX_FEED_BYTES + 1)
    except (OSError, EOFError, zlib.error) as error:
        raise ValueError('Invalid compressed news feed.') from error
    if len(expanded) > MAX_FEED_BYTES:
        raise ValueError('Expanded news feed is too large.')
    return expanded


def parse_feed(raw, source, collected, *, archive_records=None):
    if not isinstance(raw, bytes) or len(raw) > MAX_FEED_BYTES:
        raise ValueError("News feed is too large.")
    text = raw.decode("utf-8-sig")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", text, re.I):
        raise ValueError("DTD and entity declarations are not accepted.")
    declaration = re.match(r"\s*<\?xml\b[^?]*encoding=['\"]([^'\"]+)", text, re.I)
    if declaration and declaration[1].lower().replace("-", "") != "utf8":
        raise ValueError("News feeds must use UTF-8.")
    root = ET.fromstring(text)
    if root.tag == 'rss':
        entries = root.findall('./channel/item')
    elif root.tag == '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF':
        entries = root.findall('{http://purl.org/rss/1.0/}item')
    else:
        entries = root.findall('{http://www.w3.org/2005/Atom}entry')
    if len(entries) > 1000:
        raise ValueError("News feed has too many entries.")
    result = []
    for entry in entries:
        fields = {child.tag.split("}")[-1]: child for child in entry}
        try:
            title = " ".join(unescape(fields["title"].text or "").split())
            _text(title)
            # Mixed RSS feeds (e.g. NYT) may also contain atom:link rel="standout".
            # Keep the actual RSS article URL rather than overwriting it by local name.
            link = next((child.text.strip() for child in entry
                         if child.tag in {'link', '{http://purl.org/rss/1.0/}link'}
                         and child.text and child.text.strip()), None)
            link = link or next((child.attrib.get("href") for child in entry
                                 if child.tag == '{http://www.w3.org/2005/Atom}link'
                                 and child.attrib.get("rel", "alternate") == "alternate"), None)
            url = public_url(link, article_hosts(source))
            date_text = next((fields[name].text for name in ("pubDate", "published", "date") if name in fields), None)
            record = dict(title=title, url=url, published=date_text)
            if archive_records is not None:
                archive_records.append(record)
            if not date_text:
                continue
            try:
                published = datetime.fromisoformat(date_text.strip().replace("Z", "+00:00"))
            except ValueError:
                published = parsedate_to_datetime(date_text)
            if published.tzinfo is None or published.utcoffset() is None:
                continue
            published = published.astimezone(UTC).replace(microsecond=0)
            record["published"] = _stamp(published)
            if not collected - timedelta(hours=72) <= published <= collected:
                continue
            result.append(dict(id="news-" + sha256(url_key(url).encode("utf-8")).hexdigest()[:20],
                               category=source["category"], title=title, source=source["name"], source_id=source["id"],
                               published=_stamp(published), lang=source["lang"], url=url))
        except (ValueError, KeyError, TypeError, OverflowError):
            continue
    return result


def _archive_warning(error):
    # Archive failures must not suppress an independently valid display snapshot.
    # Never print upstream bodies, credentials, local paths or the error message.
    print(f"News archive capture unavailable ({type(error).__name__}); display snapshot handling continues.", file=sys.stderr)


def _archive_capture(config, archive_pools, report, collected, selected):
    # The archive's larger pool never changes the existing display selection.
    # Prefer displayed IDs so every new snapshot link is represented even when
    # many earlier feed entries share a title with another source.
    import news_archive as archive
    shown = {item["id"] for item in selected}
    archived, seen_ids, archive_report = [], set(), []
    source_reports = {r["id"]: r for r in report}
    for source in active_sources(config):
        candidates = [archive.archive_item(item, source, collected)
                      for item in archive_pools.get(source["id"], [])]
        candidates.sort(key=lambda item: item["id"] not in shown)
        accepted = []
        for item in candidates:
            if item["id"] not in seen_ids:
                accepted.append(item)
                seen_ids.add(item["id"])
                if len(accepted) == archive.MAX_PER_SOURCE:
                    break
        archived.extend(accepted)
        result = source_reports[source["id"]]
        archive_report.append(dict(source_id=source["id"], status=result["status"], received=len(candidates),
                                   archived=len(accepted), eligible=result.get("eligible", 0), reason=result.get("reason")))
    capture = archive.make_capture(archived, archive_report, collected, [item["id"] for item in selected] if selected else None)
    return archive.validate_capture(capture, config)


def collect_snapshot(config=None, *, fetch=fetch_feed, now=None, archive_sink=None):
    config = validate_sources(config) if config is not None else load_sources()
    collected = (now or _now()).astimezone(UTC).replace(microsecond=0)
    pools, report, archive_pools = {}, [], {}
    for source in active_sources(config):
        try:
            raw = fetch(source["feed_url"], {urlsplit(source["feed_url"]).hostname})
            archive_records = [] if archive_sink is not None else None
            entries = parse_feed(raw, source, collected, archive_records=archive_records)
            entries = [item for item in entries if timestamp(item["published"]) >= collected - timedelta(hours=config["max_age_hours"])]
            pools[source["id"]] = deque(entries)
            if archive_records is not None:
                archive_pools[source["id"]] = archive_records
            report.append({"id": source["id"], "status": "ok", "eligible": len(entries)})
        except (OSError, ValueError, ET.ParseError, http.client.HTTPException) as error:
            # Do not log upstream response bodies, URLs with queries, or credentials.
            report.append({"id": source["id"], "status": "failed", "reason": type(error).__name__})
    selected, urls, titles = [], set(), set()
    source_counts, publisher_counts = Counter(), Counter()
    # Category rotation keeps the feeds' own order; it makes no claim of importance.
    queues = {category: deque(source for source in active_sources(config) if source["category"] == category) for category in CATEGORIES}
    while len(selected) < config["max_items"]:
        added = False
        for category in CATEGORIES:
            queue = queues[category]
            for _ in range(len(queue)):
                source = queue.popleft()
                pool = pools.get(source["id"], deque())
                if source_counts[source["id"]] >= config["max_per_source"] or publisher_counts[source["publisher"]] >= config["max_per_publisher"]:
                    continue
                found = None
                while pool:
                    item = pool.popleft()
                    if url_key(item["url"]) not in urls and title_key(item["title"]) not in titles:
                        found = item
                        break
                if pool:
                    queue.append(source)
                if found:
                    selected.append(found)
                    urls.add(url_key(found["url"]))
                    titles.add(title_key(found["title"]))
                    source_counts[source["id"]] += 1
                    publisher_counts[source["publisher"]] += 1
                    added = True
                    break
            if len(selected) == config["max_items"]:
                break
        if not added:
            break
    if archive_sink is not None:
        try:
            capture = _archive_capture(config, archive_pools, report, collected, selected)
        except (OSError, ValueError, TypeError) as error:
            _archive_warning(error)
        else:
            archive_sink.append(capture)
    if not selected:
        raise ValueError("No current, verifiable source entries; keep the last snapshot.")
    return validate_snapshot({"version": 1, "collected_at": _stamp(collected), "items": selected}, config), report


def visible_items(data, config=None, now=None):
    config = config or load_sources()
    validate_snapshot(data, config)
    current = (now or _now()).astimezone(UTC)
    return [item for item in data["items"] if current - timedelta(hours=config["max_age_hours"]) <= timestamp(item["published"]) <= current]


def render_snapshot(data, language="zh-CN", config=None, *, now=None, include_sources=True, include_stamp=True, limit=None):
    config = config or load_sources()
    language = "en" if language == "en" else "zh-CN"
    rows = []
    items = visible_items(data, config, now)
    if limit is not None:
        if type(limit) is not int or not 1 <= limit <= 24:
            raise ValueError('Visible headline limit must be a reviewed positive integer.')
        items = items[:limit]
    for item in items:
        published = timestamp(item["published"]).astimezone(CHINA)
        meta = " · ".join((item["source"], published.strftime("%Y-%m-%d %H:%M +08:00"), item["lang"]))
        rows.append('<article class="news-row"><span class="news-category">' + escape(CATEGORY_LABELS[language][item["category"]])
                    + '</span><h3><a href="' + escape(item["url"], quote=True) + '" lang="' + item["lang"]
                    + '" target="_blank" rel="noopener noreferrer">' + escape(item["title"])
                    + '</a></h3><p class="news-meta">' + escape(meta) + '</p></article>')
    if data["collected_at"]:
        label = "汇集时间：" if language == "zh-CN" else "Collected: "
        label += timestamp(data["collected_at"]).astimezone(CHINA).strftime("%Y-%m-%d %H:%M +08:00")
    else:
        label = "暂未取得新闻快照。" if language == "zh-CN" else "No news snapshot is available yet."
    if not items:
        label += " 暂无72小时内的条目，可访问新闻源。" if language == "zh-CN" else " No entries from the last 72 hours; visit the sources."
    if include_stamp:
        rows.append('<p class="news-feed-note">' + escape(label) + '</p>')
    elif not items:
        rows.append('<p class="news-feed-note">' + escape("暂无72小时内的条目，可访问新闻源。" if language == "zh-CN" else "No entries from the last 72 hours; visit the sources.") + '</p>')
    source_label = "新闻源入口" if language == "zh-CN" else "News sources"
    links = ['<a href="' + escape(source["home_url"], quote=True) + '" target="_blank" rel="noopener noreferrer">'
             + escape(source["name"]) + '</a>' for source in config["sources"]]
    if include_sources:
        rows.append('<nav class="news-source-links" aria-label="' + source_label + '">' + " · ".join(links) + '</nav>')
    return "\n".join(rows)


def snapshot_bytes(data, config=None):
    validate_snapshot(data, config)
    raw = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > MAX_SNAPSHOT_BYTES:
        raise ValueError("News snapshot is too large.")
    return raw


def write_snapshot(path, data, config=None):
    raw = snapshot_bytes(data, config)
    path = _safe_path(path)
    if path.suffix != ".json":
        raise ValueError("News output must be a JSON file.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".news-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _gh(arguments, *, timeout=REQUEST_TIMEOUT, maximum=MAX_METADATA_BYTES):
    result = subprocess.run(["gh", *arguments], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode:
        if b"HTTP 404" in result.stderr:
            raise FileNotFoundError("Release asset not found.")
        raise OSError("GitHub request failed; details withheld.")
    if len(result.stdout) > maximum:
        raise ValueError("GitHub response is too large.")
    return result.stdout


def _release(gh=_gh, *, timeout=REQUEST_TIMEOUT):
    return _json(gh(["api", f"repos/{REPOSITORY}/releases/tags/{RELEASE}"], timeout=timeout))


def _assets(release):
    values = release.get("assets") if isinstance(release, dict) else None
    if not isinstance(values, list) or len(values) > 1000:
        raise ValueError("Invalid release asset index.")
    return sorted((asset for asset in values if isinstance(asset, dict) and isinstance(asset.get("name"), str)
                   and ASSET.fullmatch(asset["name"]) and type(asset.get("id")) is int and asset["id"] > 0
                   and type(asset.get("size")) is int and 0 < asset["size"] <= MAX_SNAPSHOT_BYTES
                   and asset.get("state") == "uploaded"), key=lambda asset: asset["name"], reverse=True)


def restore_snapshot(root=ROOT, *, gh=_gh, now=None):
    """Bounded optional Release read; a failure cannot stop normal publication."""
    config = load_sources(root)
    current = now or _now()
    deadline = time.monotonic() + RESTORE_SECONDS
    def remaining():
        value = min(REQUEST_TIMEOUT, deadline - time.monotonic())
        if value <= 0:
            raise TimeoutError("News restore time budget exceeded.")
        return value
    try:
        assets = _assets(_release(gh, timeout=remaining()))
        for asset in assets[:3]:
            try:
                raw = gh(["api", "-H", "Accept: application/octet-stream", f"repos/{REPOSITORY}/releases/assets/{asset['id']}"],
                         timeout=remaining(), maximum=MAX_SNAPSHOT_BYTES)
                match = ASSET.fullmatch(asset["name"])
                if sha256(raw).hexdigest()[:12] != match[2]:
                    raise ValueError("News snapshot digest does not match.")
                data = validate_snapshot(_json(raw), config)
                collected = timestamp(data["collected_at"])
                if collected > current + timedelta(minutes=5) or collected.strftime("%Y%m%dT%H%M%SZ") != match[1]:
                    raise ValueError("News snapshot collection time does not match.")
                return data
            except (OSError, ValueError, TypeError, subprocess.SubprocessError):
                continue
    except (OSError, ValueError, TypeError, subprocess.SubprocessError):
        pass
    print("Release news unavailable; using the checked-in seed.", file=sys.stderr)
    # Ignore any externally supplied build override when selecting a trusted seed.
    seed = Path(root) / SEED_PATH
    return validate_snapshot(_read_json(seed), config) if seed.exists() else {"version": 1, "collected_at": None, "items": []}


def publish_snapshot(path, root=ROOT, *, gh=_gh):
    if (os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != REPOSITORY
            or os.environ.get("GITHUB_REF") != "refs/heads/main"):
        raise ValueError("News publication is restricted to the trusted main-branch Actions workflow.")
    config = load_sources(root)
    data = validate_snapshot(_read_json(path), config)
    if not data["items"] or abs((_now() - timestamp(data["collected_at"])).total_seconds()) > 3600:
        raise ValueError("Only a fresh successful collection can be published.")
    raw = snapshot_bytes(data, config)
    name = "news-" + timestamp(data["collected_at"]).strftime("%Y%m%dT%H%M%SZ") + "-" + sha256(raw).hexdigest()[:12] + ".json"
    try:
        release = _release(gh)
    except FileNotFoundError:
        gh(["release", "create", RELEASE, "--repo", REPOSITORY, "--target", "main", "--prerelease", "--latest=false",
            "--title", "News data snapshots", "--notes", "Validated source headlines for the personal site. Generated data; no source commits."])
        release = _release(gh)
    if release.get("immutable"):
        raise ValueError("The news-data release must allow updating data attachments.")
    if name not in {asset["name"] for asset in _assets(release)}:
        with tempfile.TemporaryDirectory(prefix="news-publish-") as folder:
            upload = Path(folder) / name
            upload.write_bytes(raw)
            gh(["release", "upload", RELEASE, str(upload), "--repo", REPOSITORY], timeout=30)
    # A failed upload never reaches cleanup. Keep old snapshots until new upload is verified.
    assets = _assets(_release(gh))
    if name not in {asset["name"] for asset in assets}:
        raise ValueError("New news attachment was not confirmed; old snapshots retained.")
    for asset in assets[KEEP_SNAPSHOTS:]:
        try:
            gh(["api", "--method", "DELETE", f"repos/{REPOSITORY}/releases/assets/{asset['id']}"])
        except (OSError, subprocess.SubprocessError):
            print("Old news attachment retained after cleanup failure.", file=sys.stderr)
    return name


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("collect", "restore", "validate", "publish"))
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--archive-output", type=Path)
    parser.add_argument("--github-output", type=Path,
                        help="Append archive_capture_ready only after a successful archive write to the step's GITHUB_OUTPUT.")
    args = parser.parse_args(argv)
    config = load_sources(args.root)
    if args.command in {"collect", "restore"}:
        if args.output is None:
            parser.error("collect/restore require --output")
        if args.command == "collect":
            captured = []
            try:
                data, report = collect_snapshot(config, archive_sink=captured if args.archive_output else None)
            finally:
                if captured:
                    try:
                        import news_archive as archive
                        archive.write_capture(args.archive_output, captured[0], config)
                        if args.github_output:
                            # This file is unique to the Actions step. A missing
                            # flag means an old capture must not be consumed.
                            output = _safe_path(args.github_output)
                            with output.open("a", encoding="utf-8", newline="\n") as stream:
                                stream.write("archive_capture_ready=true\n")
                    except (OSError, ValueError, TypeError) as error:
                        _archive_warning(error)
            for source in report:
                print(json.dumps(source, ensure_ascii=False))
        else:
            data = restore_snapshot(args.root)
        write_snapshot(args.output, data, config)
        print(f"Validated {len(data['items'])} original-source news links.")
    elif args.command == "validate":
        if args.input is None:
            parser.error("validate requires --input")
        validate_snapshot(_read_json(args.input), config)
    else:
        if args.input is None:
            parser.error("publish requires --input")
        print(publish_snapshot(args.input, args.root))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, TypeError, subprocess.SubprocessError) as error:
        print(f"News operation failed ({type(error).__name__}); previous snapshot was not replaced.", file=sys.stderr)
        raise SystemExit(1)
