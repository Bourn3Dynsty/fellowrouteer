"""Parse a cooked UCurveTable (SimpleCurves, unversioned) into {row_name: [(time, value), ...]}."""
import os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from uprops import read_header

def parse(d):
    names = [l.rstrip('\n') for l in open(f'{d}/names.txt', encoding='utf-8')]
    b = open(f'{d}/0.bin', 'rb').read()
    _, _, o = read_header(b)
    o += 4  # object guid flag
    nrows, = struct.unpack_from('<i', b, o); o += 4
    mode = b[o]; o += 1
    assert mode == 1, f'curve mode {mode} (only SimpleCurves supported)'
    rows = {}
    for _ in range(nrows):
        ni, num = struct.unpack_from('<II', b, o); o += 8
        name = names[ni & 0x3FFFFFFF] + (f'_{num - 1}' if num else '')
        present, zeros, o = read_header(b, o)
        keys = []
        for i in present:
            if i in zeros: continue
            if i == 0 or i == 3 or i == 4: o += 1
            elif i == 1:
                n, = struct.unpack_from('<i', b, o); o += 4
                keys = [struct.unpack_from('<ff', b, o + k * 8) for k in range(n)]; o += n * 8
            elif i == 2: o += 4
            else: raise ValueError(f'unknown curve prop {i} in {name}')
        rows[name] = keys
    return rows

if __name__ == '__main__':
    rows = parse(sys.argv[1])
    for k, v in rows.items():
        if len(sys.argv) < 3 or sys.argv[2] in k: print(k, v)
