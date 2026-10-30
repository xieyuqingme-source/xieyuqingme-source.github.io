"""Bounded offline headline archive. Network publishing is an explicit Actions command.

Archive captures are separate from the bounded public Release snapshot. They
contain only headlines, source metadata and times, never article bodies.
"""
import argparse
import base64
from collections import Counter
from copy import deepcopy
from datetime import date, datetime, timedelta
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

import news_snapshot as news


VERSION = 1
BRANCH = "news-archive"
MAX_PER_SOURCE = 30
MAX_CAPTURE_BYTES = 512 * 1024
MAX_DAY_BYTES = 1024 * 1024
MAX_DAY_ITEMS = 2000
MAX_DAY_RUNS = 200
DAY = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
ITEM_FIELDS = {"id", "title", "url", "canonical_url", "source_id", "publisher", "source", "category", "lang",
               "published", "first_seen", "last_seen", "archive_date", "date_basis", "origin"}
RUN_FIELDS = {"id", "collected_at", "origin", "sources", "displayed_ids", "display_status"}
SOURCE_FIELDS = {"source_id", "status", "received", "archived", "eligible", "reason"}
ORIGINS = {"rss", "release-import", "legacy-manual"}


def utc(value):
    result = news.timestamp(value)
    if news._stamp(result) != value:
        raise ValueError("Archive timestamps must be UTC ISO seconds with Z.")
    return result


def day_value(value):
    if not isinstance(value, str) or not DAY.fullmatch(value):
        raise ValueError("Archive dates must be YYYY-MM-DD.")
    return date.fromisoformat(value)


def beijing_day(value):
    return utc(value).astimezone(news.CHINA).date().isoformat()


def frozen(value, now):
    return (now.astimezone(news.CHINA).date() - day_value(value)).days > 3


