"""Quiz questions projected from reviewed shared quotations and the Wenji catalogue."""
from collections import defaultdict
import re

AUTHOR = {'marx': '马克思', 'engels': '恩格斯', 'marx-engels': '马克思和恩格斯'}

# These short reader explanations describe the already reviewed quotation;
# the shared corpus remains the only source of quotation text and edition notes.
READER_NOTES = {
    'marx-social-practice': '这里把社会生活放回人的实践活动中理解。',
    'engels-communism-conditions': '开篇先说明共产主义学说关心的解放条件。',
    'marx-science-road': '马克思勉励读者耐心走完艰难的研究道路。',
    'engels-labour-humanity': '这里讨论劳动在人类形成中的作用。',
    'marx-making-history': '历史由人创造，行动又受承继条件制约。',
    'engels-research-processes': '这里回顾自然科学从事物研究走向过程研究。',
    'marx-solvable-tasks': '社会任务的出现有其物质条件。',
    'engels-read-originals': '恩格斯建议收信人回到原著研究唯物史观。',
    'marx-theory-material-force': '这里讨论理论进入群众实践后的力量。',
    'engels-marx-personal-foes': '恩格斯在悼词中谈马克思的公共斗争。',
}

for _prefix, _notes in {
    'marx-reading-': [
        '青年马克思把职业选择和共同幸福联系起来。', '这里把职业的意义放在为人类工作的目标中。',
        '马克思主张从现存世界中展开批判。', '这里区分理性的存在与它所采取的形式。',
        '这里说明批判应当面对自己的结论和现实冲突。', '这里从人的处境说明彻底批判的出发点。',
        '这句同时说明宗教与现实苦难的两种联系。', '这里把宗教放在被压迫者的现实处境中理解。',
        '马克思批判用物品价值衡量人的交往。', '这里追问经济学怎样看待劳动者的生活。',
        '这里的“它”指作者正在讨论的共产主义。', '这里设想自然科学与关于人的科学的联系。',
        '思维的真理性要在实践中检验。', '改变环境的人本身也处在教育与社会关系中。',
        '第十一条把改变世界提到哲学面前。', '这里说明生产力及人的能力都有历史条件。',
        '磨的比喻把生产力与社会关系联系起来。', '马克思追问经济关系本身怎样在历史中形成。',
        '这里讨论资本家使用机器对付工人反抗。', '这里从阶级对立理解政治权力。',
        '这里描述雇佣劳动者工作与生活的分离。', '房子的比喻说明需要也受社会比较影响。',
        '开篇用悲剧与笑剧讨论历史的重复。', '这里讨论先辈传统对行动者的影响。',
        '马克思在演说结尾描写无产阶级的历史角色。', '这里说明个人的独立也有社会条件。',
        '这个比喻说明理解历史形态的研究方法。', '这里从相互关系理解社会。',
        '这里讨论公共生产条件怎样转入资本经营。', '这里概括生产关系与生产力的联系。',
        '这里说明物质生产与其他社会生活的联系。', '这里说明社会存在与意识的关系。',
        '这里讨论生产关系怎样转成生产力的束缚。', '社会形态的更替有物质条件。',
        '马克思在信中说明自己所说的党的历史意义。', '这里区分剩余价值与利润、地租等形式。',
        '马克思在信中谈妇女参与社会变革的重要性。', '这里总结巴黎公社与旧国家机器的关系。',
        '这里提醒读者辨认新创举与旧形式的区别。', '马克思在跋中说明自己的辩证方法。',
        '这里区分研究过程与叙述方法。', '这里说明权利受社会经济与文化条件制约。',
        '这个口号放在共产主义社会高级阶段讨论。', '这里讨论资本主义向共产主义的转变时期。',
        '马克思在信中把实际运动与纲领文本作比较。', '这里讨论挽救俄国公社所需的革命条件。',
        '马克思解释自己的分析从哪里出发。', '这里区分事物的表现形式与本质。',
        '全书从资本主义财富的商品形式展开。', '这里先从物的属性说明商品的使用价值。',
        '使用方式的发现同样有历史。', '这里区分使用价值与价值。',
        '这里说明价值以物的有用性为前提。', '这段引出商品形式中看似神秘的关系。',
        '这里说明商品拜物教中的社会关系。', '这个比喻说明人在他人身上认识自己。',
        '这里把分析从商品转向商品所有者。', '这里说明货币怎样从交换过程中形成。',
        '这里讨论商品对交换双方的不同用途。', '这里区分价格形式与商品的物体形式。',
        '这里说明货币作为价值尺度的作用。', '这句把分析带入货币转化为资本的问题。',
        '这里比较资本家与货币贮藏者的行为。', '这里描写价值增殖过程所呈现的形式。',
        '这里讨论流通与价值形成的关系。', '雇佣劳动关系的出现有历史前提。',
        '这里说明产品成为商品的社会条件。', '这里讨论劳动力这种特殊商品的价值。',
        '这里从人与自然的关系说明劳动过程。', '这里区分原料与更广的劳动对象。',
        '这里讨论土地为劳动提供的自然条件。', '建筑师与蜜蜂的比较说明劳动的目的性。',
        '这里说明生产资料价值怎样转入新产品。', '吸血鬼的比喻描写资本对活劳动的需求。',
        '这里把不同肤色劳动者的解放联系起来。', '这里讨论工作日限制所需的社会约束。',
        '工作日还关系到工人的精神和社会生活。', '这里讨论工作日冲突中权利与力量的关系。',
        '这里说明分析竞争需要先研究资本的性质。', '这里给出协作这种劳动形式的定义。',
        '乐队的比喻说明共同劳动需要协调。', '这里讨论工场分工对工人能力的影响。',
        '马克思在脚注中谈机器应用的社会后果。', '这里讨论生产发展与土地、劳动者的处境。',
        '这里比较工具劳动与机器工厂中的劳动。', '这里区分机器本身与它的资本主义应用。',
        '教育工厂的例子用于讨论生产劳动。', '这里从剩余价值生产说明资本主义生产。',
        '这里区分劳动与劳动者出卖的劳动力。', '这里讨论工资所呈现的劳动价格形式。',
        '这里从持续生产说明社会再生产。', '工人的生活维持与资本再生产相互联系。',
        '这里给出资本积累的定义。', '这句以讽刺口吻描写资本积累的驱动力。',
        '金锁链的比喻讨论积累中工资的变化。', '这里说明资本积累所产生的两极后果。',
        '这里给出所谓原始积累的历史含义。', '这里反驳原始积累的田园诗式叙述。',
        '这里讨论暴力在原始积累中的作用。', '这里以讽刺口吻谈国债与国民财富。',
        '这句总结原始积累的暴力历史。', '这里讨论资本主义积累的历史趋势。',
        '这里的“他”是殖民理论家威克菲尔德。', '序言从英国经验说明研究对象的关系。',
        '这里说明书中的人物承载着经济关系。',
    ],
    'engels-reading-': [
        '青年恩格斯在这里批判商业竞争。', '这里讨论无产者解放与私有制的关系。',
        '演说把民族自身自由与摆脱民族压迫联系起来。', '这里回应革命中是否需要权威的问题。',
        '这里讨论人类改造自然的连锁后果。', '这句把劳动放在人类生活的基本条件中。',
        '这里说明常识的适用范围与研究的差别。', '这里用自然研究说明辩证法。',
        '这里区分研究结果与预设原则。', '这里把自由与认识自然规律联系起来。',
        '这里批评用政治暴力单独解释历史。', '这里强调理论思维也需要学习和训练。',
        '这里讨论自然科学所需要的思维形式。', '这里讨论资本家与大工业管理的关系。',
        '墓前讲话先从人的生活需要谈起。', '这里把人的实践变化与思维基础联系起来。',
        '这里说明辩证法规律的历史和自然依据。', '这里回顾共产主义理解的转变。',
        '这里提出近代哲学的基本问题。', '这里概括唯物史观中的决定性因素。',
        '恩格斯在信中把未来社会理解为变化过程。', '这里先说明经济关系所包含的内容。',
        '这里从阶级对立和生产状况说明现代社会主义。', '新学说利用已有思想，也有现实经济根源。',
        '这里指出十八世纪思想家所受的时代限制。', '这里说明资本家与雇佣劳动的相互关系。',
        '这里追溯平等要求从政治向社会地位的扩展。', '这里讨论资本主义工业发展与劳动者困苦。',
        '这里把早期理论与尚未成熟的社会条件联系起来。', '这里回顾早期空想社会主义的方案来源。',
        '这里说明社会主义转成科学所需的现实基础。', '这里讨论科学整理所需的经验材料。',
        '这里说明形而上学看待事物的方式。', '这里说明辩证法怎样考察联系和变化。',
        '这里反对建立最终封闭的知识体系。', '这里说明现代唯物主义怎样研究历史。',
        '这里从自然界的时间历史理解自然研究。', '这里说明新的事实怎样推动历史研究。',
        '这里把社会主义放回阶级斗争的历史。', '这里评价黑格尔历史观的成就与局限。',
        '这里从生产和交换的变化说明社会变革。', '这里讨论生产力与其利用形式的冲突。',
        '这里说明实际社会冲突与社会主义思想的联系。', '这里描写工厂产品的共同劳动来源。',
        '这里讨论市场扩张与生产扩张的矛盾。', '这里用危机说明生产和占有的矛盾。',
        '这里讨论危机中货币流通的阻滞。', '这里分析国家所有与解决社会冲突的关系。',
        '这里比较尚未认识的社会力量与自然力。', '这里描写社会关系变革后的管理形式。',
        '这里设想社会占有生产资料后的变化。', '这里讨论社会生产的自觉组织。',
        '这里讨论人怎样自觉组织自己的社会联系。', '这里讨论人对自身社会力量的认识和控制。',
        '结尾说明无产阶级与社会解放的关系。',
    ],
    'marx-engels-reading-': [
        '开篇借幽灵形象写共产主义在欧洲的回响。', '这里以阶级斗争为线索概括成文历史。',
        '这里说明现代社会继承了阶级对立。', '这里描述资产阶级时代阶级对立的特点。',
        '这里概括两大阶级日益对立的趋势。', '这里把大工业与世界市场联系起来。',
        '这里把资产阶级自身也看成历史产物。', '这里联系经济发展与政治地位的变化。',
        '这里从阶级关系分析现代国家政权。', '这里评价资产阶级曾有的历史作用。',
        '这里描写交换价值深入社会关系。', '这里比较不同剥削形式的外观。',
        '这里描写职业地位的变化。', '这里讨论知识职业的雇佣关系。',
        '这里讨论金钱关系进入家庭。', '这里承认资产阶级所推动的生产活动。',
        '这里说明资本主义不断革新生产的压力。', '这里概括资本主义时代的持续变动。',
        '这里描写社会关系不断重组。', '这里描写旧等级和观念的消解。',
        '这里说明扩大销路的全球动力。', '这里分析世界市场对生产和消费的影响。',
        '这里描述需要和产品来源的世界化。', '这里讨论各民族相互依赖的扩大。',
        '这里讨论精神产品的跨民族传播。', '这里提出世界文学的形成。',
        '这里概括资产阶级改造世界的趋势。', '这里讨论城市与农村关系的变化。',
        '这里概括人口、生产资料与财产的集中。', '这里评价资产阶级所推动的生产力。',
        '这里点明资本主义危机中的生产过剩。', '这里讨论社会关系对财富发展的束缚。',
        '这里说明推翻旧制度的力量也会反向作用。', '这里把大工业与工人阶级的形成联系起来。',
        '这里描述工人的市场处境。', '这里讨论小作坊向大工厂的变化。',
        '这里讨论工人集体力量的增长。', '这里说明工人斗争中联合的意义。',
        '这里讨论阶级斗争的政治方向。', '这里说明作者对无产阶级历史作用的判断。',
        '这里强调运动的多数人性质。', '这里说明工人斗争最初采取的一国形式。',
        '这里联系资本增殖与雇佣劳动。', '这里讨论工人竞争与雇佣劳动。',
        '这里的“掘墓人”指工人阶级。', '这里说明共产党人与工人政党的关系。',
        '这里说明共产党人与整个阶级利益的联系。', '这里说明共产党人与工人运动的关系。',
        '这里说明理论原理的现实历史依据。', '这里把所有制关系放回历史变化中。',
        '这里辨明所批判的所有制类型。', '这里概括对资产阶级私有制的批判。',
        '这里说明资本家的社会地位。', '这里说明资本具有社会关系的性质。',
        '这里讨论活劳动在资本主义中的地位。', '这里对照共产主义中积累劳动的用途。',
        '这里比较过去劳动与现时生活的关系。', '这里讨论资本独立性与个人处境。',
        '这里区分占有产品与奴役他人劳动。', '这里以反讽回应懒惰的指责。',
        '这里讨论教育的社会影响。', '这里批评资产阶级的家庭关系。',
        '这句处在回应废除祖国指责的段落中。', '这里说明跨国联合对工人解放的意义。',
        '这里把民族剥削与人与人剥削联系起来。', '这里把民族敌对与阶级对立联系起来。',
        '这里讨论统治思想与阶级的关系。', '这里联系所有制变革与观念变革。',
        '这里描绘自由发展的联合体。', '这里开始批评资产阶级社会主义。',
        '这里批评保留制度却排除其冲突的愿望。', '这里以反讽概括资产阶级社会主义。',
        '这里联系眼前斗争与运动的未来。', '这里说明共产党人对革命运动的态度。',
        '这里表明公开说明观点的立场。', '结尾用锁链与世界作对照。',
        '结尾号召各国无产者联合。', '这里把过去运动与无产阶级运动比较。',
        '这里回顾工人斗争出现的条件。', '这里说明资本运动依靠社会共同劳动。',
    ],
}.items():
    READER_NOTES.update({f'{_prefix}{index:03}': note for index, note in enumerate(_notes, 1)})


