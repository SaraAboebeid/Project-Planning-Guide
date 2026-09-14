# Project Planning Guide — Logbook

An interactive Streamlit logbook recording how this decision-support tool is
built: the datasets it ingests, how they are processed, how buildings are
simulated, and how renovation options are prioritised and chosen.

Same pattern as [DT4PED_logbook](https://github.com/SaraAboebeid/DT4PED_logbook)
— numbered pages walking through the pipeline, content separated from layout,
and per-page Markdown export.

## Prerequisites

- Windows with Python 3.10+ on PATH
- Nothing else — the logbook has its own virtual environment and does **not**
  share dependencies with the main tool

## Quick start

1. Open a terminal in this folder.
2. Install dependencies — double-click `setup.bat`, or:
   ```powershell
   .\setup.bat
   ```
3. Start it — double-click `run.bat`, or:
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
| `Tool.py` | Entry point — builds the grouped sidebar with `st.navigation`, nothing else |
| `home.py` | The home page (sidebar entry "Tool") — contents, live repository state, consistency check |
| `logbook_content.py` | **All prose, plus the sidebar groups (`NAV`, at the bottom). This is the file to edit.** |
| `scripts/ui_utils.py` | Layout helpers, file introspection, Markdown/zip export |
| `scripts/check_content.py` | Validator — run it after editing content |
| `pages/` | One file per page, named `<number>_<Name>.py`; intentionally thin |
| `requirements.txt` | `streamlit`, `pandas` |

## Pages

Sweden and the UK are built by separate chains from different sources —
Sweden takes footprints from EUBUCCO and joins certificates **geometrically**;
the UK takes footprints from **OpenStreetMap** and joins certificates **by
address** (UPRN, or postcode plus house number), falling back to English Housing
Survey band priors. Only the output schema is shared.

So the three topics where they differ are single pages with a **Sweden** tab and
a **United Kingdom** tab at the top, rather than alternating SE / UK sections.
Everything else applies to both countries.

| Group | # | Page | Stage |
|---|---|---|---|
| **Data & pipelines** | 1 | Data Sources — *Sweden / United Kingdom tabs* | raw |
| | 2 | Coverage & Quality — *Sweden / United Kingdom tabs* | metadata |
| | 3 | Pipelines — *Sweden / United Kingdom tabs* | interim |
| | 4 | Scraped Market Data (Boplats & Booli, Sweden only) | raw |
| **Methods** | 5 | Digital Twin Construction | processed |
| | 6 | Shoebox & IDF Generation | method |
| | 7 | Simulation Process | method |
| | 8 | Retrofit Prioritisation | method |
| | 9 | Optimisation Process | method |
| | 10 | Decision Analysis under Uncertainty | method |
| | 11 | AI, ML & Vision Models | method |
| | 12 | Climate & Environmental Analysis | method |
| | 13 | Viewer Layers & Visualisation | result |
| | 14 | Analysis Inventory | method |
| **Reference** | 15 | Services, Keys & Access | metadata |
| | 16 | Script Browser | metadata |
| | 17 | Known Limitations | metadata |
| | 18 | Project Team & Credits | metadata |

*Services, Keys & Access* holds what is tool-wide rather than per country — the
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
text in `UK_*` / `UK_PIPELINE` — edit those. They look like ordinary pages but
have no `number`, because they are tabs, not sidebar entries. To give another
page country tabs, give it a `tabs` list the same way.

**To move a page between groups or reorder the sidebar:** edit `NAV` at the
bottom of `logbook_content.py`. Page numbers must then be renumbered to read
1, 2, 3… down the sidebar (rename the matching `pages/` files too) — the
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
Use it rather than writing something plausible — an unverified method
description in a logbook is worse than an acknowledged gap.

**After editing, validate:**

```powershell
.\.venv\Scripts\python.exe scripts\check_content.py
```

It checks that page numbers are contiguous, that every page has a file in
`pages/`, that the sidebar (`NAV`) lists every page exactly once and in number
order, that every cited path still exists in the repository, and — the one that
actually bites — that every `**N. Title**` cross-reference points at a page that
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
something that no longer exists — which is exactly how the older documentation
in this repository went stale.

## Relationship to the main tool

Read-only. The logbook reads the repository it sits in — `CODEMAP.md`, source
files, git metadata — but never writes to it, never imports the backend, and
runs in its own environment. Starting or stopping it cannot affect the running
app.
