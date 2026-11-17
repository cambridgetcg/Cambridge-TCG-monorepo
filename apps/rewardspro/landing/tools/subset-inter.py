#!/usr/bin/env python3
"""Rebuild rewardspro.io's font file from the official Inter release.

The site serves one variable font, public/assets/fonts/inter-latin-var.woff2: Inter 4.1 (SIL Open Font
License 1.1; public/assets/fonts/Inter-OFL.txt), cut to the Latin range the pages use, weights 400 to 700,
with the optical-size axis kept so headlines take the display cut.

    python3 -m venv venv && ./venv/bin/pip install fonttools==4.68.0 brotli==1.2.1
    curl -sSLO https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip && unzip -q Inter-4.1.zip -d inter
    ./venv/bin/python subset-inter.py inter/InterVariable.ttf inter-latin-var.woff2

With those versions the result is the served file, byte for byte (the contract test pins its sha256). If you
mean to change the font, give the new cut a new file name: _headers lets browsers keep the old one for a year.
This script is not served; only public/ is.
"""
import io
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Google Fonts' "latin" range, plus arrows and the maths signs the pages use (the minus sign, the times sign).
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2260,U+2264-2265,U+FEFF,U+FFFD"
)
# tnum is what lines money up in tables.
FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum", "case", "zero", "frac"]


def main(source: str, target: str) -> None:
    # recalcTimestamp=False keeps the source's own dates, so the same input gives the same bytes.
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = FEATURES
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17, 25]  # keep the copyright, names and licence records
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)

    # Narrow the weight axis after cutting the glyphs: fontTools' subsetter trips on a font instanced first.
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    narrowed = instancer.instantiateVariableFont(TTFont(buffer, recalcTimestamp=False), {"wght": (400, 700)})
    narrowed.flavor = "woff2"
    narrowed.save(target)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
