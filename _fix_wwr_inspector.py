#!/usr/bin/env python3
"""
WWR inspector fix:
1. Hide EUBUCCO building layer when inspector opens → photorealistic 3D tiles visible for capture
2. Restore building layer when inspector exits
"""

path = 'assets/gothenburg_3d.html'

raw = open(path, 'rb').read()
has_bom = raw[:3] == b'\xef\xbb\xbf'
if has_bom:
    raw = raw[3:]

content = raw.decode('utf-8', errors='replace')
print(f'Read {len(content)} chars')

# ---- 1. Hide buildings when inspector opens (before flyToFacade) ----
old1 = "  flyToFacade('N');\r\n  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic');\r\n});"
new1 = (
    "  // Hide EUBUCCO overlay so photorealistic 3D tiles are visible for capture\r\n"
    "  if (buildingDS) buildingDS.show = false;\r\n"
    "  flyToFacade('N');\r\n"
    "  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic');\r\n"
    "});"
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('\u2713 Added buildingDS.show=false on inspector open')
else:
    print('NOT FOUND (open handler). Searching nearby...')
    idx = content.find("flyToFacade('N')")
    print(repr(content[max(0,idx-10):idx+100]))

# ---- 2. Restore buildings when inspector exits ----
old2 = (
    "document.getElementById('btn-exit-inspect').addEventListener('click', () => {\r\n"
    "  document.getElementById('facade-panel').style.display = 'none';\r\n"
    "  document.getElementById('wwr-panel').style.display    = 'none';\r\n"
    "  facadeBuilding = null;"
)
new2 = (
    "document.getElementById('btn-exit-inspect').addEventListener('click', () => {\r\n"
    "  document.getElementById('facade-panel').style.display = 'none';\r\n"
    "  document.getElementById('wwr-panel').style.display    = 'none';\r\n"
    "  facadeBuilding = null;\r\n"
    "  // Restore EUBUCCO overlay\r\n"
    "  if (buildingDS) buildingDS.show = eubuccoVisible;"
)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('\u2713 Added buildingDS.show=eubuccoVisible on inspector exit')
else:
    print('NOT FOUND (exit handler). Searching nearby...')
    idx = content.find("btn-exit-inspect")
    print(repr(content[max(0,idx-5):idx+300]))

# ---- Write ----
out_bytes = content.encode('utf-8')
if has_bom:
    out_bytes = b'\xef\xbb\xbf' + out_bytes

with open(path, 'wb') as f:
    f.write(out_bytes)

orig_size = len(raw) + (3 if has_bom else 0)
print(f'\nDone. Written {len(out_bytes)} bytes (original: {orig_size} bytes, delta: {len(out_bytes)-orig_size:+d})')


# ---- 1. Add Inspect button to #info-panel ----
# File uses CRLF line endings
old1 = '    <div id="info-content"></div>\r\n  <div id="boplats-section" style="display:none;padding:0 2px"></div>'
new1 = (
    '    <div id="info-content"></div>\r\n'
    '    <button class="btn" id="btn-inspect-panel" '
    'style="width:100%;margin-top:8px;font-size:12px">Inspect Facades + WWR</button>\r\n'
    '  <div id="boplats-section" style="display:none;padding:0 2px"></div>'
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('\u2713 Added Inspect button to #info-panel')
else:
    idx = content.find('info-content')
    print(f'Exact match not found. Content around info-content (idx {idx}):')
    print(repr(content[max(0,idx-5):idx+200]))

# ---- 2. Wire up event listener for the panel button ----
old2 = "document.getElementById('btn-inspect').addEventListener('click', () => {"
new2 = (
    "// Panel Inspect button delegates to sidebar btn-inspect\n"
    "document.getElementById('btn-inspect-panel').addEventListener('click', function() {\n"
    "  document.getElementById('btn-inspect').click();\n"
    "});\n\n"
    "document.getElementById('btn-inspect').addEventListener('click', () => {"
)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('\u2713 Wired btn-inspect-panel event listener')
else:
    print('WARNING: btn-inspect addEventListener not found')

# ---- 3. Remove disabled from sidebar btn-inspect ----
old3 = '<button class="tool-btn" id="btn-inspect" disabled>Inspect Facades + WWR</button>'
new3 = '<button class="tool-btn" id="btn-inspect">Inspect Facades + WWR</button>'

if old3 in content:
    content = content.replace(old3, new3, 1)
    print('\u2713 Removed disabled from sidebar btn-inspect')
else:
    print('WARNING: disabled btn-inspect not found')

# ---- Write back (preserve BOM if it was present) ----
out_bytes = content.encode('utf-8')
if has_bom:
    out_bytes = b'\xef\xbb\xbf' + out_bytes

with open(path, 'wb') as f:
    f.write(out_bytes)

orig_size = len(raw) + (3 if has_bom else 0)
print(f'\nDone. Written {len(out_bytes)} bytes (original: {orig_size} bytes)')
print(f'Net change: {len(out_bytes) - orig_size:+d} bytes')
