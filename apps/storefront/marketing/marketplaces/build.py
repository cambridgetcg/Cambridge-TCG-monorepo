"""Marketplace images for Cambridge TCG, made from the brand kit beside this folder (../kit).

    python3 build.py            # writes the PNGs next to this file

eBay UK shop (help page 4090, read 2026-10-20): logo 300 x 300; billboard 1280 x 290. Both are drawn from the kit's own
outlined SVGs and its VectorCraft document, so they change only when the kit does. No web address, contact detail or
third-party artwork goes on them (eBay policies 4248 and 4240). Cardmarket publishes no size: use
../kit/social/avatar-1024.png, which is safe inside a circle crop. Needs vectorcraft-cli on PATH.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE.parent / 'kit'
GROUND = {'light': '#FAF8F4', 'dark': '#0B0F1A'}    # the site's page colours (themes.css), the kit's grounds
BILLBOARD = (1280, 290)
LOCKUP_H = 84            # the lockup's height on the billboard: within the middle 50% of its height, centred


def vc(*args: str) -> None:
    subprocess.run(['vectorcraft-cli', *args], check=True, stdout=subprocess.DEVNULL)


def inner(svg: str) -> tuple[float, float, str]:
    """The viewBox size and the drawing of one of the kit's SVGs, without its <title> and <desc>."""
    w, h = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).groups())
    body = svg[svg.index('>', svg.index('<svg')) + 1: svg.rindex('</svg>')]
    body = re.sub(r'<title>.*?</title>|<desc>.*?</desc>', '', body, flags=re.S)
    return w, h, body


def billboard(theme: str, out: Path, tmp: Path) -> None:
    src = KIT / 'logo' / ('lockup-horizontal-reversed.svg' if theme == 'dark' else 'lockup-horizontal.svg')
    w, h, body = inner(src.read_text())
    s = LOCKUP_H / h
    W, H = BILLBOARD
    x, y = (W - w * s) / 2, (H - h * s) / 2
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           f'<rect width="{W}" height="{H}" fill="{GROUND[theme]}"/>'
           f'<g transform="translate({x:.3f} {y:.3f}) scale({s:.6f})">{body}</g></svg>')
    p = tmp / f'billboard-{theme}.svg'
    p.write_text(svg)
    vc('convert', str(p), str(out))


def main() -> int:
    doc = KIT / 'brand.vectorcraft'
    info = subprocess.run(['vectorcraft-cli', 'info', str(doc)], check=True, capture_output=True, text=True).stdout
    names = re.findall(r'"name":\s*"([^"]+)"', info.split('"artboards"', 1)[1])
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        # the shop logo: the kit's maskable app icon (the mark inside 40% of the side from the centre) at 300 px
        vc('convert', str(doc), str(HERE / 'ebay-logo-300.png'), '--artboard', str(names.index('maskable')),
           '--scale', str(300 / 512))
        for theme in ('light', 'dark'):
            billboard(theme, HERE / f'ebay-billboard-{theme}-1280x290.png', tmp)
    print('wrote', ', '.join(sorted(p.name for p in HERE.glob('ebay-*.png'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
