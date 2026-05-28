"""Patch the 3D viewer HTML files to handle cadastral address IDs."""
import re

FILES = [
    "assets/gothenburg_3d.html",
    "frontend/public/gothenburg_3d.html",
]

# JS helper to detect Swedish cadastral designations and resolve via Nominatim reverse geocode
HELPER_JS = """
  // ── Cadastral address helpers ──────────────────────────────────────────
  const _CADASTRAL_RE = /^.+\\s+\\d+:\\d+\\s*$/;
  function _isCadastral(addr) {
    return typeof addr === 'string' && _CADASTRAL_RE.test(addr.trim());
  }
  const _geocodeCache = {};
  function _resolveAddress(addr, lat, lon, onResult) {
    if (!_isCadastral(addr)) { onResult(addr); return; }
    const key = lat.toFixed(5) + ',' + lon.toFixed(5);
    if (_geocodeCache[key] !== undefined) { onResult(_geocodeCache[key]); return; }
    _geocodeCache[key] = null; // mark in-flight
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
      .then(r => r.json())
      .then(d => {
        const a = d.address || {};
        const road = a.road || a.pedestrian || a.footway || '';
        const house = a.house_number || '';
        _geocodeCache[key] = road ? (house ? road + ' ' + house : road) : null;
        onResult(_geocodeCache[key]);
      })
      .catch(() => { _geocodeCache[key] = null; onResult(null); });
  }
  // ───────────────────────────────────────────────────────────────────────
"""

HOVER_OLD = "(b.address || b.all_addresses || 'Building')"
HOVER_NEW = "(_isCadastral(b.address) ? (b.all_addresses || 'Building') : (b.address || b.all_addresses || 'Building'))"

INFO_OLD = "row('Address', b.address);"
INFO_NEW = (
    "if (!_isCadastral(b.address)) { row('Address', b.address); } "
    "else { row('Address', '—'); }"
)

# Anchor to insert the helper JS just before the first occurrence of the hover card logic
ANCHOR = "function showTooltip("
ALT_ANCHOR = "function renderInfoPanel("

patched = 0
for path in FILES:
    try:
        text = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        print(f"SKIP (not found): {path}")
        continue

    original = text

    # 1. Patch hover card label
    if HOVER_OLD in text:
        text = text.replace(HOVER_OLD, HOVER_NEW)
        print(f"  [hover] patched in {path}")
    else:
        print(f"  [hover] NOT FOUND in {path}")

    # 2. Patch info panel row
    if INFO_OLD in text:
        text = text.replace(INFO_OLD, INFO_NEW)
        print(f"  [info]  patched in {path}")
    else:
        print(f"  [info]  NOT FOUND in {path}")

    # 3. Inject helper JS if not already present
    if "_isCadastral" not in text:
        anchor = ANCHOR if ANCHOR in text else ALT_ANCHOR
        if anchor in text:
            text = text.replace(anchor, HELPER_JS + "\n  " + anchor, 1)
            print(f"  [js]    helper injected in {path}")
        else:
            print(f"  [js]    ANCHOR NOT FOUND in {path} — helper NOT injected")
    else:
        print(f"  [js]    helper already present in {path}")

    if text != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"  SAVED {path}")
        patched += 1
    else:
        print(f"  NO CHANGES in {path}")

print(f"\nDone. {patched} file(s) patched.")
