#!/usr/bin/env python3
"""Throwaway pixel analyzer for the Tiled-map browser check (deleted after Task 4).

Modes (each prints one JSON object):
  centroid <png> --expect X,Y [--box a,b,c,d]   green-bar cluster nearest to the point
  island-top <png> --xband a,b --yband c,d [--exclude a,b,c,d]
                                                topmost island pixel (camY anchor)
  island-left <png> --xwin a,b --yband c,d      leftmost island pixel in band (camX anchor)
  drive <png> --xband a,b --yband c,d [--exclude a,b,c,d] --expect X,Y
                                                island-top + boxed centroid in one pass
  void <png>                                    deep-ocean void pixel count
  clusters <png>                                green connected components (>= 15 px)
  static <png> --rects rects.json               crew placement + flip presence (PASS/FAIL lines)
"""
import json
import sys
from collections import deque

from PIL import Image

BAR = (62, 207, 92)
WATER = (41, 185, 218)
SAND = (249, 211, 156)
GRASS = (118, 173, 55)
VOID = (17, 63, 82)


def near(p, c, tol):
    return abs(p[0] - c[0]) <= tol and abs(p[1] - c[1]) <= tol and abs(p[2] - c[2]) <= tol


def is_island(p):
    return near(p, SAND, 40) or near(p, GRASS, 40)


def is_orange(p):
    return p[0] > 180 and 60 < p[1] < 200 and p[2] < 130


def green_at(px, x, y):
    return near(px[x, y], BAR, 40)


def green_clusters(im, min_px=15):
    px = im.load()
    w, h = im.size
    seen = set()
    out = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not green_at(px, x, y):
                continue
            comp = []
            queue = deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                comp.append((cx, cy))
                for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and green_at(px, n[0], n[1]):
                        seen.add(n)
                        queue.append(n)
            if len(comp) >= min_px:
                out.append((len(comp), sum(p[0] for p in comp) / len(comp), sum(p[1] for p in comp) / len(comp)))
    return out


