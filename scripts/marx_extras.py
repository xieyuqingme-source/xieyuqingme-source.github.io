"""Public inputs and rendering for labs, quizzes, quotations, life, letters and topics."""
from datetime import date
from pathlib import Path
import json
import math
import re

from marx_engels import fields, text, slug, source_path, source_url, iso

ROUTES = {
    '/marx/cards/': ('卡片目录', '按问题、理论分支与难度，找一张卡片读起。'),
    '/marx/lab/': ('实验室', '用原著里的例子，把关系算清楚。'),
    '/marx/lab/value-form/': ('价值形式', '从麻布与上衣，读到货币形式。'),
    '/marx/lab/working-day/': ('工作日', '必要劳动和剩余劳动怎样组成一个工作日。'),
    '/marx/lab/reproduction/': ('再生产图式', '同时观察两大部类的价值补偿与物质补偿。'),
    '/marx/play/': ('小测验', '答完再读解释，带着问题回到原著。'),
    '/marx/quotes/': ('名句从哪来', '沿著作找出处，每次读一句。'),
    '/marx/life/': ('马恩的一生', '沿年表读生平，再看公开的主要足迹。'),
    '/marx/life/letters/': ('书信盲盒', '一封信，一个具体的讨论。'),
    '/marx/topics/': ('专题', '围绕一个问题，把几篇原著连起来。'),
    '/marx/topics/china/': ('马克思眼中的中国', '读1853—1859年的报刊文章，保留当时的材料与语境。'),
}

LIFE_TAGS = ('生活', '著作', '书信', '组织')
LIFE_PERIODS = ((1818, 1843, '求学与早年工作'), (1844, 1848, '合作与革命'),
                (1849, 1864, '流亡、研究与组织'), (1865, 1883, '《资本论》与晚年工作'),
                (1884, 1895, '恩格斯整理遗稿的岁月'))


def chinese_date(value):
    """Keep the source's year/month/day boundary in natural Chinese typography."""
    pieces = value.split('-')
    return str(int(pieces[0])) + '年' + (str(int(pieces[1])) + '月' if len(pieces) > 1 else '') + (str(int(pieces[2])) + '日' if len(pieces) > 2 else '')


def publication_source(locator):
    """The publication reference is reader text; curation instructions stay in data."""
    return locator.split('；', 1)[0].replace('第 ', '第')


def packet(value, name):
    fields(value, ('version', name))
    if type(value['version']) is not int or value['version'] != 1 or not isinstance(value[name], list):
        raise ValueError('读马恩：第二版数据需要版本1和显式列表。')
    return value[name]


def source(value):
    fields(value, ('url', 'locator', 'checked_on'))
    source_url(value['url'], 'zh')
    text(value['locator'], 1200)
    iso(value['checked_on'])


def number(value, maximum=10**12):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise ValueError('读马恩：数值必须有限、非负且在工具范围内。')


def precise_date(value, precision):
    patterns = {'year': r'\d{4}', 'month': r'\d{4}-\d{2}', 'day': r'\d{4}-\d{2}-\d{2}'}
    if precision not in patterns or not isinstance(value, str) or not re.fullmatch(patterns[precision], value):
        raise ValueError('读马恩：日期的文字和精度不一致。')
    parsed = date.fromisoformat(value + {'year': '-01-01', 'month': '-01', 'day': ''}[precision])
    if not 1818 <= parsed.year <= 1895:
        raise ValueError('读马恩：生平日期超出本版年表范围。')


def unique(rows, key):
    if len({row[key] for row in rows}) != len(rows):
        raise ValueError('读马恩：第二版稳定ID重复。')


