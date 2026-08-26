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
| `Tool.py` | Entry point — contents, live repository state, consistency check. Its filename is the first sidebar entry, so it reads "Tool" |
| `logbook_content.py` | **All prose. This is the file to edit.** |
| `scripts/ui_utils.py` | Layout helpers, file introspection, Markdown/zip export |
| `scripts/check_content.py` | Validator — run it after editing content |
| `pages/` | One file per page, ordered by numeric prefix; intentionally thin |
| `requirements.txt` | `streamlit`, `pandas` |

## Pages

| # | Page | Stage |
|---|---|---|
| 1 | Data Portal | raw |
| 2 | Script Browser | metadata |
| 3 | Data Provenance & Access | metadata |
| 4 | **Sweden Pipeline** | interim |
| 5 | **UK Pipeline** | interim |
| 6 | Digital Twin Construction | processed |
| 7 | Shoebox & IDF Generation | method |
| 8 | Simulation Process | method |
| 9 | Retrofit Prioritisation | method |
| 10 | Optimisation Process | method |
| 11 | Decision Analysis under Uncertainty | method |
| 12 | Façade Inspection & Defect ML | method |
| 13 | Climate & Environmental Analysis | method |
| 14 | Viewer Layers & Visualisation | result |
| 15 | Known Limitations | metadata |
| 16 | Project Team & Credits | metadata |

Sweden and the UK get a page each because the chains genuinely differ: Sweden
takes footprints from EUBUCCO and joins certificates **geometrically**; the UK
takes footprints from **OpenStreetMap** and joins certificates **by address**
(UPRN, or postcode plus house number), falling back to English Housing Survey
band priors. Only the output schema is shared.

## How to edit

**To change text:** open `logbook_content.py` and edit the relevant dict. Each
page is `{number, title, stage, purpose, overview?, sections[], todo?}`. Section
bodies are plain Markdown.

**To add a page:** add a dict to `logbook_content.py`, register it in the `PAGES`
mapping at the bottom, then create `pages/N_Title.py` containing:

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
`pages/`, that every cited path still exists in the repository, and — the one
that actually bites — that every `**N. Title**` cross-reference points at a page
that really has that number. Renumbering pages silently invalidates references
to them, and there is no other way to notice.

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