def _digest(prefix, value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return prefix + sha256(raw).hexdigest()[:20]


def _published(value, collected):
    if value is None or not isinstance(value, str) or not value.strip():
        return None, "first-seen-missing"
    try:
        stamp = news.timestamp(value)
    except (ValueError, TypeError, OverflowError):
        return None, "first-seen-invalid"
    if stamp > collected:
        return news._stamp(stamp), "first-seen-future"
    return news._stamp(stamp), "published"


def archive_item(item, source, collected, *, origin="rss"):
    """Convert a validated public title/link plus optional time to archive metadata."""
    observed = news._stamp(collected)
    title = news._text(item["title"])
    url = news.public_url(item["url"], news.article_hosts(source))
    canonical = news.url_key(url)
    published, basis = _published(item.get("published"), collected)
    bucket = beijing_day(published if basis == "published" else observed)
    return dict(id="news-" + sha256(canonical.encode("utf-8")).hexdigest()[:20], title=title, url=url,
                canonical_url=canonical, source_id=source["id"], publisher=source["publisher"], source=source["name"],
                category=source["category"], lang=source["lang"], published=published, first_seen=observed,
                last_seen=observed, archive_date=bucket, date_basis=basis, origin=origin)


def make_capture(items, report, collected, displayed_ids, *, origin="rss"):
    stamp = news._stamp(collected)
    run = dict(collected_at=stamp, origin=origin, sources=report, displayed_ids=displayed_ids,
               display_status="fresh" if displayed_ids is not None else "not-updated")
    run["id"] = _digest("run-", run)
    return dict(version=VERSION, collected_at=stamp, origin=origin, items=items, run=run)


def _validate_legacy(legacy, *, stored=False):
    if not isinstance(legacy, dict) or set(legacy) != {"edition_date", "entries"}:
        raise ValueError("Legacy annotations must retain their manual edition provenance.")
    day_value(legacy["edition_date"])
    maximum = 60 if stored else 30  # Two reviewed editions, at most thirty notes each.
    if not isinstance(legacy["entries"], list) or not 1 <= len(legacy["entries"]) <= maximum:
        raise ValueError("Legacy provenance must retain its manual headline variants.")
    fields = {"id", "title", "title_en", "published_original"}
    for entry in legacy["entries"]:
        if not isinstance(entry, dict) or set(entry) not in (fields, fields | {"edition_date"}):
            raise ValueError("Invalid legacy title provenance.")
        if "edition_date" in entry:
            if not stored:
                raise ValueError("Capture entries cannot supply merged legacy annotations.")
            day_value(entry["edition_date"])
        news._text(entry["id"], 100)
        news._text(entry["title"])
        news._text(entry["title_en"])
        if entry["published_original"] is not None:
            news._text(entry["published_original"], 100)


def _validate_item(item, config=None, *, stored=False):
    if not isinstance(item, dict) or set(item) not in (ITEM_FIELDS, ITEM_FIELDS | {"legacy"}):
        raise ValueError("Archive item needs exact headline metadata fields.")
    if item["origin"] not in ORIGINS:
        raise ValueError("Unknown archive item origin.")
    if "legacy" in item:
        _validate_legacy(item["legacy"], stored=stored)
        if item["origin"] != "legacy-manual" and not stored:
            raise ValueError("RSS and Release capture inputs cannot claim legacy annotations.")
    elif item["origin"] == "legacy-manual":
        raise ValueError("Legacy entries must retain their edition provenance.")
    news._text(item["title"])
    for field in ("source", "publisher", "source_id"):
        news._text(item[field], 100)
    if not news.SLUG.fullmatch(item["source_id"]) or not news.SLUG.fullmatch(item["publisher"]):
        raise ValueError("Archive source and publisher need stable slugs.")
    categories = (*news.CATEGORIES, "business", "culture") if item["origin"] == "legacy-manual" else news.CATEGORIES
    if item["category"] not in categories or item["lang"] not in {"zh-CN", "zh-Hant", "en"}:
        raise ValueError("Unsupported archive category or language.")
    allowed = None
    if item["origin"] != "legacy-manual" and config is not None:
        source = next((s for s in config["sources"] if s["id"] == item["source_id"]), None)
        if source is None or (item["publisher"], item["source"], item["category"], item["lang"]) != (
                source["publisher"], source["name"], source["category"], source["lang"]):
            raise ValueError("Archive source metadata does not match the allowlist.")
        allowed = news.article_hosts(source)
    url = news.public_url(item["url"], allowed)
    if url != item["url"] or news.url_key(url) != item["canonical_url"]:
        raise ValueError("Archive URLs must use the reviewed canonical rule.")
    expected = "news-" + sha256(item["canonical_url"].encode("utf-8")).hexdigest()[:20]
    if item["id"] != expected:
        raise ValueError("Archive ID does not match canonical URL.")
    first, last = utc(item["first_seen"]), utc(item["last_seen"])
    if first > last:
        raise ValueError("Archive observation range is reversed.")
    published = utc(item["published"]) if item["published"] is not None else None
    basis = item["date_basis"]
    if basis == "published":
        if published is None or published > first:
            raise ValueError("Published-bucket items need a valid past publication time.")
        expected_day = beijing_day(item["published"])
    elif basis in {"first-seen-missing", "first-seen-invalid", "first-seen-future"}:
        if (basis == "first-seen-future") != (published is not None):
            raise ValueError("Invalid fallback publication metadata.")
        if published is not None and published <= first:
            raise ValueError("Future publication reason must refer to a future time.")
        expected_day = beijing_day(item["first_seen"])
    elif basis == "legacy-edition" and item["origin"] == "legacy-manual":
        expected_day = item["legacy"]["edition_date"]
    else:
        raise ValueError("Unknown archive date basis.")
    day_value(item["archive_date"])
    if item["archive_date"] != expected_day:
        raise ValueError("Archive bucket does not match its declared date basis.")
    return item


def _validate_run(run):
    if not isinstance(run, dict) or set(run) not in (RUN_FIELDS, RUN_FIELDS | {"archive_result"}) or run["origin"] not in ORIGINS:
        raise ValueError("Archive run needs exact collection metadata.")
    utc(run["collected_at"])
    body = {key: value for key, value in run.items() if key not in {"id", "archive_result"}}
    if run["id"] != _digest("run-", body):
        raise ValueError("Archive run ID does not match its metadata.")
    if run["display_status"] not in {"fresh", "not-updated", "legacy-manual", "imported"}:
        raise ValueError("Unknown snapshot display state.")
    ids = run["displayed_ids"]
    if ids is None:
        if run["display_status"] != "not-updated":
            raise ValueError("Unknown displayed IDs need an unchanged-snapshot state.")
    elif (not isinstance(ids, list) or len(ids) > 24 or len(set(ids)) != len(ids)
          or any(not isinstance(value, str) or not re.fullmatch(r"news-[a-f0-9]{20}", value) for value in ids)):
        raise ValueError("A run may reference at most twenty-four displayed headlines.")
    if "archive_result" in run:
        result = run["archive_result"]
        if not isinstance(result, dict) or set(result) != {"stored_ids", "frozen_ids"}:
            raise ValueError("Archive merge results need stored and frozen ID lists.")
        seen_result = set()
        for key in ("stored_ids", "frozen_ids"):
            values = result[key]
            if (not isinstance(values, list) or len(values) > 30 * MAX_PER_SOURCE
                    or any(not isinstance(value, str) or not re.fullmatch(r"news-[a-f0-9]{20}", value) for value in values)
                    or len(set(values)) != len(values) or seen_result.intersection(values)):
                raise ValueError("Archive merge IDs must be valid, unique and disjoint.")
            seen_result.update(values)
    if not isinstance(run["sources"], list) or len(run["sources"]) > 30:
        raise ValueError("Archive run source report is too large.")
    seen = set()
    for source in run["sources"]:
        if not isinstance(source, dict) or set(source) != SOURCE_FIELDS:
            raise ValueError("Invalid archive source status.")
        if not isinstance(source["source_id"], str) or not news.SLUG.fullmatch(source["source_id"]) or source["source_id"] in seen:
            raise ValueError("Duplicate or invalid archive source report.")
        seen.add(source["source_id"])
        if source["status"] not in {"ok", "failed", "unknown"}:
            raise ValueError("Unknown archive source status.")
        if source["status"] == "unknown" and run["origin"] == "rss":
            raise ValueError("Live collection cannot invent an unknown source result.")
        for key in ("received", "archived", "eligible"):
            value = source[key]
            if value is None:
                if source["status"] != "unknown":
                    raise ValueError("Live collection needs source counts.")
            elif type(value) is not int or not 0 <= value <= (MAX_PER_SOURCE if key == "archived" else 1000):
                raise ValueError("Archive source count exceeds its bound.")
        if source["received"] is not None and (
                source["eligible"] is not None and source["received"] < source["eligible"]
                or source["archived"] is not None and source["received"] < source["archived"]):
            raise ValueError("Source received count cannot be smaller than eligible or captured counts.")
        if source["reason"] is not None and (not isinstance(source["reason"], str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,63}", source["reason"])):
            raise ValueError("Source errors may contain only a safe exception type.")
    return run


def validate_capture(capture, config=None):
    if (not isinstance(capture, dict) or set(capture) != {"version", "collected_at", "origin", "items", "run"}
            or type(capture["version"]) is not int or capture["version"] != VERSION or capture["origin"] not in ORIGINS):
        raise ValueError("Archive capture needs version 1.")
    observed = utc(capture["collected_at"])
    if not isinstance(capture["run"], dict) or set(capture["run"]) != RUN_FIELDS:
        raise ValueError("Capture inputs cannot supply writer-generated archive results.")
    _validate_run(capture["run"])
    if (capture["run"]["collected_at"] != capture["collected_at"] or capture["run"]["origin"] != capture["origin"]
            or not isinstance(capture["items"], list) or len(capture["items"]) > 30 * MAX_PER_SOURCE):
        raise ValueError("Inconsistent archive capture.")
    seen, counts = set(), Counter()
    for item in capture["items"]:
        _validate_item(item, config)
        if item["id"] in seen or item["origin"] != capture["origin"] or utc(item["last_seen"]) > observed:
            raise ValueError("Duplicate or inconsistent archive capture item.")
        seen.add(item["id"])
        counts[item["source_id"]] += 1
        if counts[item["source_id"]] > MAX_PER_SOURCE:
            raise ValueError("A source may archive at most thirty entries per run.")
    if capture["run"]["display_status"] in {"fresh", "imported"} and not set(capture["run"]["displayed_ids"]).issubset(seen):
        raise ValueError("Displayed IDs must refer to headlines present in the capture.")
    reports = {s["source_id"]: s for s in capture["run"]["sources"]}
    if any(source not in reports for source in counts):
        raise ValueError("Each archived source needs a matching run result.")
    for source_id, report in reports.items():
        if report["archived"] != counts[source_id]:
            raise ValueError("Source archived count must match the captured headlines.")
        if report["status"] == "failed" and (report["received"] != 0 or report["eligible"] != 0 or counts[source_id]):
            raise ValueError("A failed source cannot invent received headlines.")
    if config is not None and capture["origin"] in {"rss", "release-import"}:
        expected_sources = news.active_sources(config) if capture['origin'] == 'rss' else config['sources']
        if set(reports) != {s["id"] for s in expected_sources}:
            raise ValueError("A capture needs a result for every configured source.")
    return capture


def capture_bytes(capture, config=None):
    validate_capture(capture, config)
    raw = (json.dumps(capture, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if len(raw) > MAX_CAPTURE_BYTES:
        raise ValueError("Archive capture is too large.")
    return raw


def _atomic_write(path, raw):
    path = news._safe_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".archive-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_capture(path, capture, config=None):
    raw = capture_bytes(capture, config)
    if Path(path).suffix != ".json":
        raise ValueError("Archive capture output must be JSON.")
    _atomic_write(path, raw)


def empty_day(day):
    day_value(day)
    return dict(version=VERSION, date=day, timezone="Asia/Shanghai", items=[], runs=[])


def validate_day(data):
    if (not isinstance(data, dict) or set(data) != {"version", "date", "timezone", "items", "runs"}
            or type(data["version"]) is not int or data["version"] != VERSION or data["timezone"] != "Asia/Shanghai"):
        raise ValueError("Archive day needs version 1 and a Beijing date.")
    day_value(data["date"])
    if not isinstance(data["items"], list) or len(data["items"]) > MAX_DAY_ITEMS or not isinstance(data["runs"], list) or len(data["runs"]) > MAX_DAY_RUNS:
        raise ValueError("Archive day exceeds collection bounds.")
    seen = set()
    for item in data["items"]:
        _validate_item(item, stored=True)
        if item["archive_date"] != data["date"] or item["id"] in seen:
            raise ValueError("An archive day contains a duplicate or misplaced item.")
        seen.add(item["id"])
    seen.clear()
    for run in data["runs"]:
        _validate_run(run)
        run_day = beijing_day(run["collected_at"])
        if run["origin"] != "legacy-manual" and run_day != data["date"]:
            raise ValueError("Archive runs belong to their collection day.")
        if run["id"] in seen:
            raise ValueError("Duplicate archive run.")
        seen.add(run["id"])
    return data


def day_bytes(data):
    validate_day(data)
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    items = sorted(data["items"], key=lambda i: (i["first_seen"], i["id"]))
    runs = sorted(data["runs"], key=lambda r: (r["collected_at"], r["id"]))
    raw = ('{\n  "version":1,\n  "date":' + compact(data["date"]) + ',\n  "timezone":"Asia/Shanghai",\n  "items":[\n'
           + ",\n".join("    " + compact(item) for item in items) + '\n  ],\n  "runs":[\n'
           + ",\n".join("    " + compact(run) for run in runs) + '\n  ]\n}\n').encode("utf-8")
    if len(raw) > MAX_DAY_BYTES:
        raise ValueError("Archive day exceeds the one MiB file limit.")
    return raw


def relative_path(day):
    parsed = day_value(day)
    return Path("archive") / f"{parsed.year:04d}" / f"{parsed.month:02d}" / f"{day}.json"


def _legacy_annotation(primary, *items):
    """Preserve manual corroboration independently of the winning RSS metadata."""
    entries = {}
    for item in items:
        legacy = item.get("legacy")
        if legacy is None:
            continue
        for entry in legacy["entries"]:
            edition = entry.get("edition_date", legacy["edition_date"])
            value = {k: v for k, v in entry.items() if k != "edition_date"}
            key = (edition, json.dumps(value, sort_keys=True, ensure_ascii=False))
            entries[key] = value
    if not entries:
        return None
    # A manual primary keeps its own edition bucket. RSS/Release primaries use
    # the earliest annotation date. An entry from another edition carries its
    # own date, while old single-edition annotations retain their v1 shape.
    edition = primary["legacy"]["edition_date"] if primary["date_basis"] == "legacy-edition" else min(key[0] for key in entries)
    result = []
    for (entry_edition, _), value in sorted(entries.items()):
        value = deepcopy(value)
        if entry_edition != edition:
            value["edition_date"] = entry_edition
        result.append(value)
    return {"edition_date": edition, "entries": result}


def merge_item(left, right):
    if left["id"] != right["id"] or left["canonical_url"] != right["canonical_url"]:
        raise ValueError("Cannot merge different canonical headline IDs.")
    # Earliest observation wins stable headline/source/bucket metadata. A lexical
    # tie-break makes two simultaneous branch updates commutative.
    key = lambda item: (item["first_seen"], json.dumps({k: v for k, v in item.items()
                                                     if k not in {"first_seen", "last_seen", "legacy"}},
                                                    sort_keys=True, ensure_ascii=False))
    result = deepcopy(min((left, right), key=key))
    result["first_seen"] = min(left["first_seen"], right["first_seen"])
    result["last_seen"] = max(left["last_seen"], right["last_seen"])
    legacy = _legacy_annotation(result, left, right)
    if legacy is not None:
        result["legacy"] = legacy
    return result


def merge_captures(archive_root, captures, *, config=None, now=None, bootstrap=False):
    """Validate an entire merge before writing; frozen existing files never change.

    bootstrap may create missing historical files during an explicit import. It
    cannot rewrite an existing frozen file. The caller controls its own checkout.
    """
    archive_root = news._safe_path(archive_root)
    current = (now or news._now()).astimezone(news.UTC).replace(microsecond=0)
    captures = list(captures)
    for capture in captures:
        validate_capture(capture, config)
        if utc(capture["collected_at"]) > current + timedelta(minutes=5):
            raise ValueError("Archive capture time is in the future.")
        if bootstrap and capture["origin"] == "rss":
            raise ValueError("Live collection cannot bypass historical freeze.")
    days, original, location, original_data = {}, {}, {}, {}
    for path in sorted((archive_root / "archive").glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.json")):
        data = validate_day(news._read_json(path, MAX_DAY_BYTES))
        if path.relative_to(archive_root) != relative_path(data["date"]):
            raise ValueError("Archive day path does not match its date.")
        days[data["date"]] = deepcopy(data)
        original[data["date"]] = path.read_bytes()
        original_data[data["date"]] = deepcopy(data)
        for item in data["items"]:
            if item["id"] in location:
                raise ValueError("An archive ID occurs in more than one day.")
            location[item["id"]] = data["date"]
    stats = dict(written=[], frozen_items=0, frozen_runs=0)
    existed = set(days)
    def mutable(day):
        return not frozen(day, current) or (bootstrap and day not in existed)
    for capture in sorted(captures, key=lambda c: (c["collected_at"], c["run"]["id"])):
        outcome = {"stored_ids": [], "frozen_ids": []}
        for incoming in capture["items"]:
            target_day = location.get(incoming["id"], incoming["archive_date"])
            if not mutable(target_day):
                stats["frozen_items"] += 1
                outcome["frozen_ids"].append(incoming["id"])
                continue
            day = days.setdefault(target_day, empty_day(target_day))
            index = next((n for n, item in enumerate(day["items"]) if item["id"] == incoming["id"]), None)
            if index is None:
                day["items"].append(deepcopy(incoming))
                location[incoming["id"]] = target_day
            else:
                merged = merge_item(day["items"][index], incoming)
                # Once placed, an item stays in that first day. Captures in the
                # normal path are chronological; imports cannot relocate it.
                if merged["archive_date"] != target_day:
                    merged = deepcopy(day["items"][index])
                    merged["last_seen"] = max(merged["last_seen"], incoming["last_seen"])
                    legacy = _legacy_annotation(merged, day["items"][index], incoming)
                    if legacy is not None:
                        merged["legacy"] = legacy
                day["items"][index] = merged
            outcome["stored_ids"].append(incoming["id"])
        run = capture["run"]
        run_day = beijing_day(run["collected_at"])
        if run["origin"] == "legacy-manual" and capture["items"]:
            run_day = capture["items"][0]["legacy"]["edition_date"]
        if not mutable(run_day):
            stats["frozen_runs"] += 1
            continue
        day = days.setdefault(run_day, empty_day(run_day))
        if run["id"] not in {r["id"] for r in day["runs"]}:
            stored_run = deepcopy(run)
            stored_run["archive_result"] = {key: sorted(values) for key, values in outcome.items()}
            day["runs"].append(stored_run)
    planned = {}
    for day, data in days.items():
        if data == original_data.get(day):
            continue
        raw = day_bytes(data)
        if raw != original.get(day):
            if not mutable(day):
                raise ValueError("A frozen archive file cannot be rewritten.")
            planned[day] = raw
    # No file or directory mutation occurs before the last validation/size check.
    for day, raw in planned.items():
        news._safe_path(archive_root / relative_path(day))
    for day, raw in sorted(planned.items()):
        _atomic_write(archive_root / relative_path(day), raw)
        stats["written"].append(day)
    return stats


def release_capture(snapshot, config):
    news.validate_snapshot(snapshot, config)
    if snapshot["collected_at"] is None:
        raise ValueError("An uncollected seed is not a historical Release snapshot.")
    collected = news.timestamp(snapshot["collected_at"])
    sources = {s["id"]: s for s in config["sources"]}
    items = [archive_item(i, sources[i["source_id"]], collected, origin="release-import") for i in snapshot["items"]]
    report = [dict(source_id=s["id"], status="unknown", received=None, archived=sum(i["source_id"] == s["id"] for i in items),
                   eligible=None, reason=None) for s in config["sources"]]
    capture = make_capture(items, report, collected, [i["id"] for i in snapshot["items"]], origin="release-import")
    capture["run"]["display_status"] = "imported"
    capture["run"]["id"] = _digest("run-", {k: v for k, v in capture["run"].items() if k != "id"})
    return validate_capture(capture, config)


def legacy_capture(data, *, now=None):
    edition = data.get("edition_date") if isinstance(data, dict) else None
    if edition not in {"2026-10-26", "2026-10-27"} or not isinstance(data.get("items"), list) or len(data["items"]) > 30:
        raise ValueError("Only the two reviewed legacy manual editions can be imported.")
    collected = (now or news._now()).astimezone(news.UTC).replace(microsecond=0)
    items = []
    for old in data["items"]:
        url = news.public_url(old["url"])
        host_slug = re.sub(r"[^a-z0-9-]", "-", urlsplit(url).hostname)
        source_id = "legacy-" + host_slug[:56]
        source_name = old["source"] if isinstance(old["source"], str) else old["source"]["zh-CN"]
        source = dict(id=source_id, publisher=source_id, name=source_name,
                      category=old.get("category", old.get("categories", ["world"])[0]), lang="zh-CN",
                      article_hosts=[urlsplit(url).hostname])
        original = old.get("published")
        try:
            parsed = datetime.fromisoformat(original.replace("Z", "+00:00")) if original else None
            published = news._stamp(parsed) if parsed and parsed.tzinfo is not None else None
        except (ValueError, TypeError):
            published = None
        item = archive_item(dict(title=old["title"]["zh-CN"], url=url, published=published), source, collected, origin="legacy-manual")
        item.update(archive_date=edition, date_basis="legacy-edition",
                    legacy=dict(edition_date=edition, entries=[dict(id=old["id"], title=old["title"]["zh-CN"],
                                title_en=old["title"]["en"], published_original=original)]))
        duplicate = next((i for i in items if i["id"] == item["id"]), None)
        if duplicate is not None:
            duplicate["legacy"]["entries"].extend(item["legacy"]["entries"])
        else:
            items.append(item)
    report = [dict(source_id=s, status="unknown", received=None, archived=sum(i["source_id"] == s for i in items),
                   eligible=None, reason=None) for s in sorted({i["source_id"] for i in items})]
    capture = make_capture(items, report, collected, [i["id"] for i in items][:8], origin="legacy-manual")
    capture["run"]["display_status"] = "legacy-manual"
    capture["run"]["id"] = _digest("run-", {k: v for k, v in capture["run"].items() if k != "id"})
    return validate_capture(capture)


def _trusted_actions():
    if (os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != news.REPOSITORY
            or os.environ.get("GITHUB_REF") != "refs/heads/main"):
        raise ValueError("Archive publication requires the trusted main-branch Actions workflow.")


def release_captures(config, *, gh=news._gh, now=None):
    """Manual historical import only: validate every downloaded asset first."""
    _trusted_actions()
    current = now or news._now()
    captures = []
    for asset in reversed(news._assets(news._release(gh))[:news.KEEP_SNAPSHOTS]):
        raw = gh(["api", "-H", "Accept: application/octet-stream",
                  f"repos/{news.REPOSITORY}/releases/assets/{asset['id']}"],
                 timeout=news.REQUEST_TIMEOUT, maximum=news.MAX_SNAPSHOT_BYTES)
        match = news.ASSET.fullmatch(asset["name"])
        if len(raw) != asset["size"] or sha256(raw).hexdigest()[:12] != match[2]:
            raise ValueError("A historical Release snapshot has an invalid digest or size.")
        snapshot = news.validate_snapshot(news._json(raw), config)
        collected = news.timestamp(snapshot["collected_at"])
        if collected > current + timedelta(minutes=5) or collected.strftime("%Y%m%dT%H%M%SZ") != match[1]:
            raise ValueError("Historical Release collection time does not match its asset.")
        captures.append(release_capture(snapshot, config))
    return captures


def _git(arguments, *, cwd, check=True):
    """Never print git stderr or put the token in a command line or remote URL."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise ValueError("Archive publishing needs the workflow token.")
    env = os.environ.copy()
    env.update(GIT_TERMINAL_PROMPT="0", GIT_CONFIG_COUNT="1",
               GIT_CONFIG_KEY_0="http.https://github.com/.extraheader",
               GIT_CONFIG_VALUE_0="AUTHORIZATION: basic " + base64.b64encode(("x-access-token:" + token).encode()).decode())
    result = subprocess.run(["git", *arguments], cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=45, check=False)
    if check and result.returncode:
        raise OSError("Archive git operation failed; details withheld.")
    return result.returncode


def publish_archive(capture, root=news.ROOT, *, import_releases=False, gh=news._gh, git=_git, now=None):
    """Future workflow entry point. It is never invoked by build or local checks.

    A temporary repository contains only the orphan archive branch. Each retry
    fetches the latest tip, merges by canonical ID, and uses a normal push.
    """
    _trusted_actions()
    config = news.load_sources(root)
    validate_capture(capture, config)
    current = (now or news._now()).astimezone(news.UTC).replace(microsecond=0)
    if capture["origin"] != "rss" or abs((current - utc(capture["collected_at"])).total_seconds()) > 3600:
        raise ValueError("Only a fresh live capture can enter normal archive publication.")
    historical = release_captures(config, gh=gh, now=current) if import_releases else []
    legacy = [legacy_capture(news._read_json(Path(root) / f"home/brief/news/{d}.json"), now=current)
              for d in ("2026-10-26", "2026-10-27")]
    # Validate all potential imports before creating even the temporary checkout.
    for item in [capture, *historical, *legacy]:
        validate_capture(item, config)
    with tempfile.TemporaryDirectory(prefix="news-archive-") as folder:
        checkout = Path(folder)
        git(["init", "--quiet"], cwd=checkout)
        git(["remote", "add", "origin", f"https://github.com/{news.REPOSITORY}.git"], cwd=checkout)
        for attempt in range(3):
            try:
                reference = news._json(gh(["api", f"repos/{news.REPOSITORY}/git/ref/heads/{BRANCH}"]))
                if not isinstance(reference, dict) or not re.fullmatch(r"[a-f0-9]{40}", reference.get("object", {}).get("sha", "")):
                    raise ValueError("Archive branch has an invalid remote reference.")
                exists = True
            except FileNotFoundError:
                exists = False
            if exists:
                git(["fetch", "--quiet", "--depth=1", "origin", f"refs/heads/{BRANCH}"], cwd=checkout)
                git(["checkout", "--quiet", "-B", BRANCH, "FETCH_HEAD"], cwd=checkout)
            elif attempt == 0:
                git(["checkout", "--quiet", "--orphan", BRANCH], cwd=checkout)
            else:
                raise OSError("Archive branch remains unavailable after a rejected push.")
            if any(path.name not in {".git", "archive", "archive-meta.json"} for path in checkout.iterdir()):
                raise ValueError("Archive branch must contain only isolated archive data.")
            marker = checkout / "archive-meta.json"
            meta = news._read_json(marker) if marker.exists() else {"version": 1, "legacy_imported_at": None, "release_imported_at": None}
            if (not isinstance(meta, dict) or set(meta) != {"version", "legacy_imported_at", "release_imported_at"}
                    or type(meta["version"]) is not int or meta["version"] != 1):
                raise ValueError("Invalid archive import marker.")
            for key in ("legacy_imported_at", "release_imported_at"):
                if meta[key] is not None:
                    utc(meta[key])
            imports = [*historical, *(legacy if meta["legacy_imported_at"] is None else [])]
            reports = []
            if imports:
                reports.append(merge_captures(checkout, imports, config=config, now=current, bootstrap=True))
            reports.append(merge_captures(checkout, [capture], config=config, now=current))
            if meta["legacy_imported_at"] is None:
                meta["legacy_imported_at"] = news._stamp(current)
            if import_releases:
                meta["release_imported_at"] = news._stamp(current)
            _atomic_write(marker, (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
            git(["add", "--all", "--", "archive", "archive-meta.json"], cwd=checkout)
            status = git(["diff", "--cached", "--quiet"], cwd=checkout, check=False)
            if status == 0:
                return dict(status="unchanged", attempts=attempt + 1, merges=reports)
            if status != 1:
                raise OSError("Archive staged-diff check failed.")
            git(["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                 "commit", "--quiet", "-m", "Archive original-source headlines " + capture["collected_at"]], cwd=checkout)
            if git(["push", "--quiet", "origin", f"HEAD:refs/heads/{BRANCH}"], cwd=checkout, check=False) == 0:
                return dict(status="published", attempts=attempt + 1, merges=reports)
        raise OSError("Archive push was rejected after three merge attempts; no force push was attempted.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("merge", "legacy", "validate", "publish"))
    parser.add_argument("--root", type=Path, default=news.ROOT)
    parser.add_argument("--capture", type=Path, action="append", default=[])
    parser.add_argument("--archive-dir", type=Path)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--bootstrap", action="store_true")
    parser.add_argument("--import-releases", action="store_true")
    args = parser.parse_args(argv)
    config = news.load_sources(args.root)
    if args.command == "merge":
        if not args.archive_dir or not args.capture:
            parser.error("merge needs --archive-dir and --capture")
        captures = [news._read_json(p, MAX_CAPTURE_BYTES) for p in args.capture]
        print(json.dumps(merge_captures(args.archive_dir, captures, config=config, bootstrap=args.bootstrap)))
    elif args.command == "legacy":
        if not args.input or not args.output:
            parser.error("legacy needs --input and --output")
        write_capture(args.output, legacy_capture(news._read_json(args.input)), config)
    elif args.command == "publish":
        _trusted_actions()
        if len(args.capture) != 1:
            parser.error("publish needs exactly one --capture")
        print(json.dumps(publish_archive(news._read_json(args.capture[0], MAX_CAPTURE_BYTES), args.root,
                                         import_releases=args.import_releases)))
    else:
        if not args.input:
            parser.error("validate needs --input")
        validate_day(news._read_json(args.input, MAX_DAY_BYTES))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError) as error:
        print(f"Archive operation failed ({type(error).__name__}); data was not published.", file=sys.stderr)
        raise SystemExit(1)