def validate_extras(raw, data):
    tools = packet(raw['lab'], 'tools')
    for tool in tools:
        fields(tool, ('id', 'title', 'source', 'presets', 'notes'), ('timeline',))
        if tool['id'] not in ('value-form', 'working-day', 'reproduction'):
            raise ValueError('读马恩：未知实验室工具。')
        text(tool['title'], 100); source(tool['source']); text(tool['notes'], 2000)
        if not isinstance(tool['presets'], list) or not tool['presets']:
            raise ValueError('读马恩：工具需要原著预设。')
        for preset in tool['presets']:
            fields(preset, ('label', 'values', 'locator'))
            text(preset['label'], 200); text(preset['locator'], 1000)
            if not isinstance(preset['values'], list) or not preset['values']:
                raise ValueError('读马恩：无效预设。')
            if tool['id'] == 'value-form':
                for value in preset['values']: text(value, 500)
            else:
                for value in preset['values']: number(value)
            if tool['id'] == 'working-day' and (len(preset['values']) != 2 or not 0 < preset['values'][1] <= preset['values'][0] <= 24):
                raise ValueError('读马恩：工作日预设不成立。')
            if tool['id'] == 'reproduction':
                values = preset['values']
                if len(values) != 6 or values[1] + values[2] != values[3]:
                    raise ValueError('读马恩：简单再生产原数不满足交换条件。')
    for tool in tools:
        for row in tool.get('timeline', []):
            fields(row, ('year', 'text', 'locator'))
            for name in ('year', 'text', 'locator'): text(row[name], 1200)
    unique(tools, 'id')
    by_id={tool['id']:tool for tool in tools}
    if set(by_id) != {'value-form','working-day','reproduction'}:
        raise ValueError('读马恩：本版需要三个完整实验室。')
    expected_sources={'value-form':'https://www.marxists.org/chinese/marx/capital/01.htm','working-day':'https://www.marxists.org/chinese/marx/capital/08.htm','reproduction':'https://www.marxists.org/chinese/marx-engels2/06/20.htm'}
    if any(tool['source']['url'] != expected_sources[ident] for ident,tool in by_id.items()):
        raise ValueError('读马恩：实验室来源与工具不对应。')
    if [p['values'] for p in by_id['working-day']['presets']] != [[7,6],[9,6],[12,6]] or [p['values'] for p in by_id['reproduction']['presets']] != [[4000,1000,1000,2000,500,500]]:
        raise ValueError('读马恩：本版原著数字预设漂移。')
    forms=by_id['value-form']['presets']
    if len(forms)!=4 or forms[0]['values']!=['20码麻布＝1件上衣'] or [len(p['values']) for p in forms] != [1,6,6,6] or '20码麻布＝2盎斯金' not in forms[3]['values']:
        raise ValueError('读马恩：价值形式的四步原例不完整。')

    mappings = packet(raw['quote-works'], 'items')
    pool = {q['id']: q for q in data.get('daily_quotes', []) if q.get('author', {}).get('zh-CN') in ('马克思', '恩格斯', '马恩')}
    for row in mappings:
        fields(row, ('id', 'work', 'author', 'year', 'work_id'))
        slug(row['id']); text(row['work'], 300)
        if row['id'] not in pool or row['author'] not in ('marx', 'engels', 'marx-engels'):
            raise ValueError('读马恩：名句映射引用未知名句或作者。')
        from marx_quiz import normalized_work
        expected_author = {'马克思': 'marx', '恩格斯': 'engels', '马恩': 'marx-engels'}[pool[row['id']]['author']['zh-CN']]
        if row['author'] != expected_author or row['work'] != normalized_work(pool[row['id']]['work']['zh-CN']):
            raise ValueError('读马恩：规范著作名或作者与共享名句记录不一致。')
        if row['work_id'] is not None and row['work_id'] not in data['works']:
            raise ValueError('读马恩：名句映射引用未知篇目。')
        if row['year'] is not None and (type(row['year']) is not int or not 1800 <= row['year'] <= 1895):
            raise ValueError('读马恩：名句著作年代无效。')
    unique(mappings, 'id')
    if {row['id'] for row in mappings} != set(pool):
        raise ValueError('读马恩：名句归类须覆盖共享库里的全部马恩名句。')
    questions = packet(raw['quiz'], 'questions')
    for row in questions:
        fields(row, ('id', 'text', 'answer', 'explanation', 'card'), ('source',))
        slug(row['id']); text(row['text'], 400); text(row['explanation'], 1200)
        if row['answer'] not in ('真', '假', '存疑', '部分正确', '张冠李戴'):
            raise ValueError('读马恩：考据答案无效。')
        if row['card'] not in data['items'] or data['items'][row['card']]['category'] != 'myths' or data['items'][row['card']]['status'] != 'published':
            raise ValueError('读马恩：考据题必须关联已发布的考据卡。')
    unique(questions, 'id')
    from marx_checks import validate_truth_quiz
    validate_truth_quiz(questions, data)
    events = packet(raw['life'], 'events')
    for row in events:
        fields(row, ('id', 'date', 'precision', 'people', 'title', 'text', 'tags', 'work', 'source', 'ai_assisted'), ('history_id', 'errata'))
        slug(row['id']); precise_date(row['date'], row['precision'])
        if 'history_id' in row:
            slug(row['history_id'])
            if row['precision']!='day':
                raise ValueError('读马恩：只有精确到日的年表条目可以进入历史上的今天。')
        for name in ('title', 'text'): text(row[name], 1000)
        if row['people'] not in ('marx', 'engels', 'both') or type(row['ai_assisted']) is not bool:
            raise ValueError('读马恩：人物或AI标记无效。')
        if not isinstance(row['tags'], list) or not row['tags']:
            raise ValueError('读马恩：生平条目需要标签。')
        if len(set(row['tags'])) != len(row['tags']) or any(tag not in LIFE_TAGS for tag in row['tags']):
            raise ValueError('读马恩：生平标签须为生活、著作、书信或组织，且不能重复。')
        if 'errata' in row:
            if not isinstance(row['errata'], list) or not row['errata'] or len(set(row['errata'])) != len(row['errata']) or any(ident not in data['errata'] for ident in row['errata']):
                raise ValueError('读马恩：生平日期校勘必须对应已核勘误。')
        if row['work'] is not None and row['work'] not in data['works']:
            raise ValueError('读马恩：生平条目关联未知作品。')
        source(row['source'])
        if row['source']['url'] != 'https://www.marxists.org/chinese/marx-engels2/10/287.htm':
            raise ValueError('读马恩：生平以文集第十卷年表为依据。')
    unique(events, 'id')
    if not 60<=len(events)<=100 or [e['date'] for e in events]!=sorted(e['date'] for e in events):
        raise ValueError('读马恩：本版生平须有60—100条并按日期排列。')
    letters = packet(raw['letters'], 'letters')
    originals = {row['no']: row for row in data['wenji']['volumes'][9]['letters']}
    for row in letters:
        fields(row, ('no', 'summary', 'source', 'ai_assisted'))
        if type(row['no']) is not int or row['no'] not in originals or type(row['ai_assisted']) is not bool:
            raise ValueError('读马恩：书信编号或AI标记无效。')
        text(row['summary'], 1000); source(row['source'])
        if row['source']['url'] != originals[row['no']]['mia']:
            raise ValueError('读马恩：书信编号与原文不对应。')
        if not 80 <= len(re.findall(r'[\u3400-\u9fff]', row['summary'])) <= 160:
            raise ValueError('读马恩：书信转述应为80—160汉字。')
    unique(letters, 'no')
    if not 30<=len(letters)<=40:
        raise ValueError('读马恩：本版精选书信应为30—40封。')
    china = packet(raw['china'], 'items')
    allowed = {row['id'] for row in data['wenji']['volumes'][1]['works'][13:25]}
    for row in china:
        fields(row, ('work', 'date', 'summary', 'source', 'ai_assisted'))
        if row['work'] not in allowed or type(row['ai_assisted']) is not bool:
            raise ValueError('读马恩：中国专题只收本版指定的十二篇。')
        iso(row['date']); text(row['summary'], 1200); source(row['source'])
        if row['source']['url'] != data['works'][row['work']]['mia']:
            raise ValueError('读马恩：专题篇目与原文不对应。')
        if not 100 <= len(re.findall(r'[\u3400-\u9fff]', row['summary'])) <= 200:
            raise ValueError('读马恩：专题概述应为100—200汉字。')
    unique(china, 'work')
    if {row['work'] for row in china}!=allowed or [row['date'] for row in china]!=sorted(row['date'] for row in china):
        raise ValueError('读马恩：中国专题十二篇须完整并按首次发表日排序。')
    return dict(tools=tools, quote_works=mappings, questions=questions, events=events, letters=letters, china=china)


