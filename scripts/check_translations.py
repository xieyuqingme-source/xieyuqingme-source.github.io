"""Check static English translation coverage and source freshness without network calls."""
import argparse
import json
from build_blog import Blog
from english_site import translation_report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-complete", action="store_true", help="Fail for pending or stale Chinese translations.")
    args = parser.parse_args()
    blog = Blog("https://xieyuqing.me/articles")
    blog.collect()
    print(json.dumps(translation_report(blog, args.require_complete), ensure_ascii=False, indent=2))
