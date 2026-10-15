"""Read actors, positions and map boxes from dumped level exports."""
import os, struct, math
from uprops import read_header, vec, values

def plausible_loc(v): return all(math.isfinite(x) and abs(x) < 2e6 for x in v) and any(abs(x) > 1e-3 for x in v)
def plausible_rot(v): return all(math.isfinite(x) and abs(x) <= 720 for x in v)

def load_rows(d):
    return [l.rstrip('\n').split('\t') for l in open(f'{d}/exports.tsv', encoding='utf-8')][1:]

def load_imports(d):
    return [l.rstrip('\n').split('\t')[1] for l in open(f'{d}/imports.tsv', encoding='utf-8')]

# Byte sizes of properties that can precede RelativeLocation, keyed by component class.
SIZES = {
    'CapsuleComponent': {102: 6, 7: 4, 8: 4, 0: 4, 119: 4},
    'BoxComponent': {0: 24, 118: 4},
    'SplineComponent': {121: 4},
    'SceneComponent': {1: 4},
}
LOC = {'CapsuleComponent': 123, 'BoxComponent': 122, 'SplineComponent': 125, 'SceneComponent': 5}

def component_transform(cls, b):
    """(location, yaw, attached) for a scene component, or None if undecodable."""
    present, zeros, o = read_header(b)
    li = LOC[cls]
    attached = (li - 4) in present
    if li not in present or li in zeros:
        return ((0.0, 0.0, 0.0), 0.0, attached) if li not in present else None
    sizes = SIZES[cls]
    off = o
    for i in present:
        if i in zeros: continue
        if i == li: break
        if i not in sizes:
            off = None; break
        off += sizes[i]
    candidates = [off] if off is not None else range(o, len(b) - 24)
    for c in candidates:
        loc = vec(b, c)
        if not plausible_loc(loc): continue
        yaw = 0.0
        if li + 1 in present and li + 1 not in zeros:
            rot = vec(b, c + 24)
            if not plausible_rot(rot):
                if off is None: continue
            else: yaw = rot[1]
        return loc, yaw, attached
    return None

def actors(d, class_pred, comp_classes=('CapsuleComponent',)):
    rows = load_rows(d)
    by_outer = {}
    for r in rows:
        if r[2] in comp_classes: by_outer.setdefault(r[4], []).append(r)
    out, bad = [], 0
    for r in rows:
        if not class_pred(r[2]): continue
        comps = by_outer.get(r[1], [])
        # The root is the component without an attach parent.
        best = None
        for c in comps:
            try: b = open(f'{d}/{c[0]}.bin', 'rb').read()
            except FileNotFoundError: continue
            t = component_transform(c[2], b)
            if t and not t[2]: best = t; break
            if t and best is None: best = t
        if best is None: bad += 1; continue
        out.append({'name': r[1], 'cls': r[2], 'clsPath': r[3], 'x': best[0][0], 'y': best[0][1], 'z': best[0][2], 'yaw': best[1]})
    return out, bad

def map_boxes(d):
    rows = load_rows(d); imports = load_imports(d)
    res = []
    for r in rows:
        if r[2] != 'BP_DungeonMapAreaBox_C': continue
        b = open(f'{d}/{r[0]}.bin', 'rb').read()
        _, _, o = read_header(b)
        tex_idx, = struct.unpack_from('<i', b, o)
        tex = imports[-tex_idx - 1] if tex_idx < 0 else None
        n, = struct.unpack_from('<i', b, o + 4)
        label = b[o + 8:o + 8 + n - 1].decode('utf-8', 'replace') if 0 < n < 200 else ''
        comp = next((c for c in rows if c[4] == r[1] and c[2] == 'BoxComponent'), None)
        cb = open(f'{d}/{comp[0]}.bin', 'rb').read()
        present, zeros, ho = read_header(cb)
        ext = vec(cb, ho) if present and present[0] == 0 else None
        t = component_transform('BoxComponent', cb)
        offs, ok, _ = values(cb, {0: 24, 118: 4, 122: 24, 123: 24, 124: 24})
        scale = vec(cb, offs[124]) if ok and 124 in offs else (1.0, 1.0, 1.0)
        if ext: ext = tuple(e * s for e, s in zip(ext, scale))
        res.append({'actor': r[1], 'label': label, 'texture': tex, 'extent': ext, 'scale': scale,
                    'center': t[0] if t else None, 'yaw': t[1] if t else None, 'present': present})
    return res


def streamed_enemy_level(main):
    """Dump dir of the enemy sublevel the main level always loads, or None.

    Dungeons ship two enemy layouts, e.g. X_Enemies and X_Enemies_Alternate_01. The live one is
    referenced by a LevelStreamingAlwaysLoaded object; the other is only streamed in by code.
    """
    names = [l.rstrip('\n') for l in open(f'{main}/names.txt', encoding='utf-8')]
    for r in load_rows(main):
        if r[2] != 'LevelStreamingAlwaysLoaded': continue
        b = open(f'{main}/{r[0]}.bin', 'rb').read()
        for i, n in enumerate(names):
            if n.startswith('/') and '_Enemies' in n and struct.pack('<II', i, 0) in b:
                rel = n.removeprefix('/Game/').replace('/', '__')
                return os.path.join(os.path.dirname(main), 'Content__' + rel)
    return None
