"""
U-values from an EPC's fabric descriptions (RdSAP wording), so the energy model
starts from the building as it is today (filled cavities, loft insulation,
double glazing) rather than TABULA's uninsulated as-built archetype.

The descriptions come from the register's full-load CSV (walls_description,
roof_description, windows_description, floor_description) and follow RdSAP's
fixed phrasing, e.g. "Cavity wall, filled cavity", "Pitched, 270 mm loft
insulation", "Fully double glazed", "Average thermal transmittance 0.28 W/m²K".

Values approximate RdSAP 2012/10 Appendix S defaults: walls by construction
and age band (Table S6), loft insulation by thickness (Table S9), glazing by
type (Table S14). They are screening-level defaults, not measured U-values;
an explicit "Average thermal transmittance" on the certificate always wins.
Descriptions that don't bound the fabric (another dwelling above/below) or
that don't parse return None, and the caller falls back to TABULA.
"""
from __future__ import annotations

import re

# Construction-age band -> index 0..7 over the RdSAP England & Wales bands:
# 0 pre-1976 (A-E), 1 1976-82 (F), 2 1983-90 (G), 3 1991-95 (H), 4 1996-2002 (I),
# 5 2003-06 (J), 6 2007-11 (K), 7 2012+ (L).
_BAND_LETTER = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 1, "G": 2, "H": 3, "I": 4, "J": 5, "K": 6, "L": 7}


def age_index(age_band: str | None) -> int:
    """'England and Wales: 1950-1966' / 'J' / '2012 onwards' -> 0..7 (unknown -> 0, the conservative end)."""
    s = (age_band or "").strip()
    if len(s) == 1 and s.upper() in _BAND_LETTER:
        return _BAND_LETTER[s.upper()]
    years = [int(y) for y in re.findall(r"(1[89]\d{2}|20\d{2})", s)]
    if not years:
        return 0
    y = max(years) if "onwards" not in s.lower() else min(years) + 1
    for limit, idx in ((1975, 0), (1982, 1), (1990, 2), (1995, 3), (2002, 4), (2006, 5), (2011, 6)):
        if y <= limit:
            return idx
    return 7


# Walls, as built, by age index (RdSAP Table S6, England).
_WALL_AS_BUILT = {
    "cavity":        [1.5, 1.0, 0.6, 0.6, 0.45, 0.35, 0.30, 0.28],
    "solid brick":   [2.0, 1.7, 1.0, 0.6, 0.6, 0.45, 0.35, 0.30],
    "stone":         [2.3, 1.7, 1.0, 0.6, 0.6, 0.45, 0.35, 0.30],
    "timber frame":  [1.9, 0.8, 0.45, 0.40, 0.40, 0.35, 0.30, 0.28],
    "system built":  [2.0, 1.0, 0.6, 0.6, 0.45, 0.35, 0.30, 0.28],
}
_FILLED_CAVITY = [0.7, 0.4, 0.35, 0.35, 0.35, 0.35, 0.30, 0.28]
_WALL_INSULATED = 0.35   # solid/system wall with internal or external insulation (~100 mm)

# Pitched roof, insulation between joists: thickness mm -> U (RdSAP Table S9).
_LOFT = [(0, 2.3), (12, 1.5), (25, 1.0), (50, 0.68), (75, 0.5), (100, 0.4), (125, 0.35), (150, 0.3),
         (175, 0.25), (200, 0.21), (225, 0.19), (250, 0.17), (270, 0.16), (300, 0.14), (350, 0.12), (400, 0.11)]

_ATT = re.compile(r"average thermal transmittance\s*=?\s*([0-9]*\.?[0-9]+)", re.I)


def _explicit(desc: str) -> float | None:
    m = _ATT.search(desc)
    return float(m.group(1)) if m else None