def load_extras(root, data):
    from daily_brief import validate_content
    data['daily_quotes'] = validate_content(json.loads(source_path(root, 'home/daily-content.json').read_text(encoding='utf-8')))['quotes']
    names = ('lab', 'quiz', 'quote-works', 'life', 'letters', 'china')
    raw = {name: json.loads(source_path(root, 'marx-engels/' + ('topics/china' if name == 'china' else name) + '.json').read_text(encoding='utf-8')) for name in names}
    from footprints_people import compile_markdown
    from history_today import load_history
    data['life_footprints'] = {person: compile_markdown(source_path(root, 'map/people/' + person + '.md').read_text(encoding='utf-8'), person)['payload']['documents']['zh-CN']['records'] for person in ('marx', 'engels')}
    result = validate_extras(raw, data)
    history = {item['id']: item for item in load_history(root)['items']}
    for event in result['events']:
        if 'history_id' not in event: continue
        item = history.get(event['history_id'])
        if event['precision'] != 'day' or item is None or item['year'] != int(event['date'][:4]) or item['month_day'] != event['date'][5:] or item['verification'] != 'source_review' or item['url'] != event['source']['url']:
            raise ValueError('读马恩：年表与历史事件关联不一致。')
    return result


def entrances():
    from marx_render import link
    paths = ('lab/', 'play/', 'quotes/', 'life/', 'life/letters/', 'topics/')
    return '<section class="me-section" aria-labelledby="other-ways"><h2 id="other-ways">换个方式读</h2><div class="me-route-grid me-other-ways">' + ''.join('<article class="me-route-card"><h3>' + link('/marx/' + path, ROUTES['/marx/' + path][0]) + '</h3><p>' + ROUTES['/marx/' + path][1] + '</p></article>' for path in paths) + '</div></section>'


