"""Offline quiz validation and derived author questions for Learn English.

Knowledge is reviewed once in quiz.json. Author questions are projections of the
same quotation records used by /today/ and /english/quotes/, never another corpus.
"""
from collections import defaultdict
from copy import deepcopy
import json
import unicodedata

from english_corner import SLUG, exact_fields, iso_date, public_text, public_url, source_path


MODES = ("etymology", "origins", "usage")
VERDICTS = ("真", "假", "存疑", "部分正确")
QUESTION_FIELDS = ("id", "mode", "text", "choices", "answer", "explanation", "card", "sources")


def _label(value, maximum):
    public_text(value, maximum)
    if value != value.strip():
        raise ValueError("Quiz text must not hide leading or trailing spaces.")
    return value


def _distinct_labels(values):
    return len({unicodedata.normalize("NFKC", value).casefold() for value in values}) == len(values)


def _warmup_values(values):
    if not isinstance(values, list) or len(values) > 40 or values and len(values) < 3:
        raise ValueError("Beginner quotations need three to forty explicit shared IDs, or an empty fixture.")
    if any(not isinstance(value, str) or not SLUG.fullmatch(value) for value in values) or len(set(values)) != len(values):
        raise ValueError("Beginner quotation IDs must be unique public quotation slugs.")
    return values[:]


def _configuration(data):
    exact_fields(data, ("version", "questions"), ("warmup_quotes",))
    if type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("Unsupported Learn English quiz version.")
    return _warmup_values(data.get("warmup_quotes", []))


def validate_quiz(data, cards):
    """Return a copied question list after validating reviewed published sources.

    Empty questions are valid for small build fixtures. Production quantity is
    checked by the inventory test, not by fixtures or the renderer.
    """
    _configuration(data)
    if not isinstance(data["questions"], list) or len(data["questions"]) > 1000:
        raise ValueError("Quiz questions must be a bounded explicit list.")
    if not isinstance(cards, list):
        raise ValueError("Quiz reading needs a published card list.")
    known = {}
    columns = {}
    for card in cards:
        if not isinstance(card, dict) or card.get("status") != "published":
            continue
        slug = card.get("slug")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in known:
            raise ValueError("Published quiz reading needs unique card slugs.")
        if not isinstance(card.get("sources"), list):
            raise ValueError("Published quiz reading needs reviewed source URLs.")
        known[slug] = {public_url(source.get("url")) for source in card["sources"] if isinstance(source, dict)}
        columns[slug] = card.get("column")
    seen = set()
    for question in data["questions"]:
        exact_fields(question, QUESTION_FIELDS)
        identifier = question["id"]
        if not isinstance(identifier, str) or not SLUG.fullmatch(identifier) or identifier in seen:
            raise ValueError("Quiz IDs must be unique public slugs.")
        seen.add(identifier)
        if question["mode"] not in MODES:
            raise ValueError("Knowledge questions use etymology, origins or usage mode.")
        _label(question["text"], 400)
        _label(question["explanation"], 220)
        if len(question["explanation"]) < 80:
            raise ValueError("Knowledge answers need a useful reviewed explanation.")
        choices = question["choices"]
        allowed_sizes = (2, 3) if question["mode"] == "usage" else (4,)
        if not isinstance(choices, list) or len(choices) not in allowed_sizes:
            raise ValueError("Usage questions need two or three choices; other knowledge modes need four.")
        for choice in choices:
            _label(choice, 100)
        if not _distinct_labels(choices):
            raise ValueError("Quiz choices must be distinct visible labels.")
        _label(question["answer"], 100)
        if question["answer"] not in choices:
            raise ValueError("A quiz answer must be one of its actual choices.")
        if question["mode"] == "etymology" and choices != list(VERDICTS):
            raise ValueError("Etymology questions use the four fixed evidence verdicts.")
        slug = question["card"]
        if not isinstance(slug, str) or slug not in known:
            raise ValueError("Quiz reading must name an existing published card.")
        if question["mode"] == "usage" and columns[slug] != "mistakes":
            raise ValueError("Usage questions must link a published Common Mistakes card.")
        sources = question["sources"]
        if not isinstance(sources, list) or not 1 <= len(sources) <= 12:
            raise ValueError("Every knowledge question needs explicit reviewed sources.")
        source_urls = set()
        for source in sources:
            exact_fields(source, ("label", "url", "checked_on"))
            _label(source["label"], 250)
            url = public_url(source["url"])
            iso_date(source["checked_on"])
            if url not in known[slug] or url in source_urls:
                raise ValueError("Quiz sources must belong to the linked card and be distinct.")
            source_urls.add(url)
    return deepcopy(data["questions"])


def load_quiz(root, cards):
    """Read only the explicit repository quiz file; never fetch a source URL."""
    data = json.loads(source_path(root, "english-corner/quiz.json").read_text(encoding="utf-8"))
    return validate_quiz(data, cards)


