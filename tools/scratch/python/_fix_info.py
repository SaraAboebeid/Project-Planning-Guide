"""Patch the info panel Address row in the 3D viewer HTML files."""

FILES = [
    "assets/gothenburg_3d.html",
    "frontend/public/gothenburg_3d.html",
]

OLD = "row('Address',  b.address);"
NEW = "if (!_isCadastral(b.address)) { row('Address', b.address); }"

for path in FILES:
    text = open(path, encoding="utf-8").read()
    if OLD in text:
        text = text.replace(OLD, NEW)
        open(path, "w", encoding="utf-8").write(text)
        print(f"PATCHED: {path}")
    elif "_isCadastral(b.address)" in text and "row('Address'" not in text:
        print(f"ALREADY PATCHED: {path}")
    else:
        # Try single space variant
        old2 = "row('Address', b.address);"
        if old2 in text:
            text = text.replace(old2, NEW, 1)
            open(path, "w", encoding="utf-8").write(text)
            print(f"PATCHED (single-space): {path}")
        else:
            print(f"NOT FOUND: {path}")
            import re
            found = re.findall(r"row\('Address'[^;]+;", text)
            print("  Nearby:", found[:3])
