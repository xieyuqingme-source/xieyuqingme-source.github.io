"""Offline Chinese World pages, built from validated local snapshots and archives."""
from calendar import monthcalendar
from datetime import datetime
from html import escape
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

from daily_brief import safe_json
import news_snapshot as news
from site_i18n import localize_page
import world_archive as world
from world_sources import DOMAINS, TYPES, LANGUAGES, approved_sources, validate_catalog


MAX_SEARCH_BYTES = 32 * 1024 * 1024
CATEGORIES = {"domestic": "国内", "world": "国际", "economy": "经济", "science": "科技", "business": "商业", "culture": "文化"}


def source_path(root, relative):
    root = news._safe_path(root)
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("World sources must remain in the public source root.")
    path = news._safe_path(root / relative)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("World sources must remain in the public source root.")
    if not path.is_file():
        raise ValueError("A required World source file is missing.")
    return path


def _destination(output, relative):
    output = news._safe_path(output)
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("World output must remain in the publication root.")
    target = news._safe_path(output / relative)
    if not target.resolve().is_relative_to(output.resolve()):
        raise ValueError("World output must remain in the publication root.")
    return target


def _link(url, title, *, language=None, class_name=None):
    external = url.startswith(("https://", "http://"))
    attributes = ' target="_blank" rel="noopener noreferrer"' if external else ''
    if language:
        attributes += ' lang="' + escape(language, quote=True) + '"'
    if class_name:
        attributes += ' class="' + escape(class_name, quote=True) + '"'
    return '<a href="' + escape(url, quote=True) + '"' + attributes + '>' + escape(str(title)) + '</a>'


def _time(value):
    if value is None:
        return "无有效的完整发布时间"
    return news.timestamp(value).astimezone(news.CHINA).strftime("%Y-%m-%d %H:%M +08:00")


def _calendar(stamp, metadata):
    data = (metadata or {}).get(stamp, {})
    if not isinstance(data, dict):
        data = {}
    readings = [data.get(key) for key in ("lunar", "term", "moon")]
    readings = [value for value in readings if isinstance(value, str) and value.strip()]
    return '<p class="world-news-meta">' + escape(" · ".join(readings) if readings else "历法读数暂不可用。") + '</p>'


def _nav(route):
    links = [("/world/", "今日"), ("/world/#archive", "往日"), ("/world/#search", "标题检索"), ("/world/sources/", "信息源")]
    return '<nav class="world-nav" aria-label="看世界页内导航">' + ''.join(_link(url, title) for url, title in links) + '</nav>'


def _heading(title, intro, route):
    return '<header class="world-intro"><p class="world-kicker">看世界</p><h1>' + escape(title) + '</h1><p>' + escape(intro) + '</p></header>' + _nav(route)


def _preview(summary):
    values = []
    for item in summary["preview"]:
        values.append('<li>' + _link(item["url"], item["title"], language=item["lang"])
                      + '<p class="world-news-meta">' + escape(item["source"] + ' · ' + item["origin_label"]) + '</p></li>')
    return '<ul class="world-day-list">' + ''.join(values) + '</ul>' if values else ''


def _legacy(item):
    legacy = item.get("legacy")
    if not legacy:
        return ''
    entries = []
    for note in legacy["entries"]:
        values = [escape(note.get("edition_date", legacy["edition_date"])) + '旧人工样刊', escape(note["title"]),
                  '<span lang="en">' + escape(note["title_en"]) + '</span>', '旧标识：' + escape(note["id"])]
        if note["published_original"] is not None:
            values.append('原样刊日期字段：' + escape(note["published_original"]))
        entries.append('<li>' + ' · '.join(values) + '</li>')
    return '<h4>旧人工样刊旁证</h4><p>以下是旧样刊的编辑标题与原日期字段，不改写主条目的来源身份，也不冒充RSS原题或精确发布时间。</p><ul>' + ''.join(entries) + '</ul>'


