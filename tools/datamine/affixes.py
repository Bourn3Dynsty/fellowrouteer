"""Dungeon affixes (modifiers) that change routing: Ghorn/Eira mini-bosses, Shadow Lord, Empowered enemies.

Reads DT_ModifierInfo for names/descriptions/icons, CT_DungeonModifiers for tuning values,
BP_DM_MiniBossSpawner actors for where each mini-boss waits (and which enemies it clears), and
gameplay tags on enemy actors for empowered spawns.

Only affixes in the live rotation are exported; Krumbug (WinterTrickster) exists in the files but
isn't used. Promoted enemies aren't a weekly affix: capstone dungeons always have them, so they're
exported as a spawn flag rather than an affix.
"""
import json, os, re, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from levels import load_rows, actors
from uprops import read_header

# Modifier blueprint -> (our id, kind)
AFFIXES = {
    'BP_DungeonModifier_WinterGiant': ('ghorn', 'miniboss'),
    'BP_DungeonModifier_WinterWitch': ('eira', 'miniboss'),
    'BP_DungeonModifiers_ShadowLord': ('shadow-lord', 'score'),
    'BP_DungeonModifiers_EmpoweredMinions': ('empowered', 'enemies'),
}
# E_Modifier_MiniBossType on BP_DM_MiniBossSpawner
MINIBOSS_TYPES = {0: 'ghorn', 1: 'krumbug', 2: 'eira'}
MINIBOSS_NPC = {'ghorn': 'BP_NPC_DM_WinterGiant', 'eira': 'BP_NPC_DM_WinterWitch'}
# Curve-table row prefix for each mini-boss (kill score in CT_CharacterBaseAttributes, timer refund in CT_DungeonModifiers)
MINIBOSS_ROW = {'ghorn': 'DM_WinterGiant', 'eira': 'DM_WinterWitch'}
EMPOWERED_TAG = 'ActorTypeTags.DungeonModifiers.EmpoweredMinions.Selected'
PROMOTED_TAG = 'ActorTypeTags.DungeonModifiers.PromotedEnemy.Selected'
# BP_DM_MiniBossSpawner.RemoveAddRadius: enemies within this distance are removed when the mini-boss spawns
DEFAULT_REMOVE_RADIUS = 2000.0


def localized():
    d = json.load(open('dump/raw/game_en.json', encoding='utf-8'))
    return {k: v for ns in d.values() if isinstance(ns, dict) for k, v in ns.items()}


def clean(text):
    text = re.sub(r'<[^>]+>', '', text).replace('\r', '')
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def modifier_info():
    """Rows of DT_ModifierInfo: blueprint -> {name, description, icon}. Each row stores its icon
    path, then the name and description FText, then the modifier blueprint class."""
    d = 'dump/mod/DT_ModifierInfo'
    names = [l.rstrip('\n') for l in open(f'{d}/names.txt', encoding='utf-8')]
    paths = {n.split('/')[-1]: n for n in names if n.startswith('/')}
    b = open(f'{d}/0.bin', 'rb').read()
    strings = localized()
    out, icon, texts = {}, None, []
    o = 0
    while o < len(b) - 8:
        i, num = struct.unpack_from('<II', b, o)
        if num == 0 and i < len(names):
            n = names[i]
            leaf = n.split('/')[-1]
            if n.startswith('/') and '/icons/' in n.lower():
                icon, texts = n, []
                o += 8
                continue
            # A row ends with its modifier class. AnomalousOrbs is referenced by every row, so skip it.
            is_row_end = (leaf.startswith('BP_Ascension') or leaf.startswith('BP_DungeonModifier')) \
                and not leaf.endswith('_C') and leaf != 'BP_DungeonModifiers_AnomalousOrbs'
            if is_row_end and len(texts) >= 2:
                if leaf in AFFIXES and leaf not in out:
                    out[leaf] = {'name': texts[-2], 'description': texts[-1], 'icon': icon}
                icon, texts = None, []
                o += 8
                continue
        m = re.match(rb'[0-9A-F]{32}\x00', b[o:o + 33])
        if m:
            key = b[o:o + 32].decode()
            if key in strings: texts.append(clean(strings[key]))
            o += 33
            continue
        o += 1
    return out


def constants():
    """CT_DungeonModifiers rows: {'Shadowlord.NumLords.Dungeon': 3.0, ...}."""
    from curvetable import parse
    return {k: v[0][1] for k, v in parse('dump/mod/CT_DungeonModifiers').items() if v}


def miniboss_spawns(main_level):
    """[(type, x, y, z, remove_radius)] for live-rotation BP_DM_MiniBossSpawner actors in a main level."""
    rows = load_rows(main_level)
    spawners = {r[1]: r for r in rows if r[2] == 'BP_DM_MiniBossSpawner_C'}
    if not spawners: return []
    found, _ = actors(main_level, lambda c: c == 'BP_DM_MiniBossSpawner_C', comp_classes=('SceneComponent',))
    out = []
    for a in found:
        r = spawners[a['name']]
        b = open(f'{main_level}/{r[0]}.bin', 'rb').read()
        present, zeros, o = read_header(b)
        # Properties 1-7 are 4-byte references, property 9 is the MiniBossType byte (absent = 0) and
        # property 11 is RemoveAddRadius, a double (absent = the class default).
        live = [p for p in present if p not in zeros]
        pos = o + 4 * len([p for p in live if p < 9])
        kind = 0
        if 9 in live:
            kind = b[pos]
            pos += 1
        radius = DEFAULT_REMOVE_RADIUS
        if 11 in live:
            radius = struct.unpack_from('<d', b, pos)[0]
        key = MINIBOSS_TYPES.get(kind)
        if key in MINIBOSS_NPC:
            out.append((key, a['x'], a['y'], a['z'], radius))
    return out


def tagged_actors(enemy_level):
    """{actor name: set of flags} for empowered and promoted enemies."""
    names = [l.rstrip('\n') for l in open(f'{enemy_level}/names.txt', encoding='utf-8')]
    tags = {t: names.index(t) for t in (EMPOWERED_TAG, PROMOTED_TAG) if t in names}
    out = {}
    for r in load_rows(enemy_level):
        if not r[2].startswith('BP_NPC_'): continue
        b = open(f'{enemy_level}/{r[0]}.bin', 'rb').read()
        for tag, idx in tags.items():
            if struct.pack('<II', idx, 0) in b:
                out.setdefault(r[1], set()).add('empowered' if tag == EMPOWERED_TAG else 'promoted')
    return out
