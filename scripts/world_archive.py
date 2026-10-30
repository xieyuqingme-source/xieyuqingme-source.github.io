"""Read-only local news-archive models for the Chinese World pages.

The caller supplies a local checkout explicitly. This module never discovers,
fetches or publishes a branch, and never treats generated snapshot IDs as proof
of a Pages deployment. Corrupt or unavailable archives have one fixed message.
"""
from calendar import monthrange
from copy import deepcopy
from datetime import date, datetime, timedelta
from pathlib import Path
import re

import news_archive as archive
import news_snapshot as news


UNAVAILABLE = "存档暂不可用"
ORIGIN_LABELS = {"rss": "自动采集", "release-import": "历史快照导入", "legacy-manual": "旧人工样刊"}
DATE_LABELS = {
    "published": "按原文发布时间的北京日期归档",
    "first-seen-missing": "原文发布时间缺失，按首次观测的北京日期归档",
    "first-seen-invalid": "原文没有有效的完整发布时间，按首次观测的北京日期归档",
    "first-seen-future": "原文发布时间晚于采集，按首次观测的北京日期归档",
    "legacy-edition": "按旧人工样刊日期归档，不代表当日自动采集",
}
STATUS_LABELS = {
    "ok": "已记录的自动采集均成功",
    "partial": "已记录的自动采集有成功也有失败",
    "failed": "已记录的当日自动采集全部失败",
    "imported": "历史快照导入，逐源采集结果未知",
    "manual": "旧人工样刊，不作为当日自动采集记录",
    "historical-mixed": "含旧人工样刊和历史快照，逐源采集结果未知",
    "unrecorded": "未记录完整的当日自动采集结果，不能推断成败",
    "empty": "该日存档为空，未记录采集结果",
}


def _instant(value=None):
    value = news._now() if value is None else value
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("World archive models need a timezone-aware datetime.")
    return value.astimezone(news.UTC).replace(microsecond=0)


def _day(value):
    if isinstance(value, datetime):
        return _instant(value).astimezone(news.CHINA).date()
    if isinstance(value, date):
        return value
    return archive.day_value(value)


def _month(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}", value):
        raise ValueError("World archive months need YYYY-MM.")
    parsed = date.fromisoformat(value + "-01")
    return parsed.year, parsed.month


def day_url(value):
    parsed = _day(value)
    return f"/world/{parsed.year:04d}/{parsed.month:02d}/{parsed.day:02d}/"


def month_url(value):
    year, month = _month(value)
    return f"/world/{year:04d}/{month:02d}/"


def _unavailable(now):
    return {"available": False, "has_data": False, "message": UNAVAILABLE, "as_of": news._stamp(now),
            "today": now.astimezone(news.CHINA).date().isoformat(), "dates": [], "months": [], "days": {}, "source_names": {}}


def load_archive(archive_root, *, now=None):
    """Validate the explicit local archive entirely before exposing any data.

    archive_root contains archive/YYYY/MM/YYYY-MM-DD.json, not a feed or a
    Release capture. Missing, empty, unsafe or corrupt input returns unavailable;
    an existing valid day with zero items remains available and is kept.
    """
    current = _instant(now)
    result = _unavailable(current)
    if archive_root is None:
        return result
    try:
        root = news._safe_path(archive_root)
        directory = news._safe_path(root / "archive")
        if not directory.is_dir():
            return result
        days, item_locations, run_ids, source_names = {}, {}, set(), {}
        for year in sorted(directory.iterdir()):
            news._safe_path(year)
            if not re.fullmatch(r"\d{4}", year.name):
                continue
            if not year.is_dir():
                raise ValueError("Invalid archive year directory.")
            for month in sorted(year.iterdir()):
                news._safe_path(month)
                if not re.fullmatch(r"\d{2}", month.name):
                    continue
                if not month.is_dir():
                    raise ValueError("Invalid archive month directory.")
                for path in sorted(month.iterdir()):
                    path = news._safe_path(path)
                    if path.suffix != ".json":
                        continue
                    data = archive.validate_day(news._read_json(path, archive.MAX_DAY_BYTES))
                    stamp = data["date"]
                    if path.relative_to(root) != archive.relative_path(stamp) or stamp in days:
                        raise ValueError("Archive date and local file path disagree.")
                    for item in data["items"]:
                        if item["id"] in item_locations:
                            raise ValueError("An archive headline occurs in multiple day files.")
                        item_locations[item["id"]] = stamp
                        source_names.setdefault(item["source_id"], item["source"])
                    for run in data["runs"]:
                        if run["id"] in run_ids:
                            raise ValueError("An archive run occurs in multiple day files.")
                        run_ids.add(run["id"])
                    data = deepcopy(data)
                    data["items"].sort(key=lambda item: (item["first_seen"], item["id"]))
                    data["runs"].sort(key=lambda run: (run["collected_at"], run["id"]))
                    days[stamp] = data
        dates = sorted(days)
        return {**result, "available": True, "has_data": bool(days), "message": "" if days else "尚无存档数据", "dates": dates,
                "months": sorted({stamp[:7] for stamp in dates}), "days": days, "source_names": source_names}
    except (OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError):
        # Do not expose exception text, a local path, feed data or a partial index.
        return result


