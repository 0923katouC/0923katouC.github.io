#!/usr/bin/env python3
"""Synchronize shared head assets, clean internal links, nav labels, and accessibility hooks across static HTML pages.

Usage:
  python3 scripts/sync_site_head.py --apply
  python3 scripts/sync_site_head.py --check
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_VERSION = "20261126-ui1"

SHARED_ASSETS = {
    "/assets/css/style.css",
    "/assets/css/site-navigation.css",
    "/assets/css/site-ui.css",
    "/assets/css/liquid-glass.css",
    "/assets/css/site-motion.css",
    "/assets/css/home.css",
    "/assets/css/academics.css",
    "/assets/css/photography-background.css",
    "/assets/css/photography-entries.css",
    "/assets/css/photography-topics.css",
    "/assets/css/collection-backgrounds.css",
    "/assets/css/collection-entries.css",
    "/assets/css/project-navigation.css",
    "/assets/css/playground.css",
    "/assets/css/blog.css",
    "/assets/css/fiction.css",
    "/assets/css/essay-entry.css",
    "/assets/css/pond.css",
    "/assets/js/main.js",
    "/assets/js/site-ui.js",
    "/assets/js/site-motion.js",
    "/assets/js/liquid-glass.js",
    "/assets/js/lang-preload.js",
    "/assets/js/photo-lightbox.js",
    "/assets/js/photography-cards.js",
    "/assets/js/playground.js",
}

GALLERY_PAGES = {
    "photography/topics/astronomy.html",
    "photography/topics/birds.html",
    "photography/topics/conventions.html",
    "photography/topics/outdoor.html",
}

ASSET_RE = re.compile(r'((?:href|src)=")(/assets/(?:css|js)/[^"?]+)(\?v=[^"]*)?(")')


def transform_html(rel: str, text: str) -> str:
    # 1. Remove render-blocking attribute from deferred motion script.
    text = text.replace(' defer blocking="render">', ' defer>')

    # 2. Ensure site-navigation.css is linked directly before style.css (no CSS @import waterfall).
    if "/assets/css/style.css" in text and "/assets/css/site-navigation.css" not in text:
        text = re.sub(
            r'([ \t]*)(<link rel="stylesheet" href="/assets/css/style\.css[^"]*">)',
            rf'\1<link rel="stylesheet" href="/assets/css/site-navigation.css?v={ASSET_VERSION}">\n\1\2',
            text,
            count=1,
        )

    # 3. Ensure favicon links exist right after </title>.
    if 'rel="icon"' not in text and "rel='icon'" not in text:
        text = re.sub(
            r'([ \t]*)(<title[^>]*>.*?</title>)',
            r'\1\2\n\1<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n\1<link rel="alternate icon" href="/favicon.ico">',
            text,
            count=1,
            flags=re.S,
        )

    # 4. Preload saved language preference in <head> on bilingual pages to prevent EN FOUC.
    if "lang-switch" in text and "/assets/js/lang-preload.js" not in text:
        text = re.sub(
            r'([ \t]*)(<link rel="(?:alternate )?icon"[^>]*>\n?)',
            lambda m: m.group(0),
            text,
            count=1,
        )
        if '<link rel="alternate icon" href="/favicon.ico">' in text:
            text = re.sub(
                r'([ \t]*)(<link rel="alternate icon" href="/favicon\.ico">)',
                rf'\1\2\n\1<script src="/assets/js/lang-preload.js?v={ASSET_VERSION}"></script>',
                text,
                count=1,
            )
        else:
            text = re.sub(
                r'([ \t]*)(<title[^>]*>.*?</title>)',
                rf'\1\2\n\1<script src="/assets/js/lang-preload.js?v={ASSET_VERSION}"></script>',
                text,
                count=1,
                flags=re.S,
            )

    # 5. Unify shared CSS/JS asset version query strings.
    def replace_asset(match: re.Match[str]) -> str:
        prefix, path, _, suffix = match.groups()
        if path in SHARED_ASSETS:
            return f"{prefix}{path}?v={ASSET_VERSION}{suffix}"
        return match.group(0)

    text = ASSET_RE.sub(replace_asset, text)

    # 6. Strip legacy ?v=20260911-glass1 query parameter from internal HTML links.
    text = text.replace('href="/?v=20260911-glass1"', 'href="/"')
    text = re.sub(r'href="(/[^"?#]+\.html)\?v=20260911-glass1"', r'href="\1"', text)

    # 7. Unify Home navigation label in Chinese & English.
    text = text.replace(
        'data-zh="Home page" data-en="Home page">Home page</a>',
        'data-zh="首页" data-en="Home">首页</a>',
    )

    # 8. Add aria-current="page" to active top-level nav links missing aria-current.
    text = re.sub(
        r'<a class="active" href="',
        '<a class="active" aria-current="page" href="',
        text,
    )

    # 9. Add skip-to-content link on ui-page layouts that have a bare <main> without skip link.
    if (
        "ui-page" in text
        and "skip-link" not in text
        and "blog-skip" not in text
        and "<main>" in text
    ):
        text = re.sub(
            r'(<body[^>]*>\n?)',
            r'\1  <a class="skip-link" href="#main" data-zh="跳到正文" data-en="Skip to content">跳到正文</a>\n',
            text,
            count=1,
        )
        text = text.replace("<main>", '<main id="main">', 1)

    # 10. Attach photo lightbox script to photography topic galleries.
    if rel in GALLERY_PAGES and "/assets/js/photo-lightbox.js" not in text:
        text = text.replace(
            "</body>",
            f'  <script src="/assets/js/photo-lightbox.js?v={ASSET_VERSION}" defer></script>\n</body>',
            1,
        )

    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true", help="Update HTML files in place")
    mode.add_argument("--check", action="store_true", help="Fail if any HTML file drifts")
    args = parser.parse_args()

    html_files = sorted(
        f for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)
        if "/tests/" not in f.replace(os.sep, "/")
    )

    changed = []
    for path in html_files:
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        with open(path, encoding="utf-8") as fh:
            original = fh.read()
        updated = transform_html(rel, original)
        if updated != original:
            changed.append(rel)
            if args.apply:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(updated)

    if args.check:
        if changed:
            print("HTML drift detected in:", ", ".join(changed), file=sys.stderr)
            return 1
        print(f"OK: {len(html_files)} HTML pages are synchronized.")
        return 0

    print(f"Updated {len(changed)}/{len(html_files)} HTML pages.")
    for rel in changed:
        print(f"  - {rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
