"""Enemy abilities: names from the NPC ability data tables, flags from each ability blueprint.

An ability counts as interruptible ("kickable") when it is a cast or channel that is blocked by
CharacterStatus.Silenced; a cast/channel without that tag can only be stopped by crowd control.
"""
import json, os, re, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

IMMUNE_TAGS = ('GameplayCue.Shared.StunImmune', 'GameplayEffect.CCImmune')
SKIP_NAMES = {'attack', 'shoot', 'auto attack', 'melee attack'}


def _strings():
    d = json.load(open('dump/raw/game_en.json', encoding='utf-8'))
    return {k: v for ns in d.values() if isinstance(ns, dict) for k, v in ns.items()}


def table_rows(table_dir, strings):
    """[(ability name, ability blueprint path)] from a DT_*AbilityData dump.

    Rows hold the ability's display FText followed ~190 bytes later by its blueprint class; other
    name references in between are default values, so take the class nearest that offset."""
    names = [l.rstrip('\n') for l in open(f'{table_dir}/names.txt', encoding='utf-8')]
    b = open(f'{table_dir}/0.bin', 'rb').read()
    texts, classes = [], []
    o = 0
    while o < len(b) - 8:
        i, num = struct.unpack_from('<II', b, o)
        if num == 0 and i < len(names) and names[i].startswith('/') and '/GA_' in names[i]:
            classes.append((o, names[i]))
            o += 8
            continue
        if re.match(rb'[0-9A-F]{32}\x00', b[o:o + 33]):
            key = b[o:o + 32].decode()
            if key in strings: texts.append((o, re.sub(r'<[^>]+>', '', strings[key]).strip()))
            o += 33
            continue
        o += 1
    rows = []
    for k, (to, name) in enumerate(texts):
        end = texts[k + 1][0] if k + 1 < len(texts) else len(b)
        cands = [(abs(co - (to + 190)), path) for co, path in classes if to < co < end]
        if cands: rows.append((name, min(cands)[1]))
    return rows


def ability_flags(ga_dir):
    names = set(l.rstrip('\n') for l in open(f'{ga_dir}/names.txt', encoding='utf-8')) if os.path.exists(f'{ga_dir}/names.txt') else set()
    cast = 'AbilityType.Casted' in names
    channel = 'AbilityType.Channeled' in names
    silence = 'CharacterStatus.Silenced' in names
    school = next((n.split('.')[-1] for n in sorted(names) if n.startswith('AbilityType.Magic.')), None)
    if not school and 'AbilityType.Physical' in names: school = 'Physical'
    return {
        'interruptible': (cast or channel) and silence,
        'ccOnly': (cast or channel) and not silence,
        'channel': channel,
        'school': school,
    }


def npc_folder(cls_path):
    """/Game/characters/NPC/FrozenKingdom/ElfGuard/BP_NPC_... -> frozenkingdom/elfguard"""
    parts = cls_path.split('/')
    try:
        i = [p.lower() for p in parts].index('npc')
    except ValueError:
        return None
    return '/'.join(parts[i + 1:-1]).lower()


def ga_folder(ga_path):
    parts = ga_path.split('/')
    try:
        i = [p.lower() for p in parts].index('npc')
    except ValueError:
        return None
    rest = parts[i + 1:-1]
    return '/'.join(rest[:2]).lower()


def all_rows():
    strings = _strings()
    rows = []
    for d in sorted(os.listdir('dump/abil/tables')):
        rows += table_rows(f'dump/abil/tables/{d}', strings)
    return rows


def enemy_abilities(cls_path, rows):
    folder = npc_folder(cls_path)
    merged = {}
    for name, ga in rows:
        if ga_folder(ga) != folder or name.lower() in SKIP_NAMES or 'AutoAttack' in ga: continue
        if name.startswith('(CUT)'): continue
        flags = ability_flags('dump/abil/ga/' + ga.split('/')[-1].split('.')[0])
        cur = merged.setdefault(name, {})
        for k, v in flags.items():
            if v: cur[k] = cur.get(k) or v
    out = []
    for name, flags in merged.items():
        if flags.get('interruptible'): flags.pop('ccOnly', None)
        out.append({'name': name, **flags})
    # Kickable first, then stun-only, then the rest
    out.sort(key=lambda a: (not a.get('interruptible'), not a.get('ccOnly')))
    return out


def stun_immune(npc_class):
    names = f'dump/npc/{npc_class}/names.txt'
    if not os.path.exists(names): return False
    have = set(l.rstrip('\n') for l in open(names, encoding='utf-8'))
    return any(t in have for t in IMMUNE_TAGS)
