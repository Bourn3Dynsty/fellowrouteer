"""List file paths from an Unreal IoStore .utoc directory index (unencrypted)."""
import struct, sys

def read_fstring(b, o):
    n, = struct.unpack_from('<i', b, o); o += 4
    if n == 0: return '', o
    if n < 0:
        n = -n; s = b[o:o + n * 2].decode('utf-16-le').rstrip('\0'); return s, o + n * 2
    return b[o:o + n].decode('utf-8', 'replace').rstrip('\0'), o + n

def main(path):
    b = open(path, 'rb').read()
    hsize, entries, cbc, cbs, cmc, cml, cbsz, dis, pc = struct.unpack_from('<9I', b, 20)
    flags = b[80]
    seeds, = struct.unpack_from('<I', b, 84)
    nophash, = struct.unpack_from('<I', b, 96)
    assert not flags & 2, 'encrypted'
    o = hsize + entries * 12 + entries * 10 + seeds * 4 + nophash * 4 + cbc * 12 + cmc * cml
    if flags & 4:
        sig, = struct.unpack_from('<i', b, o); o += 4 + sig * 2 + 20 * cbc
    d = b[o:o + dis]
    p = 0
    mount, p = read_fstring(d, p)
    n, = struct.unpack_from('<i', d, p); p += 4
    dirs = [struct.unpack_from('<4I', d, p + i * 16) for i in range(n)]; p += n * 16
    n, = struct.unpack_from('<i', d, p); p += 4
    files = [struct.unpack_from('<3I', d, p + i * 12) for i in range(n)]; p += n * 12
    n, = struct.unpack_from('<i', d, p); p += 4
    strings = []
    for _ in range(n):
        s, p = read_fstring(d, p); strings.append(s)
    NONE = 0xFFFFFFFF
    out = []
    def walk(di, prefix):
        name, child, sib, f = dirs[di]
        here = prefix + (strings[name] + '/' if name != NONE else '')
        while f != NONE:
            fn, nxt, _ = files[f]; out.append(here + strings[fn]); f = nxt
        c = child
        while c != NONE:
            walk(c, here); c = dirs[c][2]
    walk(0, mount)
    sys.stdout.reconfigure(encoding='utf-8')
    print('\n'.join(sorted(out)))

main(sys.argv[1])
