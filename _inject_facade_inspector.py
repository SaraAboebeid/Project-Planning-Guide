#!/usr/bin/env python3
"""Replace the facade inspector JS block(s) inside gothenburg_3d.html with the
contents of _facade_quality_wwr_style.js. Idempotent: removes ANY existing
blocks delimited by the BEGIN/END markers, then inserts a single fresh copy
just before the last </script> tag.
"""
import re

HTML  = r"c:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide\assets\gothenburg_3d.html"
JS    = r"c:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide\_facade_quality_wwr_style.js"
BEGIN = "// >>> FACADE_INSPECTOR_BEGIN >>>"
END   = "// <<< FACADE_INSPECTOR_END <<<"

with open(HTML, "r", encoding="utf-8") as f:
    html = f.read()
with open(JS, "r", encoding="utf-8") as f:
    js = f.read()

# 1. Strip any previously inserted blocks (marker-delimited)
pat = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\s*", re.DOTALL)
html, n_marker = pat.subn("", html)
print(f"Removed {n_marker} marker-delimited block(s)")

# 2. Strip the legacy un-marked blocks from earlier insertions.
#    Two known starts: "FACADE QUALITY INSPECTOR (WWR-style" and
#    "FACADE INSPECTOR - WWR-STYLE VISUAL ASSESSMENT".  Each ends with "})();"
legacy_pat = re.compile(
    r"// [^\n]*(?:FACADE QUALITY INSPECTOR \(WWR-style|FACADE INSPECTOR - WWR-STYLE)[^\n]*\n"
    r".*?\}\)\(\);\s*",
    re.DOTALL,
)
html, n_legacy = legacy_pat.subn("", html)
print(f"Removed {n_legacy} legacy block(s)")

# 3. Also drop the lone banner comment lines that were inserted around them
banner_pat = re.compile(
    r"// ═{3,}[^\n]*\n(?:// [^\n]*\n)*"
    r"// (?:FACADE INSPECTOR - WWR-STYLE|FACADE QUALITY INSPECTOR)[^\n]*\n"
    r"(?:// [^\n]*\n)*",
    re.DOTALL,
)
# (Best-effort; harmless if it doesn't match)

# 4. Insert one fresh marker-wrapped copy before the LAST </script>
insert = "\n\n" + BEGIN + "\n" + js.rstrip() + "\n" + END + "\n\n"
idx = html.rfind("</script>")
if idx == -1:
    raise SystemExit("</script> not found in HTML")
html = html[:idx] + insert + html[idx:]

with open(HTML, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Inserted fresh facade-inspector block ({len(js)} bytes) before </script>")
print(f"Final HTML size: {len(html)} bytes")
