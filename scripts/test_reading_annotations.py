"""Exact reviewed occurrences and source text survive shared note marking."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import unittest

from markdown_it import MarkdownIt
from reading_annotations import mark_reviewed_terms
from english_corner import load_english_corner, text_hash

ROOT=Path(__file__).resolve().parent.parent


class Text(HTMLParser):
    def __init__(self,value):
        super().__init__();self.parts=[];self.feed(value)
    def handle_data(self,value):
        self.parts.append(value)


def marker(text,index,entry):
    return '<span data-review-index="'+str(index)+'">'+escape(text)+'</span>'


class AnnotationTokenTests(unittest.TestCase):
    def test_context_first_occurrence_overlap_and_nontext_tokens(self):
        parser=MarkdownIt('commonmark',{'html':False})
        tokens=parser.parse('A bright light. Another light. `light`\n\nA second paragraph.')
        before=parser.renderer.render(tokens,parser.options,{})
        notes=[{'term':'light','context':'bright light'},{'term':'bright light'},{'term':'missing'}]
        self.assertEqual(mark_reviewed_terms(tokens,notes,marker),{0})
        after=parser.renderer.render(tokens,parser.options,{})
        self.assertEqual(Text(before).parts,Text(after.replace('<span data-review-index="0">','').replace('</span>','')).parts)
        self.assertEqual(after.count('data-review-index'),1)
        self.assertIn('<code>light</code>',after)

    def test_markup_is_escaped_and_untouched_terms_are_not_rewritten(self):
        parser=MarkdownIt('commonmark',{'html':False})
        tokens=parser.parse('A <strange> & exact word.')
        before=''.join(Text(parser.renderer.render(tokens,parser.options,{})).parts)
        mark_reviewed_terms(tokens,[{'term':'<strange>'}],marker)
        after=parser.renderer.render(tokens,parser.options,{})
        self.assertIn('&lt;strange&gt;',after)
        self.assertNotIn('<strange>',after)
        self.assertEqual(before,''.join(Text(after).parts))

    def test_every_existing_classic_note_marks_without_altering_the_original(self):
        corner=load_english_corner(ROOT)
        for card in corner['cards']:
            if card['column']!='classics':continue
            with self.subTest(slug=card['slug']):
                raw=card['sections']['原文'];parser=MarkdownIt('commonmark',{'html':False,'breaks':True})
                tokens=parser.parse(raw)
                before=''.join(Text(parser.renderer.render(tokens,parser.options,{})).parts)
                notes=corner['notes'][card['slug']]
                self.assertEqual(mark_reviewed_terms(tokens,notes,marker),set(range(len(notes))))
                after=parser.renderer.render(tokens,parser.options,{})
                self.assertEqual(before,''.join(Text(after).parts))
                self.assertEqual(text_hash(raw),card['work']['excerpt_sha256_lf'])


if __name__=='__main__':unittest.main()
