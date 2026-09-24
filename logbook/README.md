# Project Planning Guide - Logbook

An interactive Streamlit logbook recording how this decision-support tool is
built: the datasets it ingests, how they are processed, how buildings are
simulated, and how renovation options are prioritised and chosen.

Same pattern as [DT4PED_logbook](https://github.com/SaraAboebeid/DT4PED_logbook)
- numbered pages walking through the pipeline, content separated from layout,
and per-page Markdown export.

## Prerequisites

- Windows with Python 3.10+ on PATH
- Nothing else - the logbook has its own virtual environment and does **not**
  share dependencies with the main tool

## Quick start

1. Open a terminal in this folder.
2. Install dependencies - double-click `setup.bat`, or:
   ```powershell
   .\setup.bat
   ```
3. Start it - double-click `run.bat`, or:
   ```powershell
   .\run.bat          # port 8501
   .\run.bat 8502     # a different port
   ```
4. Open http://localhost:8501

> **Editing text?** You only ever need one file: **`logbook_content.py`**.
> Everything shown in the logbook comes from there.

## Structure

| Path | What it is |
|---|---|
| `Tool.py` | Entry point - builds the grouped sidebar with `st.navigation`, nothing else |
| `home.py` | The home page (sidebar entry "Tool") - contents, live repository state, consistency check |
| `logbook_content.py` | **All prose, plus the sidebar groups (`NAV`, at the bottom). This is the file to edit.** |
| `file_viewer.py` | The **Script Explorer** page (sidebar: Data & pipelines → Script Explorer, URL `file?path=…` - the url kept its old name so every citation link still resolves) |
| `data_explorer.py` | The **Data Explorer** page (sidebar: Data & pipelines → Data Explorer, URL `data-explorer`) - browse the tool's datasets read-only |
| `scripts/explorer.py` | The Data Explorer's loaders, maps and charts (buildings, certificates, market, simulations, weather, traffic, reference tables) |
| `scripts/analysis_gallery.py` | The Analysis Inventory's cards, recordings and live examples |
| `scripts/live_requests.py` | The requests the live examples send to the backend (`PPG_API`, default `http://127.0.0.1:8080`), and their presets |
| `assets/analysis/` | Recordings of the viewer analyses (`*.gif`) and the stored fallback results (`examples/*.json`) |
| `scripts/ui_utils.py` | Layout helpers, file links, Markdown/zip export |
| `scripts/file_preview.py` | The viewer's previews, one per file format |
| `scripts/check_content.py` | Validator - run it after editing content |
| `pages/` | One file per page, named `<number>_<Name>.py`; intentionally thin |
| `requirements.txt` | `streamlit`, `pandas`, `duckdb` (Streamlit brings `altair` and `pydeck` for the charts and maps) |

## Opening a script or data file

Every file path in the logbook is a link (purple, dotted underline) that opens
the **Script Explorer** in a new tab. It always shows the version on disk
now, read-only:

| File | What the viewer shows |
|---|---|
| Scripts and config (`.py`, `.ts`, `.tsx`, `.js`, `.ps1`, `.yml` …) | the full source with syntax highlighting and line numbers |
| Markdown | rendered, with a tab for the source |
| JSON / GeoJSON | the records as a table, how many records fill each field, the structure |
| DuckDB, SQLite, GeoPackage | tables with row counts, the first 100 rows, the columns |
| Parquet | the first rows and the column types |
| EPW weather | the station, a year-at-a-glance summary, the hourly rows |
| LAS / LAZ laser tiles | point count, extent, file creation date (from the header) |
| CSV, zip, OpenDocument spreadsheets, images, folders | a table, the member list, the sheet names, the image, the folder contents |

Each file also gets **Open in VS Code** (this computer only), a link to the
**committed version on GitHub** when the file is tracked (with a note if the
local copy has uncommitted changes), and a download button for files up to
50 MB.

**What it will open.** The logbook also listens on the network address, so the
viewer is deliberately *not* a general way into the repository: it opens only
files the logbook cites - section file lists, dataset cards, file-like `code`
in the text, and the links in `CODEMAP.md` - plus anything inside a cited
folder. `.env` files, keys, `.git` and virtual environments are refused even
if cited. To make a new file viewable, cite it on a page.

## Pages

Sweden and the UK are built by separate chains from different sources -
Sweden takes footprints from EUBUCCO and joins certificates **geometrically**;
the UK takes footprints from **OpenStreetMap** and joins certificates **by
address** (UPRN, or postcode plus house number), falling back to English Housing
Survey band priors. Only the output schema is shared.

So the three topics where they differ are single pages with a **Sweden** tab and
a **United Kingdom** tab at the top, rather than alternating SE / UK sections.
Everything else applies to both countries.

| Group | # | Page | Stage |
|---|---|---|---|
| **Data & pipelines** | 1 | Data Sources - *Sweden / United Kingdom tabs* | raw |
| | 2 | Coverage & Quality - *Sweden / United Kingdom tabs* | metadata |
| | 3 | Pipelines - *Sweden / United Kingdom tabs* | interim |
| | 4 | Scraped Market Data (Boplats & Booli, Sweden only) | raw |
| | – | Data Explorer and Script Explorer - *interactive, unnumbered; they sit directly after Data Sources* | – |
| **Methods** | 5 | Digital Twin Construction | processed |
| | 6 | Energy Simulation - EPSM & IDF | method |
| | 7 | Retrofit Prioritisation | method |
| | 8 | Optimisation Process | method |
| | 9 | Decision Analysis under Uncertainty | method |
| | 10 | AI, ML & Vision Models | method |
| | 11 | Climate & Environmental Analysis | method |
| | 12 | Viewer Layers & Visualisation - *Sweden / United Kingdom tabs* | result |
| | 13 | Analysis Inventory - *recordings and live examples* | method |
| **Reference** | 14 | Services, Keys & Access | metadata |
| | 15 | Script Browser | metadata |
| | 16 | Known Limitations | metadata |
| | 17 | Project Team & Credits | metadata |

*Services, Keys & Access* holds what is tool-wide rather than per country - the
simulation and ML services, the AI providers, the map tiles and the list of
keys in `.env`.

## How to edit

**To change text:** open `logbook_content.py` and edit the relevant dict. Each
page is `{number, title, nav_title?, stage, purpose, overview?, sections[], todo?}`.
Section bodies are plain Markdown. `nav_title` is an optional shorter label for
the sidebar.

**Tabbed pages** (Data Sources, Coverage & Quality, Pipelines) have
`"tabs": [("Sweden", SE_DATA), ("United Kingdom", UK_DATA)]` instead of their own
sections. The Swedish text is in the `SE_*` / `SWEDEN_PIPELINE` dicts and the UK
text in `UK_*` / `UK_PIPELINE` - edit those. They look like ordinary pages but
have no `number`, because they are tabs, not sidebar entries. To give another
page country tabs, give it a `tabs` list the same way.

**Dataset cards** (Data Sources). A section describing a *dataset* carries a
`"dataset": {...}` dict instead of a `files` list, and renders as a card about
the data rather than a table of code files:

| Field | What goes in it |
|---|---|
| `publisher`, `link` | who publishes it, and where |
| `access` | `Live API` · `Downloaded once` · `Fetched & cached` · `Scraped` · `Derived` · `Synthetic` |
| `connection`, `format` | endpoint / bucket / page, key needed, file format |
| `source_version` | the publisher's own version or update date - write "not stated by the publisher" rather than guessing, and mark inferences as such |
| `local`, `refresh` | paths of our copy (its date is **read from disk** when the page loads) and how it is refreshed |
| `stored_as` | database, file cache, static JSON, or not stored |
| `stage`, `stage_note` | `raw` · `processed` · `reference` (lookup table of published values) · `synthetic` (made-up numbers) … |
| `used_in`, `processed_by` | where in the tool it is used, and the scripts that transform it |

`source_short` / `copy_short` are short forms for the automatic **At a glance**
table each tab gets. The validator checks required fields, allowed values, that
URLs are URLs and that `local` / `processed_by` paths exist.

**To move a page between groups or reorder the sidebar:** edit `NAV` at the
bottom of `logbook_content.py`. Page numbers must then be renumbered to read
1, 2, 3… down the sidebar (rename the matching `pages/` files too) - the
validator below tells you exactly what is out of step.

**To add a page:** add a dict to `logbook_content.py`, register it in the `PAGES`
mapping, add its key to the right group in `NAV`, then create
`pages/<number>_<Name>.py` containing:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from logbook_content import PAGES
from scripts.ui_utils import render_page

render_page(PAGES["your_key"])
```

**To flag a gap:** set `"todo"` on the page. It renders as a visible warning.
Use it rather than writing something plausible - an unverified method
description in a logbook is worse than an acknowledged gap.

**After editing, validate:**

```powershell
.\.venv\Scripts\python.exe scripts\check_content.py
```

It checks that page numbers are contiguous, that every page has a file in
`pages/`, that the sidebar (`NAV`) lists every page exactly once and in number
order, that every cited path still exists in the repository, and - the one that
actually bites - that every `**N. Title**` cross-reference points at a page that
really has that number. Renumbering pages silently invalidates references to
them, and there is no other way to notice.

The NAV check matters because the sidebar is built with `st.navigation`, which
switches off Streamlit's automatic `pages/` discovery: a page left out of `NAV`
does not error, it simply disappears.

## Two design choices worth knowing

**Content is separated from layout.** Pages contain no prose, so text can be
revised without touching Streamlit code and the whole logbook can be exported
mechanically.

**Pages resolve file references against the real repository at run time.** Every
`files` list is checked on load, and anything missing is flagged in red. A page
citing code that has been deleted says so instead of quietly describing
something that no longer exists - which is exactly how the older documentation
in this repository went stale.

## Relationship to the main tool

Read-only. The logbook reads the repository it sits in - `CODEMAP.md`, source
files, git metadata - but never writes to it, never imports the backend, and
runs in its own environment. Starting or stopping it cannot affect the running
app.