def extra_pages(data):
    from marx_render import header, link
    pages = []
    for route, (title, description) in ROUTES.items():
        content = header(title, description)
        if route == '/marx/cards/':
            from marx_render import render_directory
            content += render_directory(data)
        elif route == '/marx/lab/':
            content += '<ul class="me-toc">' + ''.join('<li><h2>' + link('/marx/lab/' + ident + '/', ROUTES['/marx/lab/' + ident + '/'][0]) + '</h2><p>' + ROUTES['/marx/lab/' + ident + '/'][1] + '</p></li>' for ident in ('value-form', 'working-day', 'reproduction')) + '</ul>'
        elif route.startswith('/marx/lab/'):
            content += render_tool(data, route.strip('/').split('/')[-1])
        elif route == '/marx/play/':
            content += render_play(data)
        elif route == '/marx/quotes/':
            content += render_quotes(data)
        elif route == '/marx/life/':
            content += render_life(data)
        elif route == '/marx/life/letters/':
            content += render_letters(data)
        elif route == '/marx/topics/':
            content += '<p>' + link('/marx/topics/china/', '马克思眼中的中国 →') + '</p>'
            from marx_topics import index_entries
            content += index_entries(data)
        elif route == '/marx/topics/china/':
            content += render_china(data)
        pages.append((route, title, description, content))
    return pages