def _run_view(run, store):
    manual = run["origin"] == "legacy-manual"
    sources = [{"source_id": source["source_id"], "source": store["source_names"].get(source["source_id"], source["source_id"]),
                "status": source["status"], "status_label": {"ok": "成功", "failed": "失败", "unknown": "未知"}[source["status"]],
                "received": source["received"], "eligible": source["eligible"], "captured": source["archived"], "reason": source["reason"]}
               for source in run["sources"]]
    return {"id": run["id"], "recorded_at": run["collected_at"], "recorded_beijing_date": archive.beijing_day(run["collected_at"]),
            "origin": run["origin"], "origin_label": ORIGIN_LABELS[run["origin"]], "sources": sources,
            "snapshot_state": run["display_status"], "generated_snapshot_ids": None if manual else deepcopy(run["displayed_ids"]),
            "manual_edition_ids": deepcopy(run["displayed_ids"]) if manual else None,
            "snapshot_note": "旧人工样刊条目，不代表网站部署" if manual else "这些ID只记录生成的显示快照，不代表页面实际部署",
            "archive_result": deepcopy(run.get("archive_result"))}


def _collection(data):
    runs, items = data["runs"], data["items"]
    live = [run for run in runs if run["origin"] == "rss"]
    live_sources = [source for run in live for source in run["sources"]]
    ok = sum(source["status"] == "ok" for source in live_sources)
    failed = sum(source["status"] == "failed" for source in live_sources)
    origins = sorted({item["origin"] for item in items} | {run["origin"] for run in runs})
    historical = set(origins) & {"legacy-manual", "release-import"}
    if live_sources:
        status = "partial" if ok and failed else "ok" if ok else "failed"
    elif historical == {"legacy-manual", "release-import"}:
        status = "historical-mixed"
    elif "release-import" in historical:
        status = "imported"
    elif "legacy-manual" in historical:
        status = "manual"
    else:
        status = "unrecorded" if items or runs else "empty"
    # These are observation counts, not unique headlines in this publication-day
    # bucket. Older v1 files may not have recorded writer outcomes at all.
    counts = [source["archived"] for run in runs for source in run["sources"]]
    captured = sum(counts) if runs and all(value is not None for value in counts) else None
    outcomes_known = bool(runs) and all("archive_result" in run for run in runs)
    return {"status": status, "label": STATUS_LABELS[status], "run_count": len(runs), "live_run_count": len(live),
            "manual_run_count": sum(run["origin"] == "legacy-manual" for run in runs),
            "imported_run_count": sum(run["origin"] == "release-import" for run in runs),
            "live_source_successes": ok, "live_source_failures": failed,
            "unknown_source_results": sum(source["status"] == "unknown" for run in runs for source in run["sources"]),
            "captured_observations": captured,
            "stored_observations": sum(len(run["archive_result"]["stored_ids"]) for run in runs) if outcomes_known else None,
            "frozen_observations": sum(len(run["archive_result"]["frozen_ids"]) for run in runs) if outcomes_known else None,
            "latest_live_collected_at": max((run["collected_at"] for run in live), default=None), "origins": origins}


def _item_view(item, frozen):
    return {**deepcopy(item), "provenance": {
        "origin_label": ORIGIN_LABELS[item["origin"]], "date_basis_label": DATE_LABELS[item["date_basis"]],
        "manual_title": item["origin"] == "legacy-manual", "has_legacy_annotation": "legacy" in item,
        "publication_date_used": item["date_basis"] == "published", "frozen": frozen,
        "bucket_note": "首次入桶后保持原日，不因后续发布时间修订而迁桶",
    }}


def _summary(store, stamp, preview=3):
    data = store["days"][stamp]
    return {"date": stamp, "url": day_url(stamp), "item_count": len(data["items"]),
            "preview": [{"id": item["id"], "title": item["title"], "source": item["source"], "url": item["url"], "lang": item["lang"],
                         "origin": item["origin"], "origin_label": ORIGIN_LABELS[item["origin"]], "date_basis": item["date_basis"]}
                        for item in data["items"][:preview]], "collection": _collection(data)}