def _archive_item(item):
    provenance = item["provenance"]
    title = _link(item["url"], item["title"], language=item["lang"])
    metadata = [item["source"], CATEGORIES.get(item["category"], item["category"]), LANGUAGES.get(item["lang"], item["lang"]), provenance["origin_label"]]
    if item["published"] is not None:
        metadata.append('原文时间 ' + _time(item["published"]))
    details = [('归档日', item["archive_date"]), ('原文发布时间', _time(item["published"])),
               ('首次观测', _time(item["first_seen"])), ('末次观测', _time(item["last_seen"])),
               ('日期状态', '按当前北京日期已冻结' if provenance["frozen"] else '仍在可补写日期窗口')]
    explanation = '<dl>' + ''.join('<dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd>' for label, value in details) + '</dl>'
    explanation += '<p>' + escape(provenance["date_basis_label"]) + '。' + escape(provenance["bucket_note"]) + '。</p>' + _legacy(item)
    return '<li class="world-news" id="item-' + item["id"] + '"><h3>' + title + '</h3><p class="world-news-meta">' + escape(' · '.join(metadata)) + '</p><details class="world-provenance"><summary>时间与存档说明</summary>' + explanation + '</details></li>'


def _runs(view, lookup):
    blocks = ['<section class="world-section"><h2>本日文件的运行记录</h2><p>' + escape(view["collection"]["label"]) + '。</p>']
    blocks.append('<p class="world-news-meta">运行中的条数是采集观测计数，可能含其他发布日的条目，不等于本页标题数；未知结果不记为成功。</p>')
    if not view["runs"]:
        blocks.append('<p>没有该日运行记录，不能推断当日采集成败；请结合条目的首次观测与来源类型阅读。</p>')
    for run in view["runs"]:
        blocks.append('<article class="world-run"><h3>' + escape(run["origin_label"]) + ' · 记录时刻 ' + escape(_time(run["recorded_at"])) + '</h3>')
        if run["recorded_beijing_date"] != view["date"]:
            blocks.append('<p>这是旧样刊的实际导入记录，记录时刻不代表样刊日期曾自动采集。</p>')
        blocks.append('<div class="world-table-scroll" tabindex="0" aria-label="各来源真实采集结果，可横向滚动"><table><caption>各来源的真实结果</caption><thead><tr><th scope="col">来源</th><th scope="col">结果</th><th scope="col">候选</th><th scope="col">显示日期窗口内</th><th scope="col">进入采集包</th></tr></thead><tbody>')
        for source in run["sources"]:
            count = lambda value: '未知' if value is None else str(value)
            status = source["status_label"] + ('（' + source["reason"] + '）' if source["reason"] else '')
            blocks.append('<tr><th scope="row">' + escape(source["source"]) + '</th><td>' + escape(status) + '</td><td>' + count(source["received"]) + '</td><td>' + count(source["eligible"]) + '</td><td>' + count(source["captured"]) + '</td></tr>')
        blocks.append('</tbody></table></div>')
        outcome = run["archive_result"]
        blocks.append('<p class="world-news-meta">' + (f'本次接受{len(outcome["stored_ids"])}次观测，冻结拒绝{len(outcome["frozen_ids"])}次。' if outcome is not None else '本次合并接受与冻结拒绝数量未记录。') + '</p>')
        identifiers = run["manual_edition_ids"] if run["manual_edition_ids"] is not None else run["generated_snapshot_ids"]
        blocks.append('<p>' + escape(run["snapshot_note"]) + '。</p>')
        if identifiers is not None:
            blocks.append('<details><summary>' + ('旧人工样刊关联条目' if run["manual_edition_ids"] is not None else '当次生成快照的关联条目') + f'（{len(identifiers)}个标识）</summary><ul>')
            for identifier in identifiers:
                matched = lookup.get(identifier)
                text = _link(matched["day_url"] + '#item-' + identifier, '存档中的同ID条目：' + matched["title"]) if matched else escape(identifier) + '：暂无可读存档条目'
                blocks.append('<li>' + text + '</li>')
            blocks.append('</ul></details>')
        blocks.append('</article>')
    return ''.join(blocks) + '</section>'


def render_day(view, metadata, lookup):
    stamp = view["date"]
    content = _heading(stamp + ' · 当天存档', '按北京日期保存的全部标题与来源记录。', view["url"]) + _calendar(stamp, metadata)
    content += '<nav class="world-nav" aria-label="前后日">'
    for key, label in (("previous", "前一天"), ("next", "后一天")):
        neighbor = view[key]
        content += _link(neighbor["url"], label + ' ' + neighbor["date"]) if neighbor else '<span aria-disabled="true">' + label + '暂无存档</span>'
    content += _link(view["month_url"], '返回月历') + '</nav>'
    content += '<section class="world-section"><h2>全部标题</h2><p>共' + str(len(view["items"])) + '个归档条目。</p>'
    content += '<ol class="world-day-list">' + ''.join(_archive_item(item) for item in view["items"]) + '</ol>' if view["items"] else '<p>' + escape(view["collection"]["label"]) + '，本日文件没有标题。不借用别日新闻补空。</p>'
    return content + '</section>' + _runs(view, lookup)


