"""Read an NPC class's display name from its class-default object."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from levels import load_rows

def npc_info(cls_name, root='dump/npc'):
    """{'name': display name} from Default__<cls>; the name is the FText after a 32-hex key."""
    d = f'{root}/{cls_name}'
    if not os.path.exists(f'{d}/exports.tsv'): return None
    cdo = next((r for r in load_rows(d) if r[1].startswith('Default__')), None)
    if not cdo: return None
    b = open(f'{d}/{cdo[0]}.bin', 'rb').read()
    m = re.search(rb'[0-9A-F]{32}\x00(.{4})', b, re.S)
    if m:
        n = int.from_bytes(m.group(1), 'little')
        return {'name': b[m.end():m.end() + n - 1].decode('utf-8', 'replace')}
    # Newer NPCs reference a string table row instead (ST_NPCs, key NPC_..._Name).
    m = re.search(rb'(NPC_[A-Za-z0-9_]+_Name)\x00', b)
    return {'name': string_table('ST_NPCs').get(m.group(1).decode()) if m else None}


_tables = None
def string_table(namespace):
    """Rows of a string table, from the English locres dump."""
    global _tables
    if _tables is None:
        import json
        _tables = json.load(open('dump/raw/game_en.json', encoding='utf-8'))
    return _tables.get(namespace, {})
