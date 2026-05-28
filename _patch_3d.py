import sys

path = r'C:/Users/saraabo/Desktop/Project Planning Guide/Project-Planning-Guide/assets/gothenburg_3d.html'

with open(path, encoding='utf-8') as f:
    content = f.read()

old = "function _normAddr(s) {\n  return (s||'').trim().toLowerCase().replace(/\\s+/g,' ').replace(/\\s+\\d{4}$/,'');\n}"

new = (
    "function _normAddr(s) {\n"
    "  return (s||'').trim().toLowerCase().replace(/\\s+/g,' ').replace(/\\s+\\d{4}$/,'');\n"
    "}\n"
    "function _isCadastral(s) {\n"
    "  // Swedish property designation ends with digits:digits (e.g. 'GOTEBORG 3:14')\n"
    "  return /\\d+:\\d+$/.test((s||'').trim());\n"
    "}"
)

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Patched: _isCadastral added')
else:
    print('ERROR: pattern not found')
    sys.exit(1)