def render_month(view):
    content = _heading(view["month"] + ' · 月历', '破折号表示缺日；0表示确有日文件但没有标题。', view["url"])
    content += '<section class="world-section"><h2>逐日存档</h2><p>' + str(view["recorded_days"]) + '个已记录日期，' + str(view["item_count"]) + '个归档条目。</p><div class="world-calendar-wrap"><table class="world-calendar"><caption>' + escape(view["month"]) + '北京日期</caption><thead><tr>'
    content += ''.join('<th scope="col">' + label + '</th>' for label in ('一', '二', '三', '四', '五', '六', '日')) + '</tr></thead><tbody>'
    year, month = map(int, view["month"].split('-'))
    for week in monthcalendar(year, month):
        content += '<tr>'
        for number in week:
            if not number:
                content += '<td class="world-calendar-pad"></td>'
                continue
            day = view["days"][number - 1]
            label = _link(day["url"], str(number)) if day["exists"] else '<span>' + str(number) + '</span>'
            content += '<td><div class="world-day" data-archive-date="' + day["date"] + '"><div class="world-day-heading">' + label + '<span class="world-day-count">' + (str(day["item_count"]) if day["exists"] else '—') + '</span></div>'
            if day["exists"]:
                short = {"ok": "采集成功", "partial": "部分失败", "failed": "采集失败", "imported": "历史导入", "manual": "人工样刊", "historical-mixed": "历史资料", "unrecorded": "无完整记录", "empty": "空存档"}[day["collection"]["status"]]
                content += '<small title="' + escape(day["collection"]["label"], quote=True) + '">' + short + '</small>'
                content += ''.join(_link(item["url"], item["title"], language=item["lang"], class_name='world-calendar-title') for item in day['preview'])
            else:
                content += '<p class="world-news-meta">未存档</p>'
            content += '</div></td>'
        content += '</tr>'
    return content + '</tbody></table></div></section>'


def _search(manifest, unavailable):
    content = '<section class="world-section" id="search"><h2>按月检索标题</h2><p>只搜索已保存的标题和旧样刊旁证标题，不搜索报道正文；提交时才读取本站所选月份的索引。</p>'
    options = ''.join('<option value="' + item["month"] + '">' + item["month"] + '</option>' for item in manifest["months"])
    content += '<form data-world-search hidden><label>月份<select name="month">' + options + '</select></label><label>标题关键词<input name="q" type="search" maxlength="160" required></label><button type="submit">检索</button></form>'
    content += '<p data-world-search-status role="status">' + ('启用JavaScript后可检索；无脚本时可按下方月历浏览完整标题。' if options else '尚无可检索的月份，可按月历查看已有存档。') + '</p><ol data-world-search-results class="world-day-list"></ol>'
    if unavailable:
        content += '<p>以下月份的搜索索引超过32 MiB上限，完整日页仍保留：' + '、'.join(_link(world.month_url(month), month) for month in unavailable) + '。</p>'
    return content + '<script id="world-search-months" type="application/json">' + safe_json(manifest) + '</script></section>'


