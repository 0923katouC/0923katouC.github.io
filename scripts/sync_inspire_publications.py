#!/usr/bin/env python3
"""Synchronize the publication cards in academics.html with INSPIRE.

The script resolves the author's INSPIRE BAI from the stable author record
(2107075), queries the INSPIRE literature API with that BAI, and replaces only
the HTML block delimited by INSPIRE_PUBLICATIONS_START/END.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

AUTHOR_RECID = 2107075
AUTHOR_API = f"https://inspirehep.net/api/authors/{AUTHOR_RECID}"
LITERATURE_API = "https://inspirehep.net/api/literature"
PAGE = Path("academics.html")
START = "<!-- INSPIRE_PUBLICATIONS_START -->"
END = "<!-- INSPIRE_PUBLICATIONS_END -->"
USER_AGENT = "CMC-personal-website/1.0 (weekly INSPIRE publication sync)"


def get_json(url: str, attempts: int = 4) -> dict[str, Any]:
    """Fetch JSON with conservative retries for transient API failures."""
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                time.sleep(6)
                continue
            if 500 <= exc.code < 600 and attempt + 1 < attempts:
                time.sleep(2 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
                continue
            raise
    raise RuntimeError(f"INSPIRE request failed: {last_error}")


def resolve_bai() -> str:
    author = get_json(AUTHOR_API)
    metadata = author.get("metadata", {})
    for identifier in metadata.get("ids", []):
        if identifier.get("schema") == "INSPIRE BAI" and identifier.get("value"):
            return str(identifier["value"])
    raise RuntimeError(f"No INSPIRE BAI found for author record {AUTHOR_RECID}")


def fetch_publications(bai: str) -> list[dict[str, Any]]:
    params = {
        "q": f"a {bai}",
        "sort": "mostrecent",
        "size": "100",
        "page": "1",
    }
    url: str | None = f"{LITERATURE_API}?{urllib.parse.urlencode(params)}"
    hits: list[dict[str, Any]] = []

    while url:
        data = get_json(url)
        page_hits = data.get("hits", {}).get("hits", [])
        if not isinstance(page_hits, list):
            raise RuntimeError("Unexpected INSPIRE literature response")
        hits.extend(page_hits)
        next_url = data.get("links", {}).get("next")
        url = str(next_url) if next_url else None

    if not hits:
        raise RuntimeError(f"INSPIRE returned no publications for BAI {bai}; refusing to erase the page")
    return hits


def display_name(full_name: str) -> str:
    """Convert INSPIRE's 'Family, Given' display form to 'Given Family'."""
    if "," not in full_name:
        return full_name.strip()
    family, given = full_name.split(",", 1)
    return f"{given.strip()} {family.strip()}".strip()


def publication_line(metadata: dict[str, Any]) -> str | None:
    candidates = metadata.get("publication_info", []) or []
    info = next((item for item in candidates if item.get("journal_title")), None)
    if not info:
        return None

    journal = html.escape(str(info.get("journal_title", "")))
    volume = html.escape(str(info.get("journal_volume", "")))
    year = html.escape(str(info.get("year", "")))
    issue = html.escape(str(info.get("journal_issue", "")))
    locator = info.get("artid") or info.get("page_start")
    locator = html.escape(str(locator)) if locator else ""

    text = f"<em>{journal}</em>"
    if volume:
        text += f" {volume}"
    if year:
        text += f" ({year})"
    if issue:
        text += f" {issue}"
    if locator:
        text += f", {locator}"
    return text


def render_article(hit: dict[str, Any]) -> str:
    metadata = hit.get("metadata", {})
    control_number = metadata.get("control_number") or hit.get("id")
    if not control_number:
        raise RuntimeError("INSPIRE literature hit is missing a control number")

    titles = metadata.get("titles", []) or []
    title = next((item.get("title") for item in titles if item.get("title")), "Untitled")
    title_html = html.escape(str(title))

    author_names = [
        display_name(str(author.get("full_name", "")))
        for author in metadata.get("authors", []) or []
        if author.get("full_name") and "supervisor" not in (author.get("inspire_roles") or [])
    ]
    if len(author_names) > 10:
        author_names = author_names[:10] + ["et al."]
    authors_html = html.escape(", ".join(author_names))

    meta_parts: list[str] = []
    journal_line = publication_line(metadata)
    if journal_line:
        meta_parts.append(journal_line)

    arxiv_eprints = metadata.get("arxiv_eprints", []) or []
    if arxiv_eprints and arxiv_eprints[0].get("value"):
        arxiv = html.escape(str(arxiv_eprints[0]["value"]))
        meta_parts.append(
            f'<a href="https://arxiv.org/abs/{arxiv}" rel="noopener noreferrer">arXiv:{arxiv}</a>'
        )

    inspire_url = f"https://inspirehep.net/literature/{control_number}"
    meta_parts.append(
        f'<a href="{inspire_url}" rel="noopener noreferrer">INSPIRE ↗</a>'
    )

    meta_html = " · ".join(meta_parts)
    return (
        '        <article class="pub">'
        f"<h3>{title_html}</h3>"
        f"<p>{authors_html}</p>"
        f'<div class="meta">{meta_html}</div>'
        "</article>"
    )


def render_block(hits: list[dict[str, Any]]) -> str:
    articles = "\n".join(render_article(hit) for hit in hits)
    return (
        f"{START}\n"
        '      <div class="pub-list minimal-pubs">\n'
        f"{articles}\n"
        "      </div>\n"
        f"      {END}"
    )


def update_page(block: str) -> bool:
    original = PAGE.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    if not pattern.search(original):
        raise RuntimeError("Publication synchronization markers are missing from academics.html")
    updated = pattern.sub(block, original, count=1)
    if updated == original:
        return False
    PAGE.write_text(updated, encoding="utf-8")
    return True


def main() -> None:
    bai = resolve_bai()
    hits = fetch_publications(bai)
    changed = update_page(render_block(hits))
    print(f"Resolved INSPIRE BAI: {bai}")
    print(f"Publications returned: {len(hits)}")
    print("academics.html updated." if changed else "No publication changes.")


if __name__ == "__main__":
    main()
