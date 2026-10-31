"""Explicit local reading topics: paraphrase, primary references and short quotations."""
import json
import re
from html import escape

TOPICS = ('commune', 'late-engels', 'mba')
ROUTES = tuple('/marx/topics/' + name + '/' for name in TOPICS)
REQUIRED = {
    'commune': {'timeline': {'commune-march18', 'commune-march26', 'commune-march28', 'commune-may21', 'commune-may28'}, 'letters': {'commune-letter129', 'commune-letter130'}, 'summaries': {'commune-address', 'commune-engels1891'}, 'manifesto-preface': {'commune-manifesto1872'}},
    'late-engels': {'five-letters': {'late-letter237', 'late-letter240', 'late-letter241', 'late-letter263', 'late-letter266'}, 'read-together': {'late-key-determination', 'late-key-interaction', 'late-key-resultant'}},
    'mba': {'enterprise': {'mba-cooperation', 'mba-division', 'mba-machinery', 'mba-piece-wage', 'mba-management', 'mba-shares', 'mba-commerce'}},
}


def paraphrase(value, maximum):
    from marx_engels import text
    text(value, maximum)
    for quoted in re.findall(r'“([^”]+)”|‘([^’]+)’|「([^」]+)」|『([^』]+)』', value):
        if len(next(part for part in quoted if part)) > 6:
            raise ValueError('读马恩：专题正文用本站转述，直引只由已核短引显示一次。')


def reference(value):
    from marx_engels import fields, source_url, iso
    fields(value, ('url', 'locator', 'checked_on'))
    source_url(value['url'], 'zh'); iso(value['checked_on']); paraphrase(value['locator'], 1200)


def load_topics(root, core):
    from marx_engels import fields, slug, iso, source_path, prose_characters
    from marx_extras import ROUTES as EXISTING_ROUTES
    known = set(EXISTING_ROUTES) | set(ROUTES) | {i['route'] for i in core['items'].values() if i['status'] == 'published'}
    known.update('/marx/wenji/' + str(no) + '/' for no in range(1, 11))
    known.update('/marx/capital/' + str(no) + '/' for no in (1, 2, 3))
    result = {}
    for name in TOPICS:
        data = json.loads(source_path(root, 'marx-engels/topics/' + name + '.json').read_text(encoding='utf-8'))
        fields(data, ('version', 'title', 'intro', 'ai_assisted', 'sections'))
        if type(data['version']) is not int or data['version'] != 1 or data['ai_assisted'] is not True:
            raise ValueError('读马恩：专题版本或整理说明无效。')
        paraphrase(data['title'], 100); paraphrase(data['intro'], 1200)
        if not isinstance(data['sections'], list) or not 1 <= len(data['sections']) <= 8:
            raise ValueError('读马恩：专题分节无效。')
        seen = {'topic-top', 'content', 'main', 'top'}; citations = []; prose = data['intro']; sections_seen = {}
        for section in data['sections']:
            fields(section, ('id', 'title', 'intro', 'items'))
            ident = slug(section['id'])
            if ident in seen: raise ValueError('读马恩：专题锚点重复。')
            seen.add(ident)
            paraphrase(section['title'], 200); paraphrase(section['intro'], 1200)
            sections_seen[ident] = set()
            prose += section['intro']
            if not isinstance(section['items'], list) or not 1 <= len(section['items']) <= 12:
                raise ValueError('读马恩：专题条目数量无效。')
            for item in section['items']:
                fields(item, ('id', 'title', 'text', 'source', 'citations', 'related'), ('date', 'precision', 'date_source'))
                ident = slug(item['id'])
                if ident in seen: raise ValueError('读马恩：专题锚点重复。')
                seen.add(ident)
                sections_seen[section['id']].add(ident)
                paraphrase(item['title'], 250); paraphrase(item['text'], 2400)
                reference(item['source'])
                if 'date_source' in item: reference(item['date_source'])
                if not isinstance(item['citations'], list) or len(item['citations']) > 1 or any(type(cid) is not str for cid in item['citations']) or set(item['citations']) - core['citations'].keys():
                    raise ValueError('读马恩：专题每条至多一条已核短引。')
                for cid in item['citations']:
                    if core['citations'][cid]['url'].split('#')[0] != item['source']['url'].split('#')[0]:
                        raise ValueError('读马恩：专题短引与本条原文来源不对应。')
                if not isinstance(item['related'], list) or len(item['related']) > 8 or any(type(route) is not str for route in item['related']) or len(set(item['related'])) != len(item['related']) or set(item['related']) - known:
                    raise ValueError('读马恩：专题延伸阅读指向未知页面。')
                if ('date' in item) != ('precision' in item):
                    raise ValueError('读马恩：专题日期与精度须一起提供。')
                if 'date' in item:
                    value, precision = item['date'], item['precision']
                    if precision == 'day': iso(value)
                    elif precision == 'month':
                        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value) or int(value[:4]) == 0: raise ValueError('读马恩：月份无效。')
                    elif precision == 'year':
                        if not isinstance(value, str) or not re.fullmatch(r'\d{4}', value) or int(value) == 0: raise ValueError('读马恩：年份无效。')
                    else: raise ValueError('读马恩：专题日期精度无效。')
                citations.extend(item['citations']); prose += item['text']
        for section, required in REQUIRED[name].items():
            if not required <= sections_seen.get(section, set()):
                raise ValueError('读马恩：专题缺少必需的分节或阅读条目。')
        result[name] = {**data, 'route': '/marx/topics/' + name + '/', 'citations': citations, 'prose_characters': prose_characters(prose)}
    return result


