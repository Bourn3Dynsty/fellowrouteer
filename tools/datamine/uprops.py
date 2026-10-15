"""Minimal decoder for UE unversioned property headers (no schema needed)."""
import struct

def read_header(b, o=0):
    """Return (present_indices_in_stream_order, zero_indices, offset_after_header)."""
    frags = []
    while True:
        v, = struct.unpack_from('<H', b, o); o += 2
        frags.append((v & 0x7f, bool(v & 0x80), bool(v & 0x100), v >> 9))
        if v & 0x100: break
    present = []
    idx = 0
    total_vals = 0
    for skip, _, _, n in frags:
        idx += skip
        present.extend(range(idx, idx + n)); idx += n; total_vals += n
    zeros = set()
    if any(f[1] for f in frags):
        nbits = sum(f[3] for f in frags if f[1])
        nbytes = 1 if nbits <= 8 else 2 if nbits <= 16 else ((nbits + 31) // 32) * 4
        mask = int.from_bytes(b[o:o + nbytes], 'little'); o += nbytes
        bit = 0; idx = 0
        for skip, hz, _, n in frags:
            idx += skip
            for k in range(n):
                if hz:
                    if mask >> bit & 1: zeros.add(idx + k)
                    bit += 1
            idx += n
    return present, zeros, o

def values(b, sizes, o=0):
    """Walk values using a {index: byte_size} table. Returns ({index: offset}, ok)."""
    present, zeros, o = read_header(b, o)
    offs = {}
    for i in present:
        if i in zeros: continue
        offs[i] = o
        if i not in sizes: return offs, False, present
        o += sizes[i]
    return offs, True, present

def vec(b, o): return struct.unpack_from('<3d', b, o)
