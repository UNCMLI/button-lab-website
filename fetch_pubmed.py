#!/usr/bin/env python3
"""
fetch_pubmed.py — Update publications.json from PubMed

Usage:
    python fetch_pubmed.py

Requirements:
    pip install requests

This script queries PubMed for publications by Brian Button at UNC,
parses the results, merges them with your existing publications.json
(preserving any manual entries not found in PubMed), and saves the
updated file. Duplicates are detected by PMID.

Configuration: edit the constants below.
"""

import json
import time
import sys
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────────────────────
PUBMED_SEARCH_QUERY = "Button B[Author] AND (UNC OR North Carolina) AND (mucus OR cystic fibrosis OR airway)"
MAX_RESULTS         = 200          # Upper limit on results fetched
OUTPUT_FILE         = "publications.json"
AUTHOR_HIGHLIGHTS   = ["Button B"] # Names to bold in the author list
ESEARCH_URL         = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL          = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
FETCH_BATCH_SIZE    = 50           # PubMed recommends batches ≤ 200
DELAY_BETWEEN_REQS  = 0.4          # seconds — stay within NCBI rate limit (3/s)
# ──────────────────────────────────────────────────────────────────────────────


def search_pubmed(query: str, max_results: int) -> list[str]:
    """Return a list of PMIDs matching the query."""
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "pub+date",
    }
    print(f"Searching PubMed: {query!r}")
    r = requests.get(ESEARCH_URL, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    pmids = data["esearchresult"]["idlist"]
    print(f"  Found {len(pmids)} PMIDs.")
    return pmids


def fetch_records(pmids: list[str]) -> list[dict]:
    """Fetch full article records for a list of PMIDs and return parsed dicts."""
    records = []
    batches = [pmids[i:i + FETCH_BATCH_SIZE] for i in range(0, len(pmids), FETCH_BATCH_SIZE)]
    for batch_num, batch in enumerate(batches, 1):
        print(f"  Fetching batch {batch_num}/{len(batches)} ({len(batch)} records)…")
        params = {
            "db": "pubmed",
            "id": ",".join(batch),
            "rettype": "xml",
            "retmode": "xml",
        }
        r = requests.get(EFETCH_URL, params=params, timeout=60)
        r.raise_for_status()
        parsed = parse_pubmed_xml(r.text)
        records.extend(parsed)
        time.sleep(DELAY_BETWEEN_REQS)
    return records


def get_text(node, path: str, default: str = "") -> str:
    el = node.find(path)
    return (el.text or "").strip() if el is not None else default


def parse_pubmed_xml(xml_text: str) -> list[dict]:
    """Parse PubMed XML and return a list of publication dicts."""
    root = ET.fromstring(xml_text)
    results = []

    for article in root.findall(".//PubmedArticle"):
        try:
            medline = article.find("MedlineCitation")
            art     = medline.find("Article")

            pmid  = get_text(medline, "PMID")

            # Full inner text — titles can contain nested markup (e.g. <i>italics</i>)
            # that get_text() would drop, truncating the title to its first word.
            title_el = art.find("ArticleTitle")
            title = "".join(title_el.itertext()).strip() if title_el is not None else ""
            title = re.sub(r"\s+", " ", title).rstrip(".")

            # Authors
            author_list = art.find("AuthorList")
            authors_raw = []
            if author_list is not None:
                for au in author_list.findall("Author"):
                    last  = get_text(au, "LastName")
                    fore  = get_text(au, "ForeName")
                    initials = get_text(au, "Initials")
                    cname = get_text(au, "CollectiveName")
                    if cname:
                        authors_raw.append(cname)
                    elif last:
                        # Format as "LastName Initials" to match existing style
                        authors_raw.append(f"{last} {initials}".strip())
            authors_str = ", ".join(authors_raw)

            # Journal
            journal_el = art.find("Journal")
            journal    = get_text(journal_el, "ISOAbbreviation") or get_text(journal_el, "Title")
            volume     = get_text(journal_el, "JournalIssue/Volume")
            issue      = get_text(journal_el, "JournalIssue/Issue")

            # Pages
            pagination = art.find("Pagination/MedlinePgn")
            pages      = pagination.text.strip() if pagination is not None and pagination.text else ""

            # Date
            pub_date = journal_el.find("JournalIssue/PubDate") if journal_el is not None else None
            year, month, day = "", "", ""
            if pub_date is not None:
                year  = get_text(pub_date, "Year")
                month = get_text(pub_date, "Month")
                day   = get_text(pub_date, "Day")
            if not year:
                # Fall back to ArticleDate
                art_date = art.find("ArticleDate")
                if art_date is not None:
                    year  = get_text(art_date, "Year")
                    month = get_text(art_date, "Month")
                    day   = get_text(art_date, "Day")

            year_int = int(year) if year.isdigit() else 0
            date_parts = [p for p in [year, month, day] if p]
            date_str   = " ".join(date_parts)

            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"

            record = {
                "pmid":              pmid,
                "year":              year_int,
                "title":             title + ("." if title and not title.endswith(".") else ""),
                "authors":           authors_str,
                "authors_highlight": AUTHOR_HIGHLIGHTS,
                "journal":           journal,
                "volume":            volume,
                "issue":             issue,
                "pages":             pages,
                "date":              date_str,
                "url":               url,
            }
            results.append(record)
        except Exception as e:
            print(f"    Warning: failed to parse one record — {e}")
            continue

    return results


def load_existing(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def merge(existing: list[dict], new_records: list[dict]) -> tuple[list[dict], int, int]:
    """
    Merge new_records into existing, keyed by PMID.
    Returns (merged_list, n_added, n_updated).
    """
    by_pmid = {r["pmid"]: r for r in existing}
    added, updated = 0, 0
    for rec in new_records:
        pmid = rec["pmid"]
        if pmid not in by_pmid:
            by_pmid[pmid] = rec
            added += 1
        else:
            # Update fields that come from PubMed, preserve manual overrides
            existing_rec = by_pmid[pmid]
            changed = False
            for field in ["title", "authors", "journal", "volume", "issue", "pages", "date", "year", "url"]:
                if rec.get(field) and rec[field] != existing_rec.get(field):
                    existing_rec[field] = rec[field]
                    changed = True
            if changed:
                updated += 1

    merged = sorted(by_pmid.values(), key=lambda r: r.get("year", 0), reverse=True)
    return merged, added, updated


def save(records: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(records)} publications to {path}")


def main():
    print("=" * 60)
    print("PubMed → publications.json updater")
    print(f"Query:  {PUBMED_SEARCH_QUERY}")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)

    pmids = search_pubmed(PUBMED_SEARCH_QUERY, MAX_RESULTS)
    if not pmids:
        print("No PMIDs returned. Check your search query.")
        return

    print(f"\nFetching {len(pmids)} records from PubMed…")
    new_records = fetch_records(pmids)
    print(f"Parsed {len(new_records)} records.\n")

    existing = load_existing(OUTPUT_FILE)
    print(f"Existing publications in {OUTPUT_FILE}: {len(existing)}")

    merged, added, updated = merge(existing, new_records)
    print(f"Merge complete: {added} new, {updated} updated, {len(merged)} total.\n")

    save(merged, OUTPUT_FILE)

    # Summary
    years = sorted({r.get("year", 0) for r in merged if r.get("year")}, reverse=True)
    print(f"\nYear range: {years[-1]}–{years[0]}" if years else "")
    print("Done.")


if __name__ == "__main__":
    main()
