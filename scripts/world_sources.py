"""One reviewed public directory drives both World links and active RSS feeds."""
from copy import deepcopy
from datetime import date
from pathlib import Path

import news_snapshot as news

CATALOG_PATH = Path('home/brief/information-sources.json')
DOMAINS = {
    'international': '国际时事', 'china-policy': '中国时政与政策',
    'macro': '宏观经济与统计', 'finance': '金融市场', 'technology': '科技与 AI',
    'science': '科学', 'health': '健康与医学', 'disasters': '天气、地震与灾害',
    'law': '法律法规', 'academic': '学术与论文',
    'marxism': '马克思主义与历史文献', 'english': '英语学习', 'verification': '核实与存档',
}
TYPES = {'official': '一手／官方', 'professional': '专业机构与数据库',
         'media': '新闻媒体', 'community': '平台与社区', 'personal': '站主常看'}
LANGUAGES = {'zh-CN': '中文', 'en': '英文', 'zh-Hant': '中文（繁体）'}
SOURCE_FIELDS = {'id', 'name', 'domain', 'type', 'url', 'languages', 'region', 'reason',
                 'access', 'checked', 'status', 'collect', 'official_links', 'feeds'}
FEED_FIELDS = {'id', 'publisher', 'name', 'category', 'lang', 'feed_url', 'home_url',
               'docs_url', 'article_hosts', 'collect', 'status', 'note'}


def directory_url(value):
    if value in {'/english/', '/marx/'}:
        return value
    if isinstance(value, str) and value.startswith('http://'):
        # Some official directory sites still publish HTTP entry points. This
        # does not enable HTTP fetching by the news collector.
        return 'http://' + news.public_url('https://' + value[7:])[8:]
    return news.public_url(value)


def validate_catalog(data):
    if (not isinstance(data, dict) or set(data) != {'version', 'sources'}
            or type(data['version']) is not int or data['version'] != 1
            or not isinstance(data['sources'], list) or not 0 <= len(data['sources']) <= 100):
        raise ValueError('Information sources need a bounded version 1 catalog.')
    ids, feed_ids = set(), set()
    for source in data['sources']:
        if not isinstance(source, dict) or set(source) != SOURCE_FIELDS:
            raise ValueError('Information source fields do not match the public schema.')
        if not isinstance(source['id'], str) or not news.SLUG.fullmatch(source['id']) or source['id'] in ids:
            raise ValueError('Information source IDs must be unique slugs.')
        ids.add(source['id'])
        for field, maximum in [('name', 100), ('region', 100), ('reason', 600), ('access', 600)]:
            news._text(source[field], maximum)
        if (not isinstance(source['domain'], str) or source['domain'] not in DOMAINS
                or not isinstance(source['type'], str) or source['type'] not in TYPES):
            raise ValueError('Unknown information domain or type.')
        languages = source['languages']
        if (not isinstance(languages, list) or not languages
                or any(not isinstance(value, str) or value not in LANGUAGES for value in languages)
                or len(languages) != len(set(languages))):
            raise ValueError('Information source languages must be explicit.')
        if directory_url(source['url']) != source['url']:
            raise ValueError('Information source URL must be normalized.')
        if (not isinstance(source['checked'], str) or date.fromisoformat(source['checked']).isoformat() != source['checked']
                or source['status'] not in {'approved', 'draft'} or type(source['collect']) is not bool):
            raise ValueError('Information sources need a review date and an explicit status.')
        links = source['official_links']
        if not isinstance(links, list) or not 1 <= len(links) <= 8:
            raise ValueError('Information sources need a small set of official links.')
        for link in links:
            if not isinstance(link, dict) or set(link) != {'label', 'url'}:
                raise ValueError('Invalid official information link.')
            news._text(link['label'], 100)
            if directory_url(link['url']) != link['url']:
                raise ValueError('Official information URL must be normalized.')
        if not isinstance(source['feeds'], list) or len(source['feeds']) > 4:
            raise ValueError('Information sources need a bounded feed list.')
        active = False
        for feed in source['feeds']:
            if not isinstance(feed, dict) or set(feed) not in (FEED_FIELDS, FEED_FIELDS | {'link_policy'}):
                raise ValueError('Information feeds need explicit collection metadata.')
            if (not isinstance(feed['id'], str) or feed['id'] in feed_ids
                    or type(feed['collect']) is not bool or feed['status'] not in {'approved', 'draft'}):
                raise ValueError('Information feed IDs and statuses must be explicit.')
            feed_ids.add(feed['id'])
            news._text(feed['note'], 600)
            policy = feed.get('link_policy', 'publisher')
            if policy not in {'publisher', 'public-https'}:
                raise ValueError('Unknown information feed link policy.')
            if policy == 'public-https' and not (source['type'] == 'community' and feed['id'] == 'hacker-news'):
                raise ValueError('External article links require the reviewed community feed.')
            if feed['collect'] and (source['status'] != 'approved' or feed['status'] != 'approved'):
                raise ValueError('Unapproved sources cannot be collected.')
            projected = {k: v for k, v in feed.items() if k not in {'collect', 'status', 'note', 'link_policy'}}
            if policy == 'public-https':
                projected['link_policy'] = policy
            news.validate_sources({'version': 2, 'max_items': 24, 'max_per_source': 2,
                                  'max_per_publisher': 2, 'max_age_hours': 72,
                                  'sources': [projected], 'collect_ids': [feed['id']] if feed['collect'] else []})
            active = active or feed['collect']
        if source['collect'] != active:
            raise ValueError('Directory collection labels must agree with their feeds.')
    return data


def load_catalog(root, *, required=True):
    path = Path(root) / CATALOG_PATH
    if not path.exists() and not required:
        return {'version': 1, 'sources': []}
    return validate_catalog(news._read_json(path, 512 * 1024))


def approved_sources(catalog):
    return [source for source in catalog['sources'] if source['status'] == 'approved']


def collection_config(catalog, legacy):
    """Keep retired IDs for validating old Release snapshots, never fetch them."""
    sources, active_ids = [], []
    for source in approved_sources(catalog):
        for feed in source['feeds']:
            if feed['status'] != 'approved':
                continue
            item = {k: deepcopy(v) for k, v in feed.items() if k not in {'collect', 'status', 'note', 'link_policy'}}
            if feed.get('link_policy') == 'public-https':
                item['link_policy'] = 'public-https'
            sources.append(item)
            if feed['collect']:
                active_ids.append(item['id'])
    known = {item['id'] for item in sources}
    sources.extend(deepcopy(item) for item in legacy['sources'] if item['id'] not in known)
    result = {'version': 2, 'max_items': 24, 'max_per_source': 2, 'max_per_publisher': 2,
              'max_age_hours': 72, 'sources': sources, 'collect_ids': active_ids}
    return news.validate_sources(result)
