"""Patrol paths: BP_PatrolPath actors in a dungeon's enemy level, each holding a SplineComponent.

SplineComponent property 0 is SplineCurves; its first member is the Position curve, an array of
FInterpCurvePointVector serialized as unversioned structs: a header fragment (plus a zero mask when
some members are zero), then the non-zero members in order: InVal (float), OutVal, ArriveTangent,
LeaveTangent (3 doubles each) and InterpMode (byte). OutVal is local to the component. The
component's RelativeLocation (property 125) and RelativeRotation (126) are the last values in the
export, followed by zero padding.
"""
import math, struct
from levels import load_rows

POINT_FIELDS = (4, 24, 24, 24, 1)
LOC, ROT = 125, 126


def _point(b, o):
    """Parse one curve point at o: (OutVal, new offset) or None."""
    if o + 2 > len(b): return None
    frag, = struct.unpack_from('<H', b, o)
    skip, has_zeros, last, num = frag & 0x7f, frag & 0x80, frag & 0x100, frag >> 9
    if not last or skip + num > len(POINT_FIELDS) or num == 0: return None
    o += 2
    mask = 0
    if has_zeros:
        mask = b[o]; o += 1
    vals = {}
    for k, idx in enumerate(range(skip, skip + num)):
        if mask >> k & 1: continue
        size = POINT_FIELDS[idx]
        if o + size > len(b): return None
        vals[idx] = b[o:o + size]
        o += size
    out = struct.unpack('<3d', vals[1]) if 1 in vals else (0.0, 0.0, 0.0)
    mode = vals[4][0] if 4 in vals else 0
    inval = struct.unpack('<f', vals[0])[0] if 0 in vals else 0.0
    if mode > 4 or not all(math.isfinite(v) and abs(v) < 1e6 for v in out): return None
    return inval, out, o


def spline_points(b, search=160):
    """Local Position points of a SplineComponent export."""
    for start in range(0, min(search, len(b) - 4)):
        n, = struct.unpack_from('<i', b, start)
        if not 2 <= n <= 400: continue
        o, pts, prev = start + 4, [], -1.0
        for _ in range(n):
            r = _point(b, o)
            if r is None or r[0] <= prev: break
            prev, out, o = r[0], r[1], r[2]
            pts.append(out)
        if len(pts) == n: return pts
    return None


def _sane(v):
    return all(math.isfinite(x) and abs(x) < 1e6 and (x == 0 or abs(x) > 1e-4) for x in v)


def _transform(b, present):
    """RelativeLocation and yaw, read back from the end of the export (before its zero padding)."""
    for pad in (8, 4, 12, 0):
        end = len(b) - pad
        rot = (0.0, 0.0, 0.0)
        if ROT in present:
            rot = struct.unpack_from('<3d', b, end - 24); end -= 24
        loc = struct.unpack_from('<3d', b, end - 24) if LOC in present else (0.0, 0.0, 0.0)
        if _sane(loc) and _sane(rot) and all(abs(r) <= 360 for r in rot):
            return loc, rot[1]
    return (0.0, 0.0, 0.0), 0.0


def patrol_paths(level):
    """[{name, points: [(x, y, z) world]}] for every BP_PatrolPath in a level."""
    from uprops import read_header
    rows = load_rows(level)
    owners = {r[1] for r in rows if r[2] == 'BP_PatrolPath_C'}
    out = []
    for r in rows:
        if r[2] != 'SplineComponent' or r[4] not in owners: continue
        b = open(f'{level}/{r[0]}.bin', 'rb').read()
        present, zeros, _ = read_header(b)
        pts = spline_points(b)
        if not pts: continue
        (lx, ly, lz), yaw = _transform(b, [p for p in present if p not in zeros])
        c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        world = [(lx + x * c - y * s, ly + x * s + y * c, lz + z) for x, y, z in pts]
        out.append({'name': r[4], 'points': world})
    return out


def patrol_members(level):
    """{patrol actor name: [NPC actor names]}. Each BP_PatrolPath holds an array of references to
    the NPCs that walk it; we take the longest run of NPC export references in the actor."""
    rows = load_rows(level)
    idx = {int(r[0]): r for r in rows}
    is_npc = lambda v: 0 < v <= len(rows) and idx[v - 1][2].startswith('BP_NPC_')
    out = {}
    for r in rows:
        if r[2] != 'BP_PatrolPath_C': continue
        b = open(f'{level}/{r[0]}.bin', 'rb').read()
        best = []
        for s in range(0, len(b) - 8):
            n, = struct.unpack_from('<i', b, s)
            if not 1 <= n <= 40 or s + 4 + 4 * n > len(b) or n <= len(best): continue
            vals = struct.unpack_from(f'<{n}i', b, s + 4)
            if all(is_npc(v) for v in vals): best = [idx[v - 1][1] for v in vals]
        out[r[1]] = best
    return out