def quotation_items(topics):
    # One budget entry per rendered page: repeated displays of the same CID still count.
    return {'topic-' + name: {'route': topic['route'], 'status': 'published', 'citations': topic['citations'], 'prose_characters': topic['prose_characters']} for name, topic in topics.items()}


def render_topic(core, name):
    from marx_render import link, render_citations
    topic = core['topics'][name]
    out = '<div class="me-reading" id="topic-top"><nav class="me-jump-index" aria-label="本页专题"><ul>'
    out += ''.join('<li>' + link('#' + section['id'], section['title']) + '</li>' for section in topic['sections']) + '</ul></nav>'
    for section in topic['sections']:
        out += '<section class="me-section" id="' + section['id'] + '"><h2>' + escape(section['title']) + '</h2><p>' + escape(section['intro']) + '</p>'
        for item in section['items']:
            out += '<article class="me-section" id="' + item['id'] + '"><h3>' + escape(item['title']) + '</h3><p>' + escape(item['text']) + '</p>'
            for cid in item['citations']:
                out += render_citations(core, [cid]).replace('<h2>原著怎么说</h2>', '<h4>原著片段</h4>')
            out += '<p class="me-meta">' + link(item['source']['url'], '读这段原文', True) + '<span> · ' + escape(item['source']['locator']) + '</span></p>'
            if 'date_source' in item:
                out += '<p class="me-meta">' + link(item['date_source']['url'], '日期依据', True) + ' · ' + escape(item['date_source']['locator']) + '</p>'
            if item['related']:
                from marx_extras import ROUTES as page_titles
                labels = {i['route']: i['title'] for i in core['items'].values()}
                labels.update({route: values[0] for route, values in page_titles.items()})
                labels.update({t['route']: t['title'] for t in core['topics'].values()})
                labels.update({'/marx/capital/' + str(n) + '/': '《资本论》第' + str(n) + '卷' for n in (1, 2, 3)})
                labels.update({'/marx/wenji/' + str(n) + '/': '《文集》第' + str(n) + '卷' for n in range(1, 11)})
                out += '<p class="me-meta">接着读：' + ' · '.join(link(route, labels.get(route, '相关页面')) for route in item['related']) + '</p>'
            out += '</article>'
        out += '<p class="me-meta">' + link('#topic-top', '回到本页目录 ↑') + '</p></section>'
    return out + '<p>' + link('/marx/topics/', '回到专题目录 →') + '</p></div>'


def extra_pages(core):
    from marx_render import header
    return [(topic['route'], topic['title'], topic['intro'], header(topic['title'], topic['intro']) + render_topic(core, name)) for name, topic in core['topics'].items()]


def index_entries(core):
    from marx_render import link
    return ''.join('<section class="me-section"><h2>' + link(topic['route'], topic['title'] + ' →') + '</h2><p>' + escape(topic['intro']) + '</p></section>' for topic in core['topics'].values())
