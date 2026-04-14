"""
Boverket Klimatdatabas API client.

Provides cached access to Boverket's open climate database for building
materials (>200 generic building resources with GWP data).

API Documentation: https://api-portal.boverket.se/reference#api=klimatdatabas
"""

import json
import urllib.request
import urllib.error
import streamlit as st

BASE_URL = "https://api.boverket.se/klimatdatabas/api/Klimat/v2"

# ── Category ID → English name mapping ─────────────────────────────
CATEGORY_NAMES_EN = {
    2:  "Mineral materials",
    3:  "Energy and fuel",
    4:  "Windows, doors and glass",
    5:  "Paints and sealants",
    6:  "Concrete",
    7:  "Insulation",
    8:  "Steel and other metals",
    9:  "Blocks and tiles",
    10: "Building boards",
    11: "Waterproofing",
    12: "Solid woods",
    13: "Construction product",      # parent
    14: "Energy services",            # parent
    15: "Reused building products",
}


def _api_get(path: str, timeout: int = 12) -> dict | list | str | None:
    """Low-level GET request to the Boverket API.  Returns parsed JSON or None on error."""
    url = f"{BASE_URL}/{path}"
    try:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, Exception):
        return None


# ── Cached public API functions ────────────────────────────────────

@st.cache_data(ttl=86400, show_spinner=False)
def get_latest_version() -> str | None:
    """Return the latest database version string, e.g. '02.07.000'."""
    data = _api_get("GetLatestVersion/sv/json")
    if isinstance(data, dict):
        return data.get("Version")
    return None


@st.cache_data(ttl=86400, show_spinner=False)
def get_all_versions() -> list[str]:
    """Return list of all available version strings."""
    data = _api_get("GetAllVersions/sv/json")
    if isinstance(data, list):
        return data
    return []


@st.cache_data(ttl=86400, show_spinner=False)
def get_categories(version: str | None = None, culture: str = "en") -> list[dict]:
    """
    Return flat list of subcategories.
    Each dict: {"Id": int, "Title": str, "ParentTitle": str}
    """
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetAllCategories/{ver}/{culture}/json")
    if not isinstance(data, dict):
        return []
    result = []
    for parent in data.get("Categories", []):
        parent_title = parent.get("Title", "")
        for child in parent.get("Children", []):
            result.append({
                "Id": child.get("Id"),
                "Title": child.get("Title", ""),
                "ParentTitle": parent_title,
            })
    return result


@st.cache_data(ttl=86400, show_spinner=False)
def get_resources_by_category(
    category_id: int,
    version: str | None = None,
    culture: str = "en",
) -> list[dict]:
    """
    Return resources for one category.
    Each resource is the raw API dict with keys like Name, DataItems,
    Conversions, InventoryUnit, etc.
    """
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetResourcesByCategory/{ver}/{culture}/json?code={category_id}")
    if isinstance(data, dict):
        return data.get("Resources", [])
    return []


@st.cache_data(ttl=86400, show_spinner=False)
def get_all_resources(version: str | None = None, culture: str = "en") -> list[dict]:
    """Return every resource in the database (all categories)."""
    ver = version or get_latest_version() or "02.07.000"
    data = _api_get(f"GetAllResources/{ver}/{culture}/json")
    if isinstance(data, dict):
        return data.get("Resources", [])
    return []


# ── Convenience helpers ────────────────────────────────────────────

def extract_gwp(resource: dict) -> dict:
    """
    Extract GWP values from a resource's DataItems.
    Returns dict like:
        {
            "A1-A3 Conservative": 0.122,
            "A1-A3 Typical": 0.0977,
            "A4": 0.00472,
            "A5.1": 0.00381,
        }
    """
    for di in resource.get("DataItems", []):
        if "GWP" in di.get("PropertyCode", ""):
            return {
                dv["DataModuleCode"]: dv["Value"]
                for dv in di.get("DataValueItems", [])
            }
    return {}


def resource_summary(resource: dict) -> dict:
    """
    Flatten a resource into a summary dict suitable for display in a DataFrame.
    """
    gwp = extract_gwp(resource)
    conversions = {
        c.get("Field", ""): f"{c.get('Value', '')} {c.get('Unit', '')}"
        for c in resource.get("Conversions", [])
    }
    # Get the Boverket classification text
    bov_cat = next(
        (c.get("Text", "") for c in resource.get("Categories", [])
         if c.get("ClassificationType") == "Boverket"),
        "—",
    )

    return {
        "Name": resource.get("Name", ""),
        "Unit": resource.get("InventoryUnit", ""),
        "GWP A1-A3 (Conservative)": gwp.get("A1-A3 Conservative", "—"),
        "GWP A1-A3 (Typical)": gwp.get("A1-A3 Typical", "—"),
        "GWP A4 (Transport)": gwp.get("A4", "—"),
        "GWP A5.1 (Installation)": gwp.get("A5.1", "—"),
        "Density / Conversion": conversions.get("Volume", conversions.get("Area", "—")),
        "Waste Factor": resource.get("WasteFactor", "—"),
        "Category": bov_cat,
    }
