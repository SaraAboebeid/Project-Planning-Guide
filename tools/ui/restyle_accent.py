"""
UI restyle (2026-11-24): saturated lavender/purple + teal accents -> one muted
Chalmers-purple accent, one font-weight step lighter, tiny text 1-2 px larger.
(Ink blue was tried first; the user chose muted purple to keep the Chalmers identity.)
Run it once from the restore point - it is not idempotent (weights/sizes step again).

Why a script: the purple is hard-coded in ~350 places across ~57 files, and the
app's light mode is an inversion of the dark styles (index.css), so every colour
has to keep its LIGHTNESS and only change hue - a light lavender becomes a light
blue, which light mode then draws as dark ink (instead of #721CB8 -> pink).

  colours   any hex / rgb()/rgba() with hue 250-320 deg (purple/violet/magenta)
            or 165-190 deg (the teal selection colour) and saturation > 25 %
            -> hue 268 deg, saturation x0.5 (max 32 %), same lightness
  weights   fontWeight 800 -> 700, 700 -> 600; font-extrabold -> font-bold,
            font-bold -> font-semibold
  sizes     fontSize 9-10 -> 11, 10.5 -> 11.5, 11-11.5 -> 12 (inline, JSX props,
            Tailwind text-[Npx])

Usage:  python tools/ui/restyle_accent.py            (dry run: counts per file)
        python tools/ui/restyle_accent.py --write
Undo:   git checkout refs/restyle/before -- frontend/src
"""
from __future__ import annotations

import colorsys
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src"
SKIP_DIRS = {"i18n"}
# Muted Chalmers purple (user's choice, 2026-11-24; ink blue was tried first and
# replaced). Saturation is halved: light mode's inversion BOOSTS saturation, so a
# full-strength purple turns into pastel lavender there.
HUE = 268 / 360
SAT_FACTOR, SAT_MAX = 0.5, 0.32


def _remap(r: int, g: int, b: int) -> tuple[int, int, int] | None:
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    if s <= 0.25 or not (250 <= deg <= 320 or 165 <= deg <= 190):
        return None
    nr, ng, nb = colorsys.hls_to_rgb(HUE, l, min(s * SAT_FACTOR, SAT_MAX))
    return round(nr * 255), round(ng * 255), round(nb * 255)


# Not after "&": "&#128274;" is an HTML character code (🔒), not a colour.
HEX = re.compile(r"(?<!&)#([0-9a-fA-F]{6})\b")
RGB = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*([,)])")
# "114, 28, 184" inside a CSS var used as rgba(var(--x-rgb), a)
RGB_VAR = re.compile(r"(--[a-z-]*rgb:\s*)(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})")

W_INLINE = re.compile(r"(fontWeight\s*:\s*['\"]?)(800|700)(['\"]?)")
W_TW = re.compile(r"\bfont-(extrabold|bold)\b")
SIZE_INLINE = re.compile(r"(fontSize\s*[:=]\s*\{?\s*['\"]?)(9|9\.5|10|10\.5|11|11\.5)((?:px)?['\"]?)(?=[\s,}])")
SIZE_TW = re.compile(r"\btext-\[(9|9\.5|10|10\.5|11|11\.5)px\]")
NEW_SIZE = {"9": "11", "9.5": "11", "10": "11", "10.5": "11.5", "11": "12", "11.5": "12"}


def transform(text: str, stats: Counter) -> str:
    def hex_sub(m):
        v = m.group(1)
        new = _remap(int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))
        if not new:
            return m.group(0)
        stats["colour"] += 1
        out = "#" + "".join(f"{c:02X}" for c in new)
        return out if v.isupper() else out.lower()

    def rgb_sub(m):
        new = _remap(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if not new:
            return m.group(0)
        stats["colour"] += 1
        fn = m.group(0).split("(")[0]
        return f"{fn}({new[0]},{new[1]},{new[2]}{m.group(4)}"

    def rgbvar_sub(m):
        new = _remap(int(m.group(2)), int(m.group(3)), int(m.group(4)))
        if not new:
            return m.group(0)
        stats["colour"] += 1
        return f"{m.group(1)}{new[0]}, {new[1]}, {new[2]}"

    text = HEX.sub(hex_sub, text)
    text = RGB.sub(rgb_sub, text)
    text = RGB_VAR.sub(rgbvar_sub, text)

    def w_inline(m):
        stats["weight"] += 1
        return f"{m.group(1)}{'700' if m.group(2) == '800' else '600'}{m.group(3)}"
    text = W_INLINE.sub(w_inline, text)

    def w_tw(m):
        stats["weight"] += 1
        return "font-bold" if m.group(1) == "extrabold" else "font-semibold"
    text = W_TW.sub(w_tw, text)

    def s_inline(m):
        stats["size"] += 1
        return f"{m.group(1)}{NEW_SIZE[m.group(2)]}{m.group(3)}"
    text = SIZE_INLINE.sub(s_inline, text)

    def s_tw(m):
        stats["size"] += 1
        return f"text-[{NEW_SIZE[m.group(1)]}px]"
    return SIZE_TW.sub(s_tw, text)


def main() -> int:
    write = "--write" in sys.argv
    total = Counter()
    for p in sorted(ROOT.rglob("*")):
        if p.suffix not in (".tsx", ".ts", ".css") or any(d in p.parts for d in SKIP_DIRS):
            continue
        src = p.read_bytes().decode("utf-8")   # bytes: keeps CRLF/LF exactly as they are
        st = Counter()
        out = transform(src, st)
        if out != src:
            total.update(st)
            print(f"{p.relative_to(ROOT)}: {dict(st)}")
            if write:
                p.write_bytes(out.encode("utf-8"))
    print(f"\nTOTAL {dict(total)} {'(written)' if write else '(dry run)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