def render_tool(data, ident):
    from html import escape
    from marx_render import link
    tool = next((tool for tool in data['v2']['tools'] if tool['id'] == ident), None)
    if not tool:
        return '<p class="me-editorial">原著资料正在核对。</p>'
    out = '<div class="me-reading" data-me-lab="' + ident + '">'
    out += '<p class="me-prose">' + escape(tool['notes']) + '</p>'
    if ident == 'value-form':
        out += '<div data-lab-step-controls hidden><button type="button" data-lab-previous>上一步</button> <span role="status" data-lab-position></span> <button type="button" data-lab-next>下一步</button></div>'
        for index, preset in enumerate(tool['presets']):
            out += '<section class="me-section" data-lab-step><h2 tabindex="-1">' + escape(preset['label']) + '</h2><ul class="me-formulas">' + ''.join('<li>' + escape(value) + '</li>' for value in preset['values']) + '</ul>'
            if index in (2, 3):
                out += '<p class="me-meta">原文用大括号合写为一组等式，这里逐行展开。</p>'
            out += '<p class="me-meta">' + escape(preset['locator']) + '</p></section>'
        out += '<p>相对价值形式与等价形式的角色不同。倒转等式时，表现的方向改变；一般等价物取得社会共同形式，也不只是等号左右换位。</p><p>' + link('/marx/value-form/', '价值形式概念卡') + ' · ' + link('/marx/capital/1/ch01/', '第一章导读') + '</p>'
    elif ident == 'working-day':
        out += '<div data-lab-day hidden><fieldset><legend>改动时间（本站计算）</legend><label>工作日 <output data-lab-total>12</output>小时<input type="range" name="total" min="1" max="24" step="0.5" value="12"></label><label>必要劳动 <output data-lab-necessary>6</output>小时<input type="range" name="necessary" min="0" max="24" step="0.5" value="6"></label></fieldset><div class="me-actions">'
        out += ''.join('<button type="button" data-lab-preset="' + str(p['values'][0]) + '">' + escape(p['label']) + '</button>' for p in tool['presets'])
        out += '</div><p role="status" aria-live="polite" aria-atomic="true" data-lab-result></p><div class="me-timebar" data-lab-bar aria-hidden="true"><span>必要劳动</span><span>剩余劳动</span></div></div>'
        out += '<table class="me-comparison"><caption>原著第八章第1节的三个例子</caption><thead><tr><th>工作日</th><th>必要劳动</th><th>剩余劳动</th><th>m/v</th></tr></thead><tbody>'
        for preset in tool['presets']:
            total, necessary = preset['values']
            rate = (total - necessary) / necessary * 100
            label = f'{rate:g}%' if rate.is_integer() else f'约{rate:.1f}%'
            out += f'<tr><th>{total}小时</th><td>{necessary}小时</td><td>{total-necessary}小时</td><td>{label}</td></tr>'
        out += '</tbody></table><p>a—b 为必要劳动，b—c 为剩余劳动。第七章第1节还给出：500镑＝410c＋90v；剩余价值90镑，m/v＝100%。这是一组用于说明比例的原著数字，不是今天企业的财务测算。</p>'
        out += '<section class="me-section"><h2>工厂立法的几个节点</h2><ol class="me-toc">' + ''.join('<li><h3>' + escape(row['year']) + '</h3><p>' + escape(row['text']) + '</p><p class="me-meta">' + escape(row['locator']) + '</p></li>' for row in tool.get('timeline', [])) + '</ol></section><p>' + link('/marx/capital/1/ch08/', '第八章导读') + '</p>'
    elif ident == 'reproduction':
        values = tool['presets'][0]['values']
        out += '<table class="me-comparison"><caption>第二卷第二十章第Ⅱ节原著数字</caption><thead><tr><th>部类</th><th>c</th><th>v</th><th>m</th><th>总额</th></tr></thead><tbody><tr><th>Ⅰ 生产资料</th><td>4000</td><td>1000</td><td>1000</td><td>6000</td></tr><tr><th>Ⅱ 消费资料</th><td>2000</td><td>500</td><td>500</td><td>3000</td></tr></tbody></table>'
        out += '<p>c 为不变资本价值，v 为可变资本价值，m 为剩余价值。原例合计9000，两部类的m/v均为100%。Ⅰ(v＋m)＝Ⅱc＝2000：Ⅰ部类的工人和资本家需要消费资料，Ⅱ部类需要补偿生产资料。</p><div data-lab-reproduction hidden><fieldset class="me-number-grid"><legend>改动六个数（本站计算）</legend>'
        for index, (label, value) in enumerate(zip(('Ⅰ c','Ⅰ v','Ⅰ m','Ⅱ c','Ⅱ v','Ⅱ m'), values)):
            out += f'<label for="reproduction-{index}">{label}<input id="reproduction-{index}" type="number" min="0" max="1000000000000" step="any" value="{value}" inputmode="decimal"></label>'
        out += '</fieldset><button type="button" data-lab-reset>恢复马克思的数字</button><p role="status" aria-live="polite" aria-atomic="true" data-lab-result></p></div><p>相等只表示这里检验的价值交换条件成立，不是对全部经济均衡的证明。实物构成、资本更新、交换时间等条件没有由这六个数自动得到保证。零值可以参与算术，但不代表原著描述了一个空无生产的经济。</p><p>网页原文有一个重复加号，本站按同页前后两部类的列式显示数字，详见' + link('/marx/sources/#errata-e-v2-reproduction-plus', '原文校勘') + '。</p>'
    out += '<section class="me-section"><h2>这个工具怎么来的</h2><p>' + escape(tool['source']['locator']) + '。' + link(tool['source']['url'], '核对原著', True) + '</p><p>预设来自上述原著；自行输入及根据输入产生的结果均标为本站计算。这个工具只保留所说明的关系，不替代原著的论证或现实资料调查。</p></section></div>'
    return out



