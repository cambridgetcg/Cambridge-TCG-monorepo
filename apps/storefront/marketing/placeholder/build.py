"""The "no image" card placeholder for Cambridge TCG, drawn with VectorCraft from the kit's diamond pip.

    python3 build.py            # writes card-placeholder.vectorcraft and card-placeholder.svg next to this file

A 5:7 card drawn as a hairline, with the mark's pip (the `pip` path of ../cambridge-tcg-mark.svg) at its centre line.
The site shows it wherever a card has no image, or its image does not load (`src/lib/ui/CardImagePlaceholder.tsx`
draws these shapes). It is drawn in the Light control-edge colour (#8E877A, `--color-border-strong` in themes.css), and
the served SVG swaps that colour for `currentColor`, so the page's own text colour paints it in every theme. The
outline keeps `vector-effect="non-scaling-stroke"`, so it stays one CSS pixel wide at any size. Needs vectorcraft-cli
on PATH (0.17.0 drew it).
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARK = HERE.parent / 'cambridge-tcg-mark.svg'
W, H = 250, 350                   # 5:7, in px; about the size the card page shows it
INK = '#8E877A'                   # Light --color-border-strong; becomes currentColor in the served SVG
RADIUS = 12                       # about 3 mm on a 63 x 88 mm card
PIP_WIDTH = 30                    # the pip's width on the card (the mark's pip is 7.5 units wide)
PIP_CENTRE = (W / 2, 158)         # a little above the middle: the page sets the words "No image" below it
EPOCH = '1762732800'              # 2025-11-10T00:00:00Z: fixed, so a rebuild writes the same bytes


def pip_points() -> list[tuple[float, float]]:
    """The four corners of the kit's pip, from the mark's `pip` path (M x y L x y L x y L x y Z)."""
    d = re.search(r'<path id="pip" d="([^"]+)"', MARK.read_text()).group(1)
    nums = [float(n) for n in re.findall(r'-?[\d.]+', d)]
    return list(zip(nums[0::2], nums[1::2]))


def pip_path() -> str:
    pts = pip_points()
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s = PIP_WIDTH / (max(xs) - min(xs))
    moved = [(PIP_CENTRE[0] + (x - cx) * s, PIP_CENTRE[1] + (y - cy) * s) for x, y in pts]
    return 'M' + ' L'.join(f'{x:g} {y:g}' for x, y in moved) + ' Z'


def main() -> int:
    env = {**os.environ, 'VECTORCRAFT_NO_PREFS': '1', 'SOURCE_DATE_EPOCH': EPOCH}
    with tempfile.TemporaryDirectory() as t:
        raw = Path(t) / 'card-placeholder.svg'
        steps = [
            ['file.new', {'width': W, 'height': H, 'units': 'Pixels', 'created': None, 'name': 'card-placeholder'}],
            ['file.info', {'title': 'Cambridge TCG card placeholder',
                           'description': 'A 5:7 hairline card with the mark\'s diamond pip, for a card with no image.'}],
            ['artboard.setProps', {'index': 0, 'name': 'card-placeholder'}],
            ['layer.setProps', {'name': 'placeholder'}],
            ['select.none', {}],
            # the card: a hairline rounded rectangle, its 1 px stroke centred half a pixel inside the artboard
            ['paint.setFill', {'none': True}],
            ['paint.setStroke', {'color': INK}],
            ['stroke.set', {'weight': 1, 'align': 'center', 'join': 'round'}],
            ['shape.rectangle', {'x': 0.5, 'y': 0.5, 'width': W - 1, 'height': H - 1, 'radius': RADIUS}],
            ['object.setProps', {'id': '$8.id', 'name': 'card'}],
            ['select.none', {}],
            # the pip: filled, no stroke
            ['paint.setStroke', {'none': True}],
            ['paint.setFill', {'color': INK}],
            ['path.create', {'d': pip_path()}],
            ['object.setProps', {'id': '$13.id', 'name': 'pip'}],
            ['select.none', {}],
            ['document.export', {'path': str(raw), 'artboard': 0, 'svg': {'decimals': 2, 'objectIds': 'minimal'}}],
        ]
        assert steps[8][0] == 'shape.rectangle' and steps[13][0] == 'path.create'   # the $N references above
        lines = ''.join(json.dumps({'command': c, 'params': p}) + '\n' for c, p in steps)
        r = subprocess.run(['vectorcraft-cli', 'run', '--commands', '-', '--export',
                            str(HERE / 'card-placeholder.vectorcraft')],
                           input=lines, text=True, capture_output=True, env=env)
        if r.returncode != 0:
            print(r.stderr or r.stdout, file=sys.stderr)
            return 1
        results = [json.loads(line).get('result') for line in r.stdout.splitlines() if line.startswith('{')
                   and json.loads(line).get('step') == 'cmd']
        warnings = (results[-1] or {}).get('warnings') or []
        if len(results) != len(steps) or warnings:
            print(f'{len(results)} of {len(steps)} steps answered; export warnings: {warnings}', file=sys.stderr)
            return 1
        svg = raw.read_text()
    if svg.upper().count(INK) != 2:
        print(f'expected the card and the pip in {INK}, found {svg.upper().count(INK)} uses', file=sys.stderr)
        return 1
    svg = re.sub(INK, 'currentColor', svg, flags=re.I)
    # keep the outline a hairline at any size: the attribute goes on the one stroked shape
    svg, n = re.subn(r'(<(?:rect|path)\b[^>]*\bstroke="currentColor")', r'\1 vector-effect="non-scaling-stroke"', svg)
    if n != 1:
        print(f'expected one stroked shape, found {n}', file=sys.stderr)
        return 1
    (HERE / 'card-placeholder.svg').write_text(svg)
    print('wrote card-placeholder.vectorcraft, card-placeholder.svg')
    return 0


if __name__ == '__main__':
    sys.exit(main())
