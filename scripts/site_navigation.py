"""Scope generated page scripts; shared audio is intentionally not page owned."""
from pathlib import Path
import re
from urllib.parse import urlsplit

PERSISTENT = {'/assets/site-i18n.js', '/assets/site-music.js', '/assets/site-navigation.js', '/assets/portal.js'}
ALIASES = 'fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,ResizeObserver,IntersectionObserver,MutationObserver,URL,history,location,matchMedia'
HEADER = '/* site-page-scope:v1 */\n(function(document,window,self,globalThis){\nif(document?.currentScript?.dataset?.homeScope&&document.currentScript.dataset.homeScope!==window.HomeBriefPageId)return;\nconst {' + ALIASES + '}=window;\n'
FOOTER = '\n}).apply(...(()=>{if(typeof module==="object"&&module.exports)return[globalThis,[globalThis.document,globalThis,globalThis,globalThis]];const e=window.SiteNavigation.environment();return[e.window,[e.document,e.window,e.window,e.window]];})());\n'

def original_page_script(source):
    """Recover exact authored bytes for publication integrity checks."""
    if not source.startswith(HEADER) or not source.endswith(FOOTER):
        raise ValueError('Page script has an unexpected scope envelope')
    return source[len(HEADER):-len(FOOTER)]

def wrap_page_scripts(output):
    output = Path(output)
    paths = set()
    for page in output.rglob('*.html'):
        text = page.read_text(encoding='utf-8')
        references = list(re.finditer(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', text))
        references += list(re.finditer(r'\bdata-(?:lunar|d3|earth)-src=["\']([^"\']+)["\']', text))
        for match in references:
            route = urlsplit(match[1]).path
            if route.startswith('/') and not route.startswith('//') and route not in PERSISTENT:
                path = (output / route.lstrip('/')).resolve()
                if not path.is_relative_to(output.resolve()) or path.suffix != '.js':
                    raise ValueError('Unexpected page script path')
                paths.add(path)
    for path in sorted(paths):
        source = path.read_text(encoding='utf-8')
        if source.startswith('/* site-page-scope:v1 */'):
            continue
        # The only entry module exports pure test helpers; its published entry is
        # still a module, with a new scoped instance for each navigation.
        if path.name == 'waline-integration.js':
            source = re.sub(r'\bexport (?=(?:async )?function\b)', '', source)
        path.write_text(HEADER + source + FOOTER, encoding='utf-8', newline='\n')
    return {'page_scripts': len(paths)}