def json_script(value, attribute):
    import json
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return '<script type="application/json" ' + attribute + '>' + payload + '</script>'


def render_play(data):
    from marx_render import link
    from marx_quiz import build_pools
    pools=build_pools(data)
    out='<div class="me-reading" data-me-quiz><p>每轮 10 题，答完可以看分数和错题。题目和解释由本站编写，有 AI 辅助。</p><div class="me-actions" data-me-quiz-controls hidden>'
    for mode,label in [('source','名句出处'),('author','作者'),('myth','真假马克思')]:
        count=len(pools[mode]); ready=count >= (32 if mode=='myth' else 10)
        out+='<button type="button" data-quiz-mode="'+mode+'"'+('' if ready else ' disabled')+'>'+label+' · '+str(count)+'题'+('' if ready else '（即将开放）')+'</button>'
    out+='</div><div data-me-quiz-stage hidden><form></form><div class="me-quiz-explanation" data-me-quiz-explanation role="status" aria-live="polite" tabindex="-1" hidden></div><div class="me-actions" data-me-quiz-actions></div></div><noscript><p>没有脚本时，可以沿'+link('/marx/quotes/','名句从哪来')+'或'+link('/marx/#directory','概念与考据卡')+'继续阅读。</p></noscript>'+json_script(pools,'data-me-quiz-data')+'</div>'
    return out


def render_quotes(data):
    from html import escape
    from marx_render import link, day_seed
    from marx_quiz import quote_groups
    from datetime import datetime
    from marx_engels import CHINA
    groups=quote_groups(data); key=datetime.now(CHINA).date().isoformat()
    out='<div class="me-reading"><p>沿著作的写作年代往下读，每部一次抽一句。原句和「今天」页相同，出处与版本说明随句保留。</p><p>'+link('/today/#daily-quotation-card','今天页的马克思主义名句')+' · '+link('/assets/quotes-sources.md','逐条来源与版本说明')+'</p>'
    out += '<nav class="me-work-index" aria-label="著作索引"><h2>按著作找</h2><ul>'
    for number, (work, pool) in enumerate(groups.items()):
        out += '<li>' + link('#quote-work-' + str(number), work + ' · ' + str(len(pool)) + '句') + '</li>'
    out += '</ul></nav>'
    for number,(work,pool) in enumerate(groups.items()):
        selected=pool[day_seed(key)%len(pool)]
        years = [row['year'] for row in data['v2']['quote_works'] if row['work'] == work and row['year'] is not None]
        year_label = chinese_date(str(min(years))) + ' · ' if years else ''
        out+='<section class="me-section" data-me-quote-group id="quote-work-'+str(number)+'"><div class="me-section-head"><h2>'+escape(work)+'</h2><span>'+year_label+str(len(pool))+'句 <button type="button" data-me-quote-next hidden>抽一句</button></span></div><figure><blockquote data-me-quote-text aria-live="polite">'+escape(selected['text'])+'</blockquote><figcaption>'+link(selected['url'],'本句原文出处',True,attrs=' data-me-quote-source')+'</figcaption></figure><details><summary>版本与语境</summary><p data-me-quote-note>'+escape(selected['note'])+'</p></details>'
        guide=next((q['guide'] for q in pool if q['guide']),None)
        if guide: out+='<p>'+link(guide,'读马恩导读 →')+'</p>'
        out+='</section>'
    return out+json_script(list(groups.values()),'data-me-quotes-data')+'</div>'



