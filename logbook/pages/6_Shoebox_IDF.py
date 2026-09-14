"""Shoebox & IDF Generation — layout only.

The text for this page lives in ``logbook_content.py`` under the key
``"shoebox_idf"``. Edit it there; nothing in this file needs to change.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from logbook_content import PAGES  # noqa: E402
from scripts.ui_utils import render_page  # noqa: E402

render_page(PAGES["shoebox_idf"])