def arg(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def pair(text):
    return tuple(int(v) for v in text.split(','))


def flood_island(px, x, y, w, h, visited):
    """4-connected island-colored region; marks everything it touches."""
    comp = []
    queue = deque([(x, y)])
    visited.add((x, y))
    while queue:
        cx, cy = queue.popleft()
        comp.append((cx, cy))
        for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= n[0] < w and 0 <= n[1] < h and n not in visited and is_island(px[n[0], n[1]]):
                visited.add(n)
                queue.append(n)
    return comp


# Ship hulls are light wood and can false-match the sand test; islands are
# the only island-colored regions this large (hulls <= ~1000 px on screen).
ISLAND_MIN_SIZE = 2000


def island_top(px, w, h, xband, yband, box):
    x0, x1 = xband
    y0, y1 = yband
    visited = set()
    for y in range(y0, min(y1 + 1, h)):
        for x in range(x0, min(x1 + 1, w)):
            if (x, y) in visited or not is_island(px[x, y]):
                continue
            if box and box[0] <= x <= box[1] and box[2] <= y <= box[3]:
                continue
            if len(flood_island(px, x, y, w, h, visited)) >= ISLAND_MIN_SIZE:
                return y
    return None


def island_left(px, w, h, xwin, yband):
    x0, x1 = xwin
    y0, y1 = yband
    visited = set()
    for x in range(x0, min(x1 + 1, w)):
        for y in range(y0, min(y1 + 1, h)):
            if (x, y) in visited or not is_island(px[x, y]):
                continue
            if len(flood_island(px, x, y, w, h, visited)) >= ISLAND_MIN_SIZE:
                return x
    return None


def nearest_green(px, w, h, expect, box):
    bx0, by0, bx1, by1 = box if box else (0, 0, w - 1, h - 1)
    seen = set()
    best = None
    for y in range(by0, by1 + 1):
        for x in range(bx0, bx1 + 1):
            if (x, y) in seen or not green_at(px, x, y):
                continue
            comp = []
            queue = deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                comp.append((cx, cy))
                for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if bx0 <= n[0] <= bx1 and by0 <= n[1] <= by1 and n not in seen and green_at(px, n[0], n[1]):
                        seen.add(n)
                        queue.append(n)
            gx = sum(p[0] for p in comp) / len(comp)
            gy = sum(p[1] for p in comp) / len(comp)
            dist = ((gx - expect[0]) ** 2 + (gy - expect[1]) ** 2) ** 0.5
            if best is None or dist < best[0]:
                best = (dist, gx, gy, len(comp))
    if best is None:
        return {'found': False}
    return {'found': True, 'x': round(best[1], 1), 'y': round(best[2], 1),
            'count': best[3], 'dist': round(best[0], 1)}


def main():
    mode = sys.argv[1]
    png = sys.argv[2]
    args = sys.argv[3:]
    im = Image.open(png).convert('RGB')
    px = im.load()
    w, h = im.size

    if mode == 'centroid':
        print(json.dumps(nearest_green(px, w, h, pair(arg(args, '--expect', '640,337')),
                                       pair(arg(args, '--box')) if arg(args, '--box') else None)))

    elif mode == 'island-top':
        print(json.dumps({'topY': island_top(px, w, h, pair(arg(args, '--xband')),
                                             pair(arg(args, '--yband')),
                                             pair(arg(args, '--exclude')) if arg(args, '--exclude') else None)}))

    elif mode == 'island-left':
        print(json.dumps({'leftX': island_left(px, w, h, pair(arg(args, '--xwin')),
                                                pair(arg(args, '--yband')))}))

    elif mode == 'drive':
        top = island_top(px, w, h, pair(arg(args, '--xband')), pair(arg(args, '--yband')),
                         pair(arg(args, '--exclude')) if arg(args, '--exclude') else None)
        cen = nearest_green(px, w, h, pair(arg(args, '--expect', '640,337')),
                            pair(arg(args, '--box')) if arg(args, '--box') else (560, 280, 720, 420))
        print(json.dumps({'topY': top, 'centroid': cen}))

    elif mode == 'void':
        count = 0
        for y in range(h):
            for x in range(w):
                if near(px[x, y], VOID, 12):
                    count += 1
        print(json.dumps({'count': count}))

    elif mode == 'clusters':
        clusters = green_clusters(im)
        print(json.dumps({'clusters': len(clusters), 'sizes': [c[0] for c in clusters]}))

    elif mode == 'static':
        rects = json.load(open(arg(args, '--rects')))
        failures = 0

        def step(name, ok, detail=''):
            nonlocal failures
            print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ''))
            if not ok:
                failures += 1

        cx0, cy0, cx1, cy1 = rects['crew']['rect']
        mid = (cy0 + cy1) / 2
        bottom = top = 0
        for y in range(int(cy0), int(cy1)):
            for x in range(int(cx0), int(cx1)):
                if is_orange(px[x, y]):
                    if y >= mid:
                        bottom += 1
                    else:
                        top += 1
        step('crew sprite sits in the bottom half of its cell (bottom-left alignment)',
             bottom >= 3 and top <= 1, f'bottom={bottom} top={top}')

        for flip in rects['flips']:
            fx0, fy0, fx1, fy1 = flip['rect']
            nonwater = 0
            for y in range(int(fy0), int(fy1)):
                for x in range(int(fx0), int(fx1)):
                    if not near(px[x, y], WATER, 45):
                        nonwater += 1
            step(f"flipped cell gid {flip['gid']} ({flip['flags']}) renders content",
                 nonwater >= 5, f'nonwater={nonwater}')

        sys.exit(1 if failures else 0)

    else:
        print(json.dumps({'error': f'unknown mode {mode}'}))
        sys.exit(2)


if __name__ == '__main__':
    main()
