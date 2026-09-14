"""Validate logbook_content.py without launching Streamlit.

Run after editing content:

    .venv\\Scripts\\python.exe scripts\\check_content.py

Checks
------
1. Page numbers are unique and run 1..N with no gaps.
2. Every page in PAGES has a matching file in pages/ with the right prefix,
   and the sidebar (NAV) lists every page exactly once, numbered in order.
3. Every "**N. Title**" cross-reference in the prose points at a page that
   really has that number and title. This is the one that bites: renumbering
   pages silently invalidates every reference to them.
4. Every path in a section's `files` list exists in the repository.

Exits non-zero if anything fails, so it can be wired into a pre-commit hook.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from logbook_content import NAV, PAGES  # noqa: E402

LOGBOOK_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = LOGBOOK_DIR.parent
PAGES_DIR = LOGBOOK_DIR / "pages"

# "**4. Sweden Pipeline**" — the space after the dot keeps "**1.88 million**"
# from matching.
XREF = re.compile(r"\*\*(\d+)\.\s+([^*]+?)\*\*")

errors: list[str] = []
warnings: list[str] = []


def parts_of(page: dict):
    """(prefix, content dict) for a page: itself, or one entry per country tab."""
    if page.get("tabs"):
        return [(f"tab:{label}/", part) for label, part in page["tabs"]]
    return [("", page)]


def prose_of(page: dict):
    """Yield (where, text) for every prose field on a page, tabs included."""
    if page.get("tabs") and page.get("purpose"):
        yield "purpose", page["purpose"]
    for prefix, part in parts_of(page):
        if part.get("purpose"):
            yield prefix + "purpose", part["purpose"]
        ov = part.get("overview")
        if ov:
            for label, text in ov["items"]:
                yield f"{prefix}overview:{label}", text
        for sec in part.get("sections", []):
            if sec.get("body"):
                yield f"{prefix}section:{sec['title']}", sec["body"]
            for field, value in (sec.get("dataset") or {}).items():
                for text in (value if isinstance(value, list) else [value]):
                    yield f"{prefix}dataset:{sec['title']}:{field}", str(text)
        if part.get("todo"):
            yield prefix + "todo", part["todo"]


# 1 ── numbering ─────────────────────────────────────────────────────────────
numbers = sorted(p["number"] for p in PAGES.values())
expected = list(range(1, len(PAGES) + 1))
if numbers != expected:
    errors.append(f"page numbers are {numbers}, expected {expected}")

by_number = {p["number"]: p for p in PAGES.values()}
if len(by_number) != len(PAGES):
    errors.append("two pages share a number")

# 2 ── page files ────────────────────────────────────────────────────────────
on_disk = {f.name for f in PAGES_DIR.glob("*.py")}
for key, page in PAGES.items():
    prefix = f"{page['number']}_"
    if not any(f.startswith(prefix) for f in on_disk):
        errors.append(f"no file in pages/ starting '{prefix}' for '{page['title']}'")

for fname in sorted(on_disk):
    num = fname.split("_", 1)[0]
    if num.isdigit() and int(num) not in by_number:
        errors.append(f"pages/{fname} has no entry in PAGES")

# 2b ── sidebar (NAV) ────────────────────────────────────────────────────────
# Tool.py builds the sidebar with st.navigation, which switches off automatic
# pages/ discovery - so a page missing from NAV simply vanishes from the app.
nav_keys = [k for _, keys in NAV for k in keys]
for key in PAGES:
    if nav_keys.count(key) != 1:
        errors.append(f"NAV lists page '{key}' {nav_keys.count(key)} times (must be exactly 1)")
for key in nav_keys:
    if key not in PAGES:
        errors.append(f"NAV lists '{key}', which is not in PAGES")
# numbers must read 1, 2, 3 ... down the sidebar, so "**N. Title**" references
# point where a reader would expect
nav_numbers = [PAGES[k]["number"] for k in nav_keys if k in PAGES]
if nav_numbers != list(range(1, len(nav_numbers) + 1)):
    errors.append(f"page numbers do not follow NAV order: {nav_numbers}")

# 3 ── cross-references ──────────────────────────────────────────────────────
xref_count = 0
for key, page in PAGES.items():
    for where, text in prose_of(page):
        for num_s, title in XREF.findall(text):
            num = int(num_s)
            # References wrap across lines in the source strings, so collapse
            # whitespace before comparing ("Known\nLimitations").
            title = " ".join(title.split())
            target = by_number.get(num)
            if target is None:
                errors.append(
                    f"{key}/{where}: refers to page {num}, which does not exist"
                )
                continue
            # references may abbreviate ("3. Data Provenance" for
            # "Data Provenance & Access"), so accept a prefix
            if not target["title"].lower().startswith(title.lower()):
                errors.append(
                    f"{key}/{where}: '**{num}. {title}**' but page {num} is "
                    f"'{target['title']}'"
                )
            else:
                xref_count += 1

# 4 ── cited files ───────────────────────────────────────────────────────────
file_count = 0
for key, page in PAGES.items():
    for prefix, part in parts_of(page):
        for sec in part.get("sections", []):
            for rel in sec.get("files", []):
                file_count += 1
                if not (REPO_ROOT / rel).exists():
                    warnings.append(f"{key}/{prefix}{sec['title']}: '{rel}' not found in repo")

# 5 ── dataset cards ─────────────────────────────────────────────────────────
ACCESS = {"Live API", "Downloaded once", "Fetched & cached", "Scraped", "Derived", "Synthetic"}
STAGES = {"raw", "interim", "processed", "metadata", "method", "result", "reference", "synthetic"}
REQUIRED = ("publisher", "access", "source_version", "stored_as", "stage", "used_in")
card_count = 0
for key, page in PAGES.items():
    for prefix, part in parts_of(page):
        for sec in part.get("sections", []):
            ds = sec.get("dataset")
            if not ds:
                continue
            card_count += 1
            where = f"{key}/{prefix}{sec['title']}"
            for field in REQUIRED:
                if not ds.get(field):
                    errors.append(f"{where}: dataset card is missing '{field}'")
            if ds.get("access") and ds["access"] not in ACCESS:
                errors.append(f"{where}: access '{ds['access']}' is not one of {sorted(ACCESS)}")
            if ds.get("stage") and ds["stage"] not in STAGES:
                errors.append(f"{where}: stage '{ds['stage']}' is not one of {sorted(STAGES)}")
            if ds.get("link") and not ds["link"].startswith(("http://", "https://")):
                errors.append(f"{where}: link is not a URL: {ds['link']!r}")
            for rel in list(ds.get("local", [])) + list(ds.get("processed_by", [])):
                if not (REPO_ROOT / rel).exists():
                    warnings.append(f"{where}: dataset path '{rel}' not found in repo")

# ── report ──────────────────────────────────────────────────────────────────
print(f"pages:            {len(PAGES)}")
print(f"cross-references: {xref_count} valid")
print(f"cited files:      {file_count} checked")
print(f"dataset cards:    {card_count} checked")
print()

for w in warnings:
    print(f"WARN  {w}")
for e in errors:
    print(f"ERROR {e}")

if errors:
    print(f"\n{len(errors)} error(s).")
    sys.exit(1)
print("OK" + (f" ({len(warnings)} warning(s))" if warnings else ""))
