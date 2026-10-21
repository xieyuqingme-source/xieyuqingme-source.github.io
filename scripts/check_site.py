"""Check the whole unified publication without a browser or network."""
import argparse
import json
from build_site import check_site, check_publication_metadata, default_root
from build_site import OUTPUT
from build_blog import Blog
from english_site import check_english_publication

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", default=default_root())
    parser.add_argument("--require-complete-translations", action="store_true")
    args = parser.parse_args()
    report = check_site(args.site_url)
    report["metadata"] = check_publication_metadata(args.site_url)
    blog = Blog(args.site_url.rstrip("/") + "/articles")
    blog.collect()
    report["english"] = check_english_publication(blog, OUTPUT, args.site_url.rstrip("/"), args.require_complete_translations)
    print(json.dumps(report, ensure_ascii=False, indent=2))
