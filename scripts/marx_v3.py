"""Validated third-edition projections; no research cache or remote reads."""
from marx_engels import fields, text, prose_characters


def part_chapters(chapters, volume, part):
    """Return the chapters assigned by the authoritative Capital directory."""
    if type(volume) is not int or volume not in (2, 3) or type(part) is not int:
        raise ValueError('读马恩：篇导读只对应第二、三卷的真实篇号。')
    result = [chapter for (no, _), chapter in sorted(chapters.items())
              if no == volume and chapter.get('part_no') == part]
    if not result:
        raise ValueError('读马恩：篇导读引用了不存在的篇。')
    return result


def validate_part_metadata(item, chapters):
    selected = part_chapters(chapters, item['volume'], item['part'])
    if any(chapter.get('part_guide') != item['slug'] for chapter in selected):
        raise ValueError('读马恩：篇导读与原著目录登记不一致。')
    notes = item['chapter_notes']
    if not isinstance(notes, list) or len(notes) != len(selected):
        raise ValueError('读马恩：各章读法须逐章完整对应本篇。')
    for note, chapter in zip(notes, selected):
        fields(note, ('no', 'text'))
        if type(note['no']) is not int or note['no'] != chapter['no']:
            raise ValueError('读马恩：逐章读法缺少、重复、错序或混入其他篇。')
        text(note['text'], 220)
    return sum(prose_characters(note['text']) for note in notes)


def validate_part_links(items, chapters):
    declared = {chapter['part_guide'] for (volume, _), chapter in chapters.items()
                if volume in (2, 3) and chapter.get('part_guide')}
    actual = {item['slug'] for item in items.values() if item['kind'] == 'parts'}
    if declared != actual:
        raise ValueError('读马恩：篇导读与原著篇目须双向登记。')


def validate_question_source(question, data):
    """An optional override must belong to the bound card's reviewed sources."""
    if 'source' not in question:
        return
    from marx_engels import source_url, iso
    value = question['source']
    fields(value, ('url', 'locator', 'checked_on'))
    source_url(value['url'])
    text(value['locator'], 1200)
    iso(value['checked_on'])
    card = data['items'][question['card']]
    allowed = {}
    for ident in card['citations']:
        citation = data['citations'][ident]
        allowed[citation['url']] = 'zh'
        if citation.get('en'):
            allowed[citation['en']['url']] = 'en'
    for reference in card.get('references', []):
        allowed[reference['url']] = 'en' if reference['url'].startswith('https://www.marxists.org/archive/') else 'zh'
    if value['url'] not in allowed:
        raise ValueError('读马恩：题目原文须属于绑定卡片已登记的原文或参考资料。')
    source_url(value['url'], allowed[value['url']])


def validate_truth_quiz(questions, data):
    """Keep a substantial, mixed-verdict deck with follow-up for every myth card."""
    from collections import Counter
    from marx_engels import VERDICTS
    if len(questions) < 32:
        raise ValueError('读马恩：真假马克思需要至少32题。')
    answers = Counter(question['answer'] for question in questions)
    if set(answers) != set(VERDICTS):
        raise ValueError('读马恩：真假题须覆盖五种判定。')
    if sum(answers[answer] for answer in ('存疑', '部分正确', '张冠李戴')) < 8:
        raise ValueError('读马恩：至少8题须训练非二元判定。')
    coverage = Counter(question['card'] for question in questions)
    myths = {item['slug'] for item in data['items'].values()
             if item['category'] == 'myths' and item['status'] == 'published'}
    if any(coverage[card] < 2 for card in myths):
        raise ValueError('读马恩：每张已发布的考据卡至少需要2题。')
    for question in questions:
        validate_question_source(question, data)
