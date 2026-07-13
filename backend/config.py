"""Runtime configuration for the FastAPI backend.

Keep secrets in environment variables, not in source files.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BUILDINGS_JSON_PATH = PROJECT_ROOT / "frontend" / "public" / "buildings.json"

ALLOWED_COUNTRY_CODES = frozenset({"se", "gb", "be", "ie"})

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()

VT_CLIENT_ID = os.getenv("VT_CLIENT_ID", "").strip()
VT_CLIENT_SECRET = os.getenv("VT_CLIENT_SECRET", "").strip()
