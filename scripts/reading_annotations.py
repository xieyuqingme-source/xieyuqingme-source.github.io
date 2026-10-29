"""Mark reviewed Markdown text tokens without changing source words or markup."""
from html import escape


def mark_reviewed_terms(tokens, notes, marker):
    """Mark each exact reviewed occurrence once; the caller owns safe marker HTML."""
    marked = set()
    for token in tokens:
        if not token.children:
            continue
        for child in token.children:
            if child.type != "text":
                continue
            spans = []
            for index, entry in enumerate(notes):
                if index in marked:
                    continue
                context = entry.get("context") or entry["term"]
                at = child.content.find(context)
                offset = context.find(entry["term"])
                if at < 0 or offset < 0:
                    continue
                start, end = at + offset, at + offset + len(entry["term"])
                if any(start < b and end > a for a, b, _ in spans):
                    continue
                spans.append((start, end, index))
                marked.add(index)
            if spans:
                original, parts, cursor = child.content, [], 0
                for start, end, index in sorted(spans):
                    parts.extend((escape(original[cursor:start]), marker(original[start:end], index, notes[index])))
                    cursor = end
                parts.append(escape(original[cursor:]))
                child.type = "html_inline"
                child.content = "".join(parts)
    return marked
