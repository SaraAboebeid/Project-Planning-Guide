"""
3D viewer restyle (2026-11-24): the same muted Chalmers purple as the app
(tools/ui/restyle_accent.py) for the viewer's INTERFACE - panels, buttons,
selection, hover highlights - in its own stylesheets, page and scripts.

The viewer has no inversion-based light mode, so colours render as written.
MAP DATA colours are kept, so map categories stay distinguishable: lines that
define the "Other" building type, the post-2005 era, road/train/ferry layers,
the street network and the facade defect classes are skipped.

Both copies are edited: assets/ (what Vite serves) and viewer/ (source).
Usage:  python tools/ui/restyle_viewer.py [--write]
Undo:   git checkout refs/restyle/before -- assets viewer   (or the viewer files)
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from restyle_accent import transform  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FILES = (["assets/gothenburg_3d.html", "assets/gothenburg_3d.css", "assets/sidebar-theme.css",
          "viewer/index.html"]
         + [str(p.relative_to(ROOT)) for d in ("assets/viewer/js", "viewer/js") for p in sorted((ROOT / d).glob("*.js"))]
         + [str(p.relative_to(ROOT)) for p in sorted((ROOT / "viewer").glob("*.css"))])
# Map data colours (one line each) - left exactly as they are.
DATA_LINES = ("ovrigt:", "'post-2005'", "bulge", "secondary:", "train:", "FERRY", "ferry:", "SN_CSS")


def main() -> int:
    write = "--write" in sys.argv
    # --only a b c: just these files (NOT idempotent: never run twice on a file -
    # an already muted purple would be desaturated again).
    only = sys.argv[sys.argv.index("--only") + 1:] if "--only" in sys.argv else None
    only = [a for a in only if not a.startswith("--")] if only else None
    total = Counter()
    for rel in (only or FILES):
        p = ROOT / rel
        if not p.exists():
            continue
        raw = p.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in raw else "\n"
        st = Counter()
        lines = raw.split(nl)
        out = [ln if any(k in ln for k in DATA_LINES) else transform(ln, st) for ln in lines]
        new = nl.join(out)
        if new != raw:
            total.update(st)
            print(f"{rel}: {dict(st)}")
            if write:
                p.write_bytes(new.encode("utf-8"))
    print(f"\nTOTAL {dict(total)} {'(written)' if write else '(dry run)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