def day_view(store, value):
    stamp = _day(value).isoformat()
    result = {"available": store["available"], "exists": False, "message": store["message"], "date": stamp,
              "url": day_url(stamp), "month_url": month_url(stamp[:7]), "items": [], "runs": [], "collection": None,
              "frozen": None, "previous": None, "next": None, "previous_available": None, "next_available": None}
    if not store["available"]:
        return result
    if stamp not in store["days"]:
        return {**result, "message": "该日无存档"}
    parsed = _day(stamp)
    current = news.timestamp(store["as_of"])
    frozen = archive.frozen(stamp, current)
    for key, offset in (("previous", -1), ("next", 1)):
        try:
            adjacent = (parsed + timedelta(days=offset)).isoformat()
        except OverflowError:
            continue
        if adjacent in store["days"]:
            result[key] = {"date": adjacent, "url": day_url(adjacent)}
    earlier = [day for day in store["dates"] if day < stamp]
    later = [day for day in store["dates"] if day > stamp]
    if earlier:
        result["previous_available"] = {"date": earlier[-1], "url": day_url(earlier[-1])}
    if later:
        result["next_available"] = {"date": later[0], "url": day_url(later[0])}
    data = store["days"][stamp]
    return {**result, "exists": True, "message": "", "frozen": frozen, "collection": _collection(data),
            "items": [_item_view(item, frozen) for item in data["items"]], "runs": [_run_view(run, store) for run in data["runs"]]}


def month_view(store, value):
    year, month = _month(value)
    result = {"available": store["available"], "exists": False, "message": store["message"], "month": value,
              "url": month_url(value), "days": [], "item_count": 0, "recorded_days": 0}
    if not store["available"]:
        return result
    days = []
    for number in range(1, monthrange(year, month)[1] + 1):
        stamp = date(year, month, number).isoformat()
        if stamp in store["days"]:
            days.append({"exists": True, **_summary(store, stamp)})
        else:
            days.append({"date": stamp, "url": None, "exists": False, "item_count": None, "preview": [], "collection": None})
    recorded = sum(day["exists"] for day in days)
    return {**result, "exists": bool(recorded), "message": "" if recorded else "该月无存档", "days": days,
            "recorded_days": recorded, "item_count": sum(day["item_count"] or 0 for day in days)}


def month_search_index(store, value):
    _month(value)
    result = {"version": 1, "available": store["available"], "exists": False, "message": store["message"], "month": value, "items": []}
    if not store["available"]:
        return result
    dates = [stamp for stamp in store["dates"] if stamp[:7] == value]
    entries = []
    for stamp in dates:
        for item in store["days"][stamp]["items"]:
            titles = [item["title"]]
            for note in item.get("legacy", {}).get("entries", []):
                titles.extend((note["title"], note["title_en"]))
            entries.append({"id": item["id"], "date": stamp, "title": item["title"], "source": item["source"],
                            "url": item["url"], "day_url": day_url(stamp), "lang": item["lang"], "origin": item["origin"],
                            "date_basis": item["date_basis"], "search_titles": list(dict.fromkeys(titles))})
    return {**result, "exists": bool(dates), "message": "" if dates else "该月无存档", "items": entries}


def recent_days(store, *, end=None, days=7):
    """Existing dates inside a strict civil-day window, newest first, without fill."""
    if type(days) is not int or not 1 <= days <= 31:
        raise ValueError("Recent archive windows need one to thirty-one days.")
    if not store["available"]:
        return []
    final = _day(store["today"] if end is None else end)
    try:
        first = final - timedelta(days=days - 1)
    except OverflowError:
        first = date.min
    return [_summary(store, stamp) for stamp in reversed(store["dates"]) if first <= _day(stamp) <= final]


def year_ago(store, *, today=None, limit=3):
    """Only an exact prior-year civil date with actual titles creates this panel."""
    if type(limit) is not int or not 1 <= limit <= 30:
        raise ValueError("Anniversary previews need one to thirty titles.")
    if not store["available"]:
        return None
    current = _day(store["today"] if today is None else today)
    try:
        stamp = current.replace(year=current.year - 1).isoformat()
    except ValueError:  # February 29 has no same date in the preceding year.
        return None
    data = store["days"].get(stamp)
    if data is None or not data["items"]:
        return None
    return {**_summary(store, stamp, preview=limit), "label": "一年前的今天"}