def render_index(snapshot, config, store, metadata, now, manifest, unavailable):
    content = _heading('看世界', '今天发生了什么，往日保存了什么，去哪里找一手信息。', '/world/')
    today = now.astimezone(news.CHINA).date().isoformat()
    civil = world._day(today)
    content += '<section class="world-section" id="today"><h2>今日汇集</h2><p class="world-news-meta">页面日期：<time id="world-today-date" datetime="' + today + '">' + f'{civil.year}年{civil.month}月{civil.day}日 · 北京时间' + '</time></p>' + _calendar(today, metadata)
    content += '<p class="world-news-meta">' + ('最近检查：' + escape(_time(snapshot["collected_at"])) if snapshot["collected_at"] else '尚无可用新闻快照。') + '</p>'
    active_ids = {source["id"] for source in news.active_sources(config)}
    if any(item["source_id"] not in active_ids for item in snapshot["items"]):
        content += '<p class="world-note">当前保留旧来源配置的快照；新采集成功后会替换。</p>'
    content += '<p>按来源编辑选题与四类轮取规则汇集，每源、每媒体设上限，合计最多24条；标题保留原文语言。此处展示规则选出的最新条目，不作全网重要性排名。</p>'
    items = news.visible_items(snapshot, config, now=now)[:24]
    for category in news.CATEGORIES:
        selected = [item for item in items if item["category"] == category]
        if selected:
            content += '<section class="world-news-group"><h3>' + CATEGORIES[category] + '</h3><ul class="world-day-list">'
            for item in selected:
                content += '<li class="world-news"><h4>' + _link(item["url"], item["title"], language=item["lang"]) + '</h4><p class="world-news-meta">' + escape(item["source"] + ' · 原文时间 ' + _time(item["published"])) + '</p></li>'
            content += '</ul></section>'
    if not items:
        content += '<p>暂无72小时内的合格标题。' + _link('/world/sources/', '可从信息源继续阅读') + '。</p>'
    content += '</section><section class="world-section" id="archive"><h2>往日</h2>'
    if not store["available"] or not store["has_data"]:
        content += '<p>' + escape(store["message"]) + '</p>'
    else:
        content += '<h3>最近7个北京日</h3><ul class="world-day-list">'
        recent = world.recent_days(store, end=today)
        for day in recent:
            content += '<li>' + _link(day["url"], day["date"]) + ' · ' + str(day["item_count"]) + '条<p class="world-news-meta">' + escape(day["collection"]["label"]) + '</p>' + _preview(day) + '</li>'
        content += '</ul>' if recent else '</ul><p>最近7个北京日尚无存档，不拿更老日期填充。</p>'
        previous = world.year_ago(store, today=today)
        if previous is not None:
            content += '<section class="world-section"><h3>一年前的今天</h3>' + _link(previous["url"], previous["date"]) + _preview(previous) + '</section>'
    content += '<h3>按月浏览</h3><ul class="world-month-list">' + ''.join('<li>' + _link(world.month_url(month), month) + '</li>' for month in reversed(store["months"])) + '</ul></section>'
    return content + _search(manifest, unavailable) + '<section class="world-section"><h2>信息源</h2><p>一手优先，按领域与来源类型浏览；不排名。' + _link('/world/sources/', '打开信息源网格') + '。</p></section>'


def render_sources(catalog):
    sources = approved_sources(catalog)
    domains = {key: label for key, label in DOMAINS.items() if any(source["domain"] == key for source in sources)}
    types = {key: label for key, label in TYPES.items() if any(source["type"] == key for source in sources)}
    languages = {key: label for key, label in LANGUAGES.items() if any(key in source["languages"] for source in sources)}
    content = _heading('信息源', '一手优先：看事实来源、署名与更正、长期记录，以及公开的方法和数据。来源不排名。', '/world/sources/')
    content += '<section class="world-section" data-source-directory><h2>领域 × 来源类型</h2><p>遇到惊人的消息，先找原始文件或一手发布，再比较不同来源；访问提示与核对日期列在每项下方。</p><form data-source-filters hidden>'
    for name, label, values in (("domain", "领域", domains), ("type", "类型", types), ("language", "语言", languages)):
        content += '<label>' + label + '<select name="' + name + '"><option value="all">全部' + label + '</option>' + ''.join('<option value="' + key + '">' + escape(value) + '</option>' for key, value in values.items()) + '</select></label>'
    content += '<button type="reset">重置筛选</button></form><p data-source-count>共' + str(len(sources)) + '个来源</p><p data-source-empty hidden>没有符合筛选条件的来源。</p>'
    for domain, label in domains.items():
        content += '<section class="world-source-domain" data-source-domain="' + domain + '"><h2>' + escape(label) + '</h2><div class="source-grid">'
        for kind, kind_label in types.items():
            selected = [source for source in sources if source["domain"] == domain and source["type"] == kind]
            if not selected:
                continue
            content += '<div class="world-source-cell" data-source-cell data-source-kind="' + kind + '"><h3>' + escape(kind_label) + '</h3>'
            for source in selected:
                content += '<article class="source-card" id="source-' + source["id"] + '" data-source-card data-domain="' + domain + '" data-type="' + kind + '" data-languages="' + escape(' '.join(source["languages"]), quote=True) + '"><h4>' + _link(source["url"], source["name"]) + '</h4><p>' + escape(source["reason"]) + '</p>'
                content += '<p class="world-news-meta">' + escape(' · '.join([LANGUAGES[value] for value in source["languages"]]) + ' · ' + source["region"] + ' · ' + ('参与自动采集' if source["collect"] else '目录来源，未参与自动采集')) + '</p>'
                content += '<p>' + escape(source["access"]) + '</p><p class="world-news-meta">最后核对：' + escape(source["checked"]) + '</p><details><summary>官方入口与采集说明</summary><ul>'
                content += ''.join('<li>' + _link(link["url"], link["label"]) + '</li>' for link in source["official_links"])
                for feed in source["feeds"]:
                    if feed["status"] == 'approved':
                        content += '<li>' + escape(feed["name"]) + '：' + ('采集中' if feed["collect"] else '未采集') + '。' + escape(feed["note"]) + ' ' + _link(feed["docs_url"], '来源说明') + '</li>'
                content += '</ul></details></article>'
            content += '</div>'
        content += '</div></section>'
    return content + '</section>'


