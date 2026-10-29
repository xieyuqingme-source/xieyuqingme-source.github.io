"""Quiz questions projected from reviewed shared quotations and the Wenji catalogue."""
from collections import defaultdict
import re

AUTHOR = {'marx': '马克思', 'engels': '恩格斯', 'marx-engels': '马克思和恩格斯'}


def normalized_work(label):
    if '资本论' in label and any(word in label for word in ('第一卷', '第二卷', '第三卷')):
        return '资本论·' + next(word for word in ('第一卷', '第二卷', '第三卷') if word in label)
    for word, canonical in (('政治经济学批判', None), ('黑格尔法哲学批判', '〈黑格尔法哲学批判〉导言')):
        if word in label:
            if word == '政治经济学批判':
                return '〈政治经济学批判〉序言' if '序言' in label else '〈政治经济学批判〉导言' if '导言' in label else label.strip('《》')
            return canonical
    if '劳动在从猿到人转变' in label: return '劳动在从猿到人转变过程中的作用'
    if '费尔巴哈和德国古典哲学的终结' in label: return '路德维希·费尔巴哈和德国古典哲学的终结'
    for canonical in ('共产党宣言', '1844年经济学哲学手稿', '自然辩证法', '反杜林论', '关于费尔巴哈的提纲', '德意志意识形态', '神圣家族', '路易·波拿巴的雾月十八日', '社会主义从空想到科学的发展', '工资、价格和利润', '哥达纲领批判', '法兰西内战', '雇佣劳动与资本'):
        if canonical in label: return canonical
    found = re.search(r'《(.*?)》', label)
    return found.group(1) if found else re.sub(r'（.*', '', label).strip()


def build_pools(data):
    mappings = data['v2']['quote_works']
    quotes = {q['id']: q for q in data['daily_quotes']}
    registry = {}
    for row in mappings:
        key = (row['author'], row['work'])
        registry[key] = {'author': row['author'], 'work': row['work'], 'year': row['year']}
    for volume in data['wenji']['volumes']:
        for row in volume['works']:
            if row.get('kind') == 'appendix' or type(row.get('year')) is not int:
                continue
            label = normalized_work(row['title'])
            registry.setdefault((row['author'], label), dict(author=row['author'], work=label, year=row['year']))
    pools = {'source': [], 'author': [], 'myth': []}
    for row in mappings:
        quote = quotes[row['id']]
        if row['year'] is None: continue
        candidates = sorted((r for r in registry.values() if r['author'] == row['author'] and r['work'] != row['work'] and r['year'] is not None), key=lambda r: (abs(r['year']-row['year']), r['year'], r['work']))[:3]
        if len(candidates) != 3: continue
        work = data['works'].get(row['work_id'])
        guide = next((i['route'] for i in data['items'].values() if i['kind'] == 'works' and i['status'] == 'published' and i['work'] == row['work_id']), None)
        source = quote['url']['zh-CN'] if isinstance(quote['url'], dict) else quote['url']
        pools['source'].append(dict(id='source-'+row['id'], mode='source', text='这句出自哪部著作？', quotation=quote['text']['zh-CN'], choices=[row['work']]+[r['work'] for r in candidates], answer=row['work'], explanation=quote['work']['zh-CN']+'。'+quote['translation_note']['zh-CN'], reading=guide or '/marx/quotes/', source=source, author=row['author'], distractors=candidates))
    for volume in data['wenji']['volumes']:
        for work in volume['works']:
            if work.get('kind') == 'appendix' or volume['no'] == 10: continue
            title=('★ ' if work['editor_title'] else '')+work['title']
            pools['author'].append(dict(id='author-'+work['id'],mode='author',text='这篇是谁写的？',quotation=title,choices=list(AUTHOR.values()),answer=AUTHOR[work['author']],explanation='作者据《文集》第'+str(volume['no'])+'卷目录已核字段；编者拟题的星花保留。',source=work['mia'],reading='/marx/wenji/'+str(volume['no'])+'/'))
    for row in data['v2']['questions']:
        card=data['items'][row['card']]
        citation=data['citations'][card['citations'][0]]
        pools['myth'].append(dict(id=row['id'],mode='myth',text=row['text'],quotation='',choices=['真','假','存疑','部分正确','张冠李戴'],answer=row['answer'],explanation=row['explanation'],source=citation['url'],reading=card['route']))
    return pools


def quote_groups(data):
    groups=defaultdict(list)
    quotes={q['id']:q for q in data['daily_quotes']}
    for row in data['v2']['quote_works']:
        quote=quotes[row['id']]
        guide=next((i['route'] for i in data['items'].values() if i['kind']=='works' and i['status']=='published' and i['work']==row['work_id']),None)
        groups[row['work']].append(dict(id=row['id'],text=quote['text']['zh-CN'],url=quote['url']['zh-CN'] if isinstance(quote['url'],dict) else quote['url'],note=quote['translation_note']['zh-CN'],guide=guide))
    return dict(sorted(groups.items()))