def render_life(data):
    from html import escape
    from marx_render import link, work_route
    from collections import defaultdict
    events=data['v2']['events']; grouped=defaultdict(list)
    for event in events: grouped[event['date'][:4]].append(event)
    out='<div class="me-reading"><p>从求学、谋生到写作与组织活动，沿《文集》第10卷年表读马恩的一生。以下为本站转述，包含AI辅助。</p><div class="me-filters" data-me-life-filters hidden><fieldset><legend>人物</legend>'
    for value,label in [('all','全部'),('marx','马克思'),('engels','恩格斯'),('both','两人共同')]:
        out+='<button type="button" data-me-person="'+value+'" aria-pressed="'+str(value=='all').lower()+'">'+label+'</button>'
    out+='</fieldset><fieldset><legend>标签</legend><button type="button" data-me-tag="all" aria-pressed="true">全部</button>'
    out+=''.join('<button type="button" data-me-tag="'+tag+'" aria-pressed="false">'+tag+'</button>' for tag in LIFE_TAGS)
    out+='</fieldset></div><p class="me-meta" data-me-life-count role="status"></p>'
    out+='<nav class="me-jump-index" aria-label="生平时期"><h2>沿时期读</h2><ul>'
    out+=''.join('<li>'+link('#life-period-'+str(start),str(start)+'—'+str(end)+' · '+title)+'</li>' for start,end,title in LIFE_PERIODS)+'</ul></nav>'
    for index,(start,end,title) in enumerate(LIFE_PERIODS):
        out+='<details class="me-period" data-me-life-period data-me-collapsible id="life-period-'+str(start)+'"'+(' open' if index==0 else '')+'><summary><h2>'+str(start)+'—'+str(end)+' <span>'+title+'</span></h2></summary><div class="me-period-body">'
        for year,rows in sorted(grouped.items()):
            if not start <= int(year) <= end:
                continue
            out+='<section class="me-section" data-me-life-year><h2>'+year+'年</h2><ol class="me-toc">'
            for event in rows:
                date_label=chinese_date(event['date'])
                out+='<li data-me-event data-person="'+event['people']+'" data-tag="'+escape(' '.join(event['tags']),quote=True)+'" id="'+event['id']+'"><h3>'+escape(event['title'])+'</h3><p class="me-meta"><time datetime="'+event['date']+'">'+date_label+'</time> · '+escape(' / '.join(event['tags']))+'</p><p>'+escape(event['text'])+'</p><p class="me-meta">'+link(event['source']['url'],'据年表'+event['date'][:4]+'年条',True)+'</p>'
                if event.get('errata'):
                    out += '<p class="me-meta">' + ' · '.join(link('/marx/sources/#errata-' + ident, '日期见勘误 →') for ident in event['errata']) + '</p>'
                if event['work']:
                    route=work_route(data,event['work']);out+='<p>'+link(route,'沿作品接着读 →',route.startswith('https:'))+'</p>'
                out+='</li>'
            out+='</ol></section>'
        out+='</div></details>'
    out+='<details class="me-section me-footprint-list" data-me-collapsible><summary><h2>主要足迹</h2></summary><p>从特里尔、巴门到伦敦，下面列出两人曾生活和工作的主要城市。可以到地图工具里，把这些地点连起来看。</p>'
    for person,rows in data['life_footprints'].items():
        out+='<h3>'+('马克思' if person=='marx' else '恩格斯')+'</h3><ul class="me-qa">'
        for row in rows:
            period=chinese_date(row['start'])+('—'+chinese_date(row['end']) if row['end'] and row['end']!=row['start'] else '')
            out+='<li>'+escape(period+' · '+row['city'])+'</li>'
        out+='</ul>'
    out+='<p>'+link('/game/footprints/','打开足迹地图工具 →')+'，在人物资料中选择马克思或恩格斯。</p></details><p>'+link('/marx/life/letters/','书信盲盒 →')+'</p></div>'
    return out


