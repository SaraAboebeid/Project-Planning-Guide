"""Drawn ornament for the logbook - glyphs, façade bands and EPC chips.

Two jobs, both visual:

1. `GLYPHS` - one line-drawn mark per page, so a page is recognisable before
   its title is read. They are domain marks (a shoebox, a Pareto front, a
   façade with a detection box), not generic document icons.
2. `epc_strip()` - the A-G certificate ladder in the viewer's own colours.

Everything is inline SVG using the --lb-* variables, so it follows bright and
dark mode and stays crisp at any zoom.
"""
from __future__ import annotations

# The viewer's energy-class colours (assets/viewer/js and the Data Explorer use
# the same ladder, so the logbook cannot drift from the map).
EPC_COLORS = {
    "A": "#1F8A3B", "B": "#4FAE32", "C": "#9ACD32", "D": "#F2C200",
    "E": "#F08A00", "F": "#E2483B", "G": "#B3202A",
}

# 24 × 24 line marks. `currentColor` lets the caller set the hue.
_P = ('<path d="{d}" fill="none" stroke="currentColor" stroke-width="1.6" '
      'stroke-linecap="round" stroke-linejoin="round"/>')

GLYPHS: dict[str, str] = {
    # a stack of registers
    "data_sources": _P.format(d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z")
                    + _P.format(d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7")
                    + _P.format(d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"),
    # a grid, partly filled - how much of the stock is known
    "coverage": _P.format(d="M3 3h18v18H3Z") + _P.format(d="M9 3v18M15 3v18M3 9h18M3 15h18")
                + '<path d="M3 3h6v6H3Zm6 6h6v6H9Z" fill="currentColor" opacity="0.28"/>',
    # register → process → model
    "pipelines": _P.format(d="M3 6h5l3 6-3 6H3") + _P.format(d="M13 12h8")
                 + _P.format(d="M18 8l4 4-4 4"),
    # a house carrying a price tag
    "scraped_data": _P.format(d="M3 11 11 4l8 7") + _P.format(d="M5.5 9.5V20h11V9.5")
                    + _P.format(d="M10 20v-5h3v5") + '<circle cx="19" cy="5" r="2" '
                    'fill="none" stroke="currentColor" stroke-width="1.6"/>',
    # two blocks, the real one and its twin
    "digital_twin": _P.format(d="M3 9 9 5l6 4v9l-6 4-6-4Z")
                    + _P.format(d="M12 7.5 17 4.5l5 3v7l-5 3")
                    + _P.format(d="M9 9v9"),
    # the shoebox, with sun
    "shoebox_idf": _P.format(d="M4 10 11 6l7 4v8l-7 4-7-4Z") + _P.format(d="M4 10l7 4 7-4")
                   + _P.format(d="M11 14v8")
                   + '<circle cx="19" cy="5" r="2.2" fill="none" stroke="currentColor" '
                     'stroke-width="1.5"/>',
    # a ranked list
    "prioritisation": _P.format(d="M4 6h14M4 12h9M4 18h5")
                      + '<circle cx="20" cy="6" r="1.4" fill="currentColor"/>',
    # a Pareto front
    "optimisation": _P.format(d="M4 20V4M4 20h16")
                    + _P.format(d="M7 17c4 0 7-2.6 8-5.2S16.5 7 19 6.5")
                    + '<circle cx="7" cy="17" r="1.5" fill="currentColor"/>'
                      '<circle cx="13" cy="11" r="1.5" fill="currentColor"/>'
                      '<circle cx="19" cy="6.5" r="1.5" fill="currentColor"/>',
    # a fork in the road
    "decision": _P.format(d="M12 21V11") + _P.format(d="M12 11 5 5M12 11l7-6")
                + '<circle cx="12" cy="21" r="1.5" fill="currentColor"/>'
                  '<circle cx="5" cy="4.5" r="1.8" fill="none" stroke="currentColor" '
                  'stroke-width="1.5"/><circle cx="19" cy="4.5" r="1.8" fill="none" '
                  'stroke="currentColor" stroke-width="1.5"/>',
    # a façade with a detection box over it
    "facade_ml": _P.format(d="M4 3h16v18H4Z") + _P.format(d="M8 7h3v3H8ZM13 7h3v3h-3Z")
                 + '<path d="M7 13h10v6H7Z" fill="none" stroke="currentColor" '
                   'stroke-width="1.6" stroke-dasharray="2.5 2"/>',
    # sun over a horizon
    "climate_env": '<circle cx="12" cy="10" r="3.6" fill="none" stroke="currentColor" '
                   'stroke-width="1.6"/>'
                   + _P.format(d="M12 2.5v2M12 15.5v1.5M4.5 10H3M21 10h-1.5"
                                 "M6.7 4.7 5.6 3.6M18.4 3.6l-1.1 1.1")
                   + _P.format(d="M3 20h18"),
    # stacked map layers
    "viewer_layers": _P.format(d="M12 3 3 8l9 5 9-5Z") + _P.format(d="M3 13l9 5 9-5")
                     + _P.format(d="M3 17.5 12 22l9-4.5"),
    # a checked inventory
    "analysis_index": _P.format(d="M9 6h11M9 12h11M9 18h11")
                      + _P.format(d="m3 6 1.6 1.6L7.4 4.8M3 12l1.6 1.6 2.8-2.8"
                                    "M3 18l1.6 1.6 2.8-2.8"),
    # a key
    "access": '<circle cx="7.5" cy="12" r="3.8" fill="none" stroke="currentColor" '
              'stroke-width="1.6"/>' + _P.format(d="M11.3 12H21M18 12v3.2M15 12v2.4"),
    # a folder tree
    "script_browser": _P.format(d="M3 5h6l1.6 2H21v12H3Z") + _P.format(d="M7 11v6h4M7 14h3"),
    # people
    "project_team": '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" '
                    'stroke-width="1.6"/>' + _P.format(d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4")
                    + '<circle cx="17.5" cy="9.5" r="2.4" fill="none" stroke="currentColor" '
                      'stroke-width="1.5"/>' + _P.format(d="M16 15.2c3 0 5 1.9 5 4.8"),
}

_DEFAULT = _P.format(d="M4 4h16v16H4Z") + _P.format(d="M8 9h8M8 13h8M8 17h5")


def glyph(key: str, size: int = 26) -> str:
    """The page's mark, as an inline SVG inheriting the colour around it."""
    body = GLYPHS.get(key, _DEFAULT)
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" '
            f'aria-hidden="true" focusable="false" '
            f'style="display:block;color:inherit">{body}</svg>')


def epc_strip(label: str = "Energy class") -> str:
    """The A-G ladder in the viewer's colours - the one scale the whole tool
    is arguing about."""
    chips = "".join(
        f'<span style="display:inline-flex;align-items:center;justify-content:center;'
        f'width:19px;height:19px;border-radius:4px;font-size:10px;font-weight:800;'
        f'color:#fff;background:{c}">{k}</span>'
        for k, c in EPC_COLORS.items())
    return (f'<span class="lb-epc"><span class="lb-epc-label">{label}</span>'
            f'<span class="lb-epc-chips">{chips}</span></span>')