def build_world(root, output, address, snapshot, config, catalog, store, calendar_meta=None, now=None):
    root, output = Path(root), Path(output)
    current = world._instant(now)
    parts = urlsplit(address)
    if parts.scheme not in {'https', 'http'} or not parts.netloc or parts.query or parts.fragment or parts.username or parts.password:
        raise ValueError("World pages need an absolute publication address.")
    address = address.rstrip('/')
    validate_catalog(catalog)
    news.validate_snapshot(snapshot, config)
    template = source_path(root, 'home/world.template.html').read_text(encoding='utf-8')
    assets = {name: source_path(root, 'home/assets/' + name) for name in ('world.js', 'world.css')}
    news._safe_path(output)
    lookup = {item['id']: {"title": item['title'], "day_url": world.day_url(stamp)} for stamp, day in store['days'].items() for item in day['items']}
    manifest = {"version": 1, "months": [], "default_month": ''}
    unavailable, routes = [], []

    def publish(route, title, description, content):
        page = template
        for key, value in {"title": escape(title), "description": escape(description, quote=True), "site_url": escape(address, quote=True), "route": route, "content": content}.items():
            page = page.replace('{{' + key + '}}', value)
        if '{{' in page:
            raise ValueError("Unresolved World template placeholder.")
        page = localize_page(page, root, address, route, 'zh-CN', title=title, description=description)
        if 'href="/en/world' in page:
            raise ValueError("World pages must remain Chinese-only.")
        target = _destination(output, route.strip('/') + '/index.html')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding='utf-8')
        routes.append(route)

    for month in store['months']:
        data = world.month_search_index(store, month)
        raw = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        if len(raw) > MAX_SEARCH_BYTES:
            unavailable.append(month)
            data = {**data, "available": False, "exists": False, "message": "该月标题索引超过32 MiB上限，请按月浏览完整存档。", "items": []}
            raw = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        else:
            manifest['months'].append({"month": month, "url": '/world/search/' + month + '.json'})
        target = _destination(output, 'world/search/' + month + '.json')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        publish(world.month_url(month), month + ' · 月历 · 看世界', month + '逐日标题数量与存档入口。', render_month(world.month_view(store, month)))
    manifest['months'].reverse()
    manifest['default_month'] = manifest['months'][0]['month'] if manifest['months'] else ''
    for stamp in store['dates']:
        view = world.day_view(store, stamp)
        publish(view['url'], stamp + ' · 当天存档 · 看世界', stamp + '全部存档标题、来源与真实采集记录。', render_day(view, calendar_meta, lookup))
    publish('/world/', '看世界 · 谢雨卿', '今日来源标题、往日存档与一手优先的信息源。', render_index(snapshot, config, store, calendar_meta, current, manifest, unavailable))
    publish('/world/sources/', '信息源 · 看世界', '按领域、类型与语言查找一手优先的信息源。', render_sources(catalog))
    for name, source in assets.items():
        target = _destination(output, 'assets/' + name)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return {"language": "zh-CN", "routes": routes, "archive_available": store['available'], "days": len(store['dates']),
            "months": len(store['months']), "archive_items": len(lookup), "sources": len(approved_sources(catalog)),
            "search_months": len(manifest['months']), "search_unavailable": unavailable}