def wall_u(desc: str | None, age_band: str | None = None) -> float | None:
    d = (desc or "").lower()
    if not d:
        return None
    if (u := _explicit(d)) is not None:
        return u
    i = age_index(age_band)
    if "cavity" in d:
        if "filled" in d or ("insulated" in d and "no insulation" not in d):
            return _FILLED_CAVITY[i]
        return _WALL_AS_BUILT["cavity"][i]
    kind = ("solid brick" if "solid brick" in d else
            "stone" if any(k in d for k in ("granite", "whinstone", "sandstone", "limestone")) else
            "timber frame" if "timber frame" in d else
            "system built" if "system built" in d else None)
    if kind is None:
        return None
    if any(k in d for k in ("internal insulation", "external insulation")) or ("insulated" in d and "no insulation" not in d):
        return min(_WALL_INSULATED, _WALL_AS_BUILT[kind][i])
    return _WALL_AS_BUILT[kind][i]


def roof_u(desc: str | None, age_band: str | None = None) -> float | None:
    d = (desc or "").lower()
    if not d or "another dwelling above" in d or "other premises above" in d:
        return None  # not an exposed roof for this dwelling
    if (u := _explicit(d)) is not None:
        return u
    m = re.search(r"(\d+)\s*\+?\s*mm", d)
    if m and ("loft" in d or "pitched" in d or "joists" in d):
        mm = int(m.group(1))
        return min((u for t, u in _LOFT if mm >= t), default=2.3)
    if "no insulation" in d:
        return 2.3
    if "limited insulation" in d:
        return 1.5
    if "rafters" in d or "insulated" in d:
        return 0.35 if age_index(age_band) < 5 else 0.2
    return None


def window_u(desc: str | None) -> float | None:
    d = (desc or "").lower()
    if not d:
        return None
    if "high performance" in d:
        return 1.4
    if "triple" in d:
        return 1.8 if ("full" in d or "throughout" in d) else 2.3
    if "secondary" in d:
        return 2.4 if "full" in d else 3.4
    if "single" in d:
        return 4.8
    double = 2.6  # installation date unknown: between RdSAP's pre-2002 (2.8) and 2002+ (2.0)
    if "double" in d or "multiple glazing" in d:
        share = (1.0 if ("full" in d or "throughout" in d) else
                 0.75 if "mostly" in d else
                 0.5 if "partial" in d else
                 0.25 if "some" in d else 1.0)
        return round(share * double + (1 - share) * 4.8, 2)
    return None


def floor_u(desc: str | None) -> float | None:
    d = (desc or "").lower()
    if not d or "another dwelling below" in d or "other premises below" in d:
        return None
    if (u := _explicit(d)) is not None:
        return u
    if "insulated" in d and "no insulation" not in d:
        return 0.25
    if "unheated space" in d:
        return 1.2
    if "external air" in d:
        return 1.5
    if "no insulation" in d or "suspended" in d or "solid" in d:
        return 0.7
    return None


def fabric_u(row: dict) -> dict:
    """Per-certificate U-values from a full-load CSV row (lower-case column names)."""
    age = row.get("construction_age_band")
    return {
        "u_wall": wall_u(row.get("walls_description"), age),
        "u_roof": roof_u(row.get("roof_description"), age),
        "u_win": window_u(row.get("windows_description")),
        "u_floor": floor_u(row.get("floor_description")),
    }


if __name__ == "__main__":
    samples = [
        ("walls", "Cavity wall, as built, no insulation (assumed)", "England and Wales: 1950-1966"),
        ("walls", "Cavity wall, filled cavity", "England and Wales: 1950-1966"),
        ("walls", "Solid brick, as built, no insulation (assumed)", "England and Wales: 1900-1929"),
        ("walls", "Average thermal transmittance 0.28 W/m²K", None),
        ("roof", "Pitched, 270 mm loft insulation", None), ("roof", "Pitched, 400+ mm loft insulation", None),
        ("roof", "(another dwelling above)", None), ("roof", "Pitched, no insulation (assumed)", None),
        ("win", "Fully double glazed", None), ("win", "Partial double glazing", None), ("win", "Single glazed", None),
        ("floor", "Suspended, no insulation (assumed)", None), ("floor", "(another dwelling below)", None),
    ]
    fns = {"walls": wall_u, "roof": roof_u, "win": lambda d, a=None: window_u(d), "floor": lambda d, a=None: floor_u(d)}
    for kind, desc, age in samples:
        print(f"{kind:6s} {desc!r:55s} -> {fns[kind](desc, age)}")
