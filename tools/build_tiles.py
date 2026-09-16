"""Extract the authored contours without changing any source SVG coordinates.
The fill/clip path follows the original curves and joins open endpoints; the
visible contour always consists of the original path data and transforms.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
IDENTITY = (1, 0, 0, 1, 0, 0)


def compose(a, b):
    x, y, z, w, u, v = a
    A, B, C, D, E, F = b
    return (x*A+z*B, y*A+w*B, x*C+z*D, y*C+w*D, x*E+z*F+u, y*E+w*F+v)


def matrix(value):
    result = IDENTITY
    for name, args in re.findall(r'(\w+)\(([^)]+)\)', value or ''):
        n = [float(v) for v in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?', args)]
        if name == 'translate':
            m = (1, 0, 0, 1, n[0], n[1] if len(n) > 1 else 0)
        elif name == 'rotate':
            t = math.radians(n[0])
            m = (round(math.cos(t), 12), round(math.sin(t), 12), -round(math.sin(t), 12), round(math.cos(t), 12), 0, 0)
        elif name == 'matrix':
            m = tuple(n)
        else:
            raise ValueError(f'Unsupported source transform: {name}')
        result = compose(result, m)
    return result


def point(m, p):
    a, b, c, d, e, f = m
    x, y = p
    return [a*x+c*y+e, b*x+d*y+f]


def segments(d, m):
    tokens = re.findall(r'[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?', d)
    out, pos, start, cmd, i = [], [0, 0], None, None, 0
    sizes = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'A': 7}
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
        upper = cmd.upper()
        if upper == 'Z':
            out.append({'kind': 'L', 'start': point(m, pos), 'end': point(m, start)})
            pos = start[:]
            cmd = None
            continue
        n = [float(v) for v in tokens[i:i+sizes[upper]]]
        i += sizes[upper]
        relative = cmd.islower()
        def xy(x, y):
            return [x+pos[0], y+pos[1]] if relative else [x, y]
        if upper == 'H':
            end = [n[0]+pos[0] if relative else n[0], pos[1]]
        elif upper == 'V':
            end = [pos[0], n[0]+pos[1] if relative else n[0]]
        else:
            end = xy(*n[-2:])
        if upper == 'M':
            start = end[:]
            pos = end
            cmd = 'l' if relative else 'L'
            continue
        s = {'kind': upper if upper in ['C', 'A'] else 'L', 'start': point(m, pos), 'end': point(m, end)}
        if upper == 'C':
            s['controls'] = [point(m, xy(*n[:2])), point(m, xy(*n[2:4]))]
        if upper == 'A':
            # Source transforms are rigid, possibly reflected. No curve fitting.
            angle = math.radians(n[2])
            axis = [math.cos(angle), math.sin(angle)]
            new_angle = math.degrees(math.atan2(m[1]*axis[0]+m[3]*axis[1], m[0]*axis[0]+m[2]*axis[1]))
            s['arc'] = [n[0], n[1], new_angle, n[3], n[4] if m[0]*m[3]-m[1]*m[2] > 0 else 1-n[4]]
        out.append(s)
        pos = end
    return out


def reversed_segments(items):
    result = []
    for old in reversed(items):
        s = dict(old, start=old['end'], end=old['start'])
        if 'controls' in s:
            s['controls'] = list(reversed(s['controls']))
        if 'arc' in s:
            s['arc'] = s['arc'][:]
            s['arc'][4] = 1-s['arc'][4]
        result.append(s)
    return result


def serialize(items):
    def nums(values):
        return ' '.join(format(n, '.12g') for n in values)
    result = ['M'+nums(items[0]['start'])]
    previous = items[0]['start']
    joins = []
    for s in items:
        gap = math.dist(previous, s['start'])
        if gap > 1e-8:
            # Fill-only closure of the gaps already covered by authored strokes.
            result.append('L'+nums(s['start']))
            joins.append(gap)
        if s['kind'] == 'C':
            args = sum(s['controls'], [])+s['end']
        elif s['kind'] == 'A':
            args = s['arc']+s['end']
        else:
            args = s['end']
        result.append(s['kind']+nums(args))
        previous = s['end']
    joins.append(math.dist(previous, items[0]['start']))
    result.append('Z')
    return ' '.join(result), max(joins, default=0)


def extract(filename, index):
    data = (ROOT / filename).read_bytes()
    root = ET.fromstring(data)
    paths = {}
    def visit(node, parent):
        m = compose(parent, matrix(node.get('transform')))
        if node.tag.endswith('}path'):
            paths[node.get('id')] = {'id': node.get('id'), 'd': node.get('d'), 'matrix': m}
        for child in node:
            visit(child, m)
    visit(root, IDENTITY)
    ids = ['path5'] if index == 0 else ['path7-9', 'path7', 'path8', 'path6', 'path8-7']
    originals = [paths[id] for id in ids]
    parsed = {p['id']: segments(p['d'], p['matrix']) for p in originals}
    if index == 0:
        fill, gap = paths['path5']['d'], 0
        contour = parsed['path5']
        center, unit = [119.718, 109.545], 69.6176
    else:
        right = parsed['path8'] if index == 1 else reversed_segments(parsed['path8'])
        contour = parsed['path7-9']+parsed['path7']+right+reversed_segments(parsed['path6'])+reversed_segments(parsed['path8-7'])
        fill, gap = serialize(contour)
        a = [(parsed['path7-9'][0]['start'][j]+parsed['path7'][-1]['end'][j])/2 for j in range(2)]
        b = [(parsed['path6'][0]['start'][j]+parsed['path6'][-1]['end'][j])/2 for j in range(2)]
        center, unit = [(a[j]+b[j])/2 for j in range(2)], 69.68006
    return {'file': filename, 'sha256': hashlib.sha256(data).hexdigest(), 'paths': originals, 'fill': fill, 'contour': contour, 'fillJoinMax': gap, 'center': center, 'unit': unit}


assets = [extract(name, i) for i, name in enumerate(['平行移動.svg', '回転移動.svg', '鏡映.svg'])]
output = '// Generated by tools/build_tiles.py. Original SVG paths are copied verbatim.\nwindow.TilingSources = '+json.dumps(assets, ensure_ascii=False, indent=2)+';\n'
destination = ROOT / 'tiles-data.js'
if '--check' in sys.argv:
    assert destination.read_text() == output, 'Source asset data is stale or modified'
    print('PASS: generated paths and source SVG hashes match exactly')
else:
    destination.write_text(output)
    print('Extracted original contours:', [(a['file'], round(a['fillJoinMax'], 6)) for a in assets])