def load_quiz_options(root):
    """Return the optional handpicked shared quote IDs; legacy fixtures stay valid."""
    data = json.loads(source_path(root, "english-corner/quiz.json").read_text(encoding="utf-8"))
    return _configuration(data)


def build_quiz_pools(english_quotes, knowledge, warmup_quotes=()):
    """Build browser pools from validated quote records and knowledge questions.

    Quotation dictionaries returned by load_english_quotes and their quotes list
    are both accepted. An undersized fixture never invents extra authors: fewer
    than four distinct authors produces an empty authors pool.
    """
    from daily_brief import validate_english_quotes

    if isinstance(english_quotes, dict):
        quote_data = english_quotes
    elif isinstance(english_quotes, list):
        quote_data = {"version": 1, "quotes": english_quotes}
    else:
        raise ValueError("Author questions must come from the shared quotation corpus.")
    exact_fields(quote_data, ("version", "quotes"))
    if type(quote_data["version"]) is not int or quote_data["version"] != 1 or not isinstance(quote_data["quotes"], list):
        raise ValueError("Author questions need the shared version 1 quotation format.")
    quotes = validate_english_quotes(quote_data)["quotes"] if quote_data["quotes"] else []
    if not isinstance(knowledge, list):
        raise ValueError("Use the validated knowledge question list.")
    pools = {"origins": [], "etymology": [], "usage": [], "authors": []}
    for question in knowledge:
        if not isinstance(question, dict) or question.get("mode") not in MODES:
            raise ValueError("Unknown knowledge question mode.")
        item = {key: deepcopy(question[key]) for key in ("id", "mode", "text", "choices", "answer", "explanation", "sources")}
        slug = question["card"]
        if not isinstance(slug, str) or not SLUG.fullmatch(slug):
            raise ValueError("Knowledge reading needs a public card slug.")
        item["reading"] = "/english/" + slug + "/"
        pools[item["mode"]].append(item)

    authors = defaultdict(list)
    labels = {}
    death_years = {}
    for quote in quotes:
        key = unicodedata.normalize("NFKC", quote["author_en"]).casefold()
        label = quote["author_zh"] + "（" + quote["author_en"] + "）"
        _label(label, 250)
        if key in labels and labels[key] != label:
            raise ValueError("One shared-corpus author needs one consistent display label.")
        if key in death_years and death_years[key] != quote["author_died"]:
            raise ValueError("One author needs one consistent death year.")
        labels[key] = label
        death_years[key] = quote["author_died"]
        authors[key].append(quote)
    if not isinstance(warmup_quotes, (list, tuple)):
        raise ValueError("Beginner quotations must be an explicit sequence of shared quote IDs.")
    warmup_ids = set(_warmup_values(list(warmup_quotes)))
    known_quotes = {quote["id"]: quote for quote in quotes}
    if warmup_ids - known_quotes.keys():
        raise ValueError("A beginner quotation must name a currently validated shared quotation.")
    familiar = {unicodedata.normalize("NFKC", known_quotes[identifier]["author_en"]).casefold() for identifier in warmup_ids}
    if warmup_ids and len(familiar) < 3:
        raise ValueError("Beginner quotations must cover at least three distinct shared authors.")
    if len(authors) < 4:
        return pools
    if not _distinct_labels(list(labels.values())):
        raise ValueError("Different authors need distinct display labels.")
    for quote in quotes:
        key = unicodedata.normalize("NFKC", quote["author_en"]).casefold()
        year = quote["author_died"]
        # A later anthology or revised edition must not move an author's era.
        # Death years give a consistent approximate era across cited editions.
        candidates = sorted((other for other in authors if other != key), key=lambda other: (
            abs(death_years[other] - year), death_years[other], other))[:3]
        if familiar and not (set(candidates) & familiar):
            familiar_candidates = sorted(familiar - {key}, key=lambda other: (
                abs(death_years[other] - year), death_years[other], other))
            if familiar_candidates:
                candidates[-1] = familiar_candidates[0]
        explanation = quote["work_zh"] + "（" + quote["work_en"] + "），" + quote["locator_zh"] + "。" + quote["note"]
        sources = [{"label": quote["author_en"] + " · " + quote["work_en"], "url": quote["url"]}]
        for source in sources:
            public_text(source["label"], 250)
            public_url(source["url"])
        pools["authors"].append({
            "id": "author-" + quote["id"], "mode": "authors", "text": "这句出自哪位作家的作品？",
            "english": quote["text"], "translation": quote["translation"],
            "warmup": quote["id"] in warmup_ids,
            "hint": quote["work_zh"] + " · 作品/所引版本 " + str(quote["first_published"]) + "年",
            "choices": [labels[key], *(labels[other] for other in candidates)], "answer": labels[key],
            "explanation": explanation, "reading": quote.get("related") or "/english/quotes/#quote-" + quote["id"],
            "sources": sources,
        })
    return pools