def reader_explanation(quote):
    """Keep the concrete source locator, with one short contextual explanation."""
    locator = re.sub(r'（[^）]*）', '', quote['work']['zh-CN']).strip('，。 ')
    note = READER_NOTES[quote['id']]
    explanation = '出自' + locator + '。' + note
    if len(explanation) > 60:
        # The title remains visible in the answer. Abbreviate only two long,
        # conventional titles here; never cut an actual quotation or locator.
        locator = locator.replace('路德维希·费尔巴哈和德国古典哲学的终结', '费尔巴哈论').replace('劳动在从猿到人转变过程中的作用', '劳动在从猿到人转变中的作用')
        explanation = '出自' + locator + '。' + note
    if len(explanation) > 60:
        raise ValueError('Quiz reader explanation exceeds 60 characters: ' + quote['id'])
    return explanation


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
        pools['source'].append(dict(id='source-'+row['id'], mode='source', text='这句出自哪部著作？', quotation=quote['text']['zh-CN'], choices=[row['work']]+[r['work'] for r in candidates], answer=row['work'], explanation=reader_explanation(quote), version_note=quote['translation_note']['zh-CN'], reading=guide or '/marx/quotes/', source=source, author=row['author'], distractors=candidates))
    for volume in data['wenji']['volumes']:
        for work in volume['works']:
            if work.get('kind') == 'appendix' or volume['no'] == 10: continue
            title=('★ ' if work['editor_title'] else '')+work['title']
            author = AUTHOR[work['author']]
            explanation = ('这篇由马克思和恩格斯合著。' if work['author'] == 'marx-engels' else '这篇的作者是' + author + '。')
            pools['author'].append(dict(id='author-'+work['id'],mode='author',text='这篇是谁写的？',quotation=title,choices=list(AUTHOR.values()),answer=author,explanation=explanation,source=work['mia'],reading='/marx/wenji/'+str(volume['no'])+'/'))
    for row in data['v2']['questions']:
        card=data['items'][row['card']]
        citation=data['citations'][card['citations'][0]]
        pools['myth'].append(dict(id=row['id'],mode='myth',text=row['text'],quotation='',choices=['真','假','存疑','部分正确','张冠李戴'],answer=row['answer'],explanation=row['explanation'],source=row['source']['url'] if 'source' in row else citation['url'],reading=card['route']))
    return pools


def quote_groups(data):
    groups=defaultdict(list)
    quotes={q['id']:q for q in data['daily_quotes']}
    for row in data['v2']['quote_works']:
        quote=quotes[row['id']]
        guide=next((i['route'] for i in data['items'].values() if i['kind']=='works' and i['status']=='published' and i['work']==row['work_id']),None)
        groups[row['work']].append(dict(id=row['id'],text=quote['text']['zh-CN'],url=quote['url']['zh-CN'] if isinstance(quote['url'],dict) else quote['url'],note=quote['translation_note']['zh-CN'],guide=guide))
    years = {}
    for row in data['v2']['quote_works']:
        if row['year'] is not None:
            years[row['work']] = min(years.get(row['work'], row['year']), row['year'])
    return dict(sorted(groups.items(), key=lambda pair: (years.get(pair[0], float('inf')), -len(pair[1]), pair[0])))