def letter_projection(data):
    originals={l['no']:l for l in data['wenji']['volumes'][9]['letters']}
    return [dict(no=row['no'],title=originals[row['no']]['title'],year=originals[row['no']]['year'],summary=row['summary'],url=row['source']['url']) for row in data['v2']['letters']]


def render_letters(data):
    from html import escape
    from datetime import datetime
    from marx_engels import CHINA
    from marx_render import link,day_seed
    letters=letter_projection(data)
    if not letters:return '<p>书信摘要正在核对。</p>'
    selected=letters[day_seed(datetime.now(CHINA).date().isoformat())%len(letters)]
    out='<div class="me-reading"><p>这里精选文集中的书信，围绕每封信的问题作简短转述，包含AI辅助。摘要之外，原信还谈了什么，可以循链接继续读。</p><section class="me-section" data-me-letter><div class="me-section-head"><h2 data-me-letter-title>'+escape(selected['title'])+'</h2><button type="button" data-me-letter-next hidden>换一封</button></div><p class="me-meta" data-me-letter-year>'+str(selected['year'])+'年 · 第'+str(selected['no'])+'封</p><p data-me-letter-summary aria-live="polite">'+escape(selected['summary'])+'</p><p>'+link(selected['url'],'读这封信的原文',True,attrs=' data-me-letter-source')+'</p></section><details class="me-section"><summary>全部精选书信（'+str(len(letters))+'封）</summary><ol class="me-toc">'
    for row in letters:
        out+='<li id="letter-'+str(row['no'])+'"><h3>'+escape(row['title'])+'</h3><p class="me-meta">'+str(row['year'])+'年 · 第'+str(row['no'])+'封</p><p>'+escape(row['summary'])+'</p><p>'+link(row['url'],'原文出处',True)+'</p></li>'
    return out+'</ol></details>'+json_script(letters,'data-me-letters-data')+'</div>'


def render_china(data):
    from html import escape
    from marx_render import AUTHOR,link,page_range
    out='<div class="me-reading"><section class="me-section"><h2>先放回当时</h2><p>第一次鸦片战争在本专题所引文集正文及编者注中记为1840—1842年；有些史学资料从1839年的禁烟冲突算起。第二次鸦片战争发生于1856—1860年，1858年签订天津条约，1860年又有北京条约。本专题的报刊文章发表于1853—1859年，处在第一次战争之后，以及第二次战争进行之中，不能用它们替代后来对战争全程的历史研究。</p><p>十二篇中十篇论中国、两篇论印度；其中《波斯和中国》《俄国在远东的成功》由恩格斯署名，逐篇注明作者。下列概述为本站转述，包含AI辅助，按报刊刊载时间排列；多次连载的日期也列在出处中。作者的报道、推论和预测须分辨阅读，十九世纪语汇也不直接用来概括今天的国家与人民。</p></section><ol class="me-toc">'
    for row in data['v2']['china']:
        work=data['works'][row['work']]
        out+='<li id="'+row['work']+'"><h2>'+escape(work['title'])+'</h2><p class="me-meta"><time datetime="'+row['date']+'">'+chinese_date(row['date'])+'</time> · '+AUTHOR[work['author']]+' · 文集第2卷 · '+page_range(work['pages'])+'</p><p>'+escape(row['summary'])+'</p><p class="me-meta">'+link(row['source']['url'],publication_source(row['source']['locator']),True)+'</p></li>'
    out+='</ol><section class="me-section"><h2>延伸阅读</h2><ul><li>'+link('https://www.marxists.org/chinese/marx-engels2/02/17.htm','《波斯和中国》及编者注：1840—1842年战争的标记',True)+'</li><li>'+link('https://www.polyu.edu.hk/cus/nationaleducation/hk/resource-library/gallery/understanding-modern-chinese-history/','香港理工大学：认识中国近代史（两次战争及条约年表）',True)+'。背景资料，2026-10-29核对；其第一次战争分期始于1839年，本页已说明差别。</li><li>'+link('/marx/wenji/2/','文集第二卷完整目录')+'</li></ul></section></div>'
    return out
