"""Turn dumped Fellowship level/NPC/curve data into one JSON file per dungeon."""
import json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from levels import actors, map_boxes, load_rows
from npcinfo import npc_info
from curvetable import parse as parse_curves
from dungeons_cfg import DUNGEONS, REQUIRED, LOC_KEY, CAPSTONE, ADVENTURE
import affixes
import abilities
import patrols as patrol_data

OUT = sys.argv[1]
SITE_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'lib', 'data', 'game')
os.makedirs(OUT, exist_ok=True)
loc = json.load(open('dump/raw/game_en.json', encoding='utf-8'))
strings = {k: v for ns in loc.values() if isinstance(ns, dict) for k, v in ns.items()}
curves = parse_curves('dump/cba')
score_rows = {k.split('.')[0]: v[0][1] for k, v in curves.items() if k.endswith('.CRNpcAttributeSet.KillScore') and v}
health_rows = {k.split('.')[0]: v[0][1] for k, v in curves.items() if k.endswith('.Custom.DefaultBaseHealthMultiplier') and v}
base_health_rows = {k.split('.')[0]: v[0][1] for k, v in curves.items() if k.endswith('.BasicAttributeSet.BaseHealth') and v}

PACK_RADIUS = 900.0   # world units (cm); spawns closer than this chain into one pack
PACK_DZ = 500.0
PATROL_SPREAD = 120.0  # members placed at a patrol's start are spread on a ring this wide
PATROL_SNAP = 1500.0  # a patrol member must start within this distance of its path

def attr_id(cls):
    names_file = f'dump/npc/{cls}/names.txt'
    if not os.path.exists(names_file): return None
    for n in (l.strip() for l in open(names_file, encoding='utf-8')):
        if n in score_rows: return n
    return None

def npc_tags(cls):
    names_file = f'dump/npc/{cls}/names.txt'
    if not os.path.exists(names_file): return set()
    return {l.strip() for l in open(names_file, encoding='utf-8') if l.startswith('ActorTypeTags.')}

def floor_of(n, floors):
    """Floor whose map box contains the spawn in X/Y; ties broken by vertical distance."""
    inside = []
    for f in floors:
        (cx, cy, cz), (ex, ey, ez) = f['center'], f['extent']
        if abs(n['x'] - cx) <= ex and abs(n['y'] - cy) <= ey:
            inside.append((max(0.0, abs(n['z'] - cz) - ez), abs(n['z'] - cz), f))
    if inside: return min(inside, key=lambda t: (t[0], t[1]))[2], True
    best = min(floors, key=lambda f: math.hypot(n['x'] - f['center'][0], n['y'] - f['center'][1]))
    return best, False

NOISE = {'t', 'map', 'st', 'sp', 'sf', 'mc', 'em', 'vv', 'global', 'area', 'minimap'}

def texture_label(tex, internal):
    """Readable area name from a texture like T_ST_Map_Interior_01 -> 'Interior'."""
    words = [w for w in tex.split('_') if w.lower() not in NOISE and not w.isdigit()
             and w.lower() not in internal.lower()]
    return ' '.join(w if w.isupper() else w.capitalize() for w in words)

def slugify(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

report = []
ability_rows = abilities.all_rows()

def cls_path(cls):
    rows = load_rows(f'dump/npc/{cls}')
    cdo = next((r for r in rows if r[1].startswith('Default__')), None)
    return cdo[3] if cdo else ''

for internal, (slug, main, enem) in DUNGEONS.items():
    boxes = map_boxes(main)
    floors = []
    for i, b in enumerate(boxes):
        tex = b['texture'].split('.')[-1]
        label = b['label'] if re.fullmatch(r"[ -~]{1,40}", b['label'] or '') else ''
        if label in ('', 'Global'): label = texture_label(tex, internal)
        if not label: label = f'Floor {i + 1}' if len(boxes) > 1 else 'Map'
        floors.append({'id': f'f{i + 1}', 'label': label,
                       'texture': tex, 'center': b['center'], 'extent': b['extent']})
    # Starting area first; ids follow display order.
    floors.sort(key=lambda f: 0 if f['label'].lower().startswith('start') else 1)
    for i, f in enumerate(floors): f['id'] = f'f{i + 1}'
    npcs, bad = actors(enem, lambda c: c.startswith('BP_NPC_'))
    tagged = affixes.tagged_actors(enem)
    # Patrol paths and the NPCs that walk them (BP_PatrolPath keeps a list of its members).
    paths, member_of = {}, {}
    for lvl in (enem, main):
        for path in patrol_data.patrol_paths(lvl): paths[path['name']] = path['points']
        for pname, ms in patrol_data.patrol_members(lvl).items():
            if pname in paths:
                for m in ms: member_of.setdefault(m, pname)
    enemies, spawns, skipped = {}, [], {}
    runtime = 0
    for n in sorted(npcs, key=lambda n: n['name']):
        cls = n['cls'][:-2]
        if abs(n['x']) < 1 and abs(n['y']) < 1:
            # Parked at the origin: the game moves it to the start of its patrol path when it spawns.
            pname = member_of.get(n['name'])
            if not pname:
                runtime += 1
                continue
            group = sorted(m for m, pn in member_of.items() if pn == pname)
            k, count = group.index(n['name']), len(group)
            x0, y0, z0 = paths[pname][0]
            a = 2 * math.pi * k / max(count, 1)
            r = PATROL_SPREAD if count > 1 else 0.0
            n = {**n, 'x': x0 + r * math.cos(a), 'y': y0 + r * math.sin(a), 'z': z0}
        aid = attr_id(cls)
        info = npc_info(cls) or {}
        score = score_rows.get(aid)
        tags = npc_tags(cls)
        is_boss = 'Boss' in (aid or cls) or 'ActorTypeTags.Boss' in tags
        if aid is None or (not score and not is_boss):
            skipped[cls] = skipped.get(cls, 0) + 1
            continue
        eid = slugify(aid)
        if eid not in enemies:
            enemies[eid] = {'id': eid, 'name': info.get('name') or aid, 'score': int(score),
                            'type': 'boss' if is_boss else ('miniboss' if 'Mini' in aid else 'trash'),
                            'healthMultiplier': round(health_rows.get(aid, 1.0), 3), 'gameId': aid, 'classes': []}
            if 'ActorTypeTags.Elite' in tags: enemies[eid]['elite'] = True
            if aid in base_health_rows: enemies[eid]['baseHealth'] = base_health_rows[aid]
            ab = abilities.enemy_abilities(cls_path(cls), ability_rows)
            if ab: enemies[eid]['abilities'] = ab
            if is_boss or abilities.stun_immune(cls): enemies[eid]['stunImmune'] = True
        if cls not in enemies[eid]['classes']: enemies[eid]['classes'].append(cls)
        f, ok = floor_of(n, floors)
        (cx, cy, _), (ex, ey, _) = f['center'], f['extent']
        u = (n['y'] - (cy - ey)) / (2 * ey); v = ((cx + ex) - n['x']) / (2 * ex)
        spawns.append({'enemyId': eid, 'floor': f['id'], 'x': round(u, 4), 'y': round(v, 4), 'actor': n['name'],
                       'w': (n['x'], n['y'], n['z']), 'onMap': ok and 0 <= u <= 1 and 0 <= v <= 1,
                       **{t: True for t in sorted(tagged.get(n['name'], ()))}})
    # Packs: single-linkage clustering of trash per floor (bosses get their own pack)
    parent = list(range(len(spawns)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for a in range(len(spawns)):
        for b in range(a + 1, len(spawns)):
            sa, sb = spawns[a], spawns[b]
            if sa['floor'] != sb['floor']: continue
            if enemies[sa['enemyId']]['type'] == 'boss' or enemies[sb['enemyId']]['type'] == 'boss': continue
            pa, pb = member_of.get(sa['actor']), member_of.get(sb['actor'])
            if pa or pb:
                if pa == pb: parent[find(a)] = find(b)
                continue
            (x1, y1, z1), (x2, y2, z2) = sa['w'], sb['w']
            if abs(z1 - z2) < PACK_DZ and math.hypot(x1 - x2, y1 - y2) < PACK_RADIUS:
                parent[find(a)] = find(b)
    groups = {}
    for i in range(len(spawns)): groups.setdefault(find(i), []).append(i)
    order = sorted(groups.values(), key=lambda g: (spawns[g[0]]['floor'], min(spawns[i]['y'] for i in g), min(spawns[i]['x'] for i in g)))
    for p, g in enumerate(order, 1):
        for i in g: spawns[i]['pack'] = p
    # Spawn ids are saved in routes and share links, so keep the ids of the last export: an
    # unchanged spawn (same enemy, floor and position) keeps its id and new spawns get fresh ones.
    previous = {}
    prev_file = os.path.join(SITE_DATA, f'{slug}.json')
    if os.path.exists(prev_file):
        for ps in json.load(open(prev_file, encoding='utf-8')).get('spawns', []):
            previous.setdefault((ps['enemyId'], ps.get('floor'), ps['x'], ps['y']), []).append(ps['id'])
    used = set()
    ordered = sorted(spawns, key=lambda s: (s['pack'], s['enemyId']))
    for sp in ordered:
        old = next((i for i in previous.get((sp['enemyId'], sp['floor'], sp['x'], sp['y']), []) if i not in used), None)
        if old:
            sp['id'] = old
            used.add(old)
    # Never hand out an id a removed spawn used to have, or old routes would point at a different enemy.
    old_ids = [i for ids in previous.values() for i in ids] + list(used)
    next_id = max([int(i.rsplit('-', 1)[1]) for i in old_ids] + [0]) + 1
    for sp in ordered:
        if 'id' not in sp:
            sp['id'] = f'{slug}-{next_id}'
            next_id += 1
    off = [s for s in spawns if not s['onMap']]
    def place(x, y, z):
        f, _ = floor_of({'x': x, 'y': y, 'z': z}, floors)
        (cx, cy, _), (ex, ey, _) = f['center'], f['extent']
        return {'floor': f['id'], 'x': round((y - (cy - ey)) / (2 * ey), 4), 'y': round(((cx + ex) - x) / (2 * ex), 4)}
    starts, _ = actors(main, lambda c: c == 'BP_DungeonStartBarrier_Area_C', comp_classes=('SceneComponent',))
    respawns, _ = actors(main, lambda c: c == 'BP_RespawnPointInteractable_C', comp_classes=('SceneComponent',))
    start = place(starts[0]['x'], starts[0]['y'], starts[0]['z']) if starts else None
    checkpoints = [place(r['x'], r['y'], r['z']) for r in sorted(respawns, key=lambda r: r['name'])]
    minibosses = []
    for kind, x, y, z, radius in affixes.miniboss_spawns(main):
        f, _ = floor_of({'x': x, 'y': y, 'z': z}, floors)
        (cx, cy, _), (ex, ey, _) = f['center'], f['extent']
        # The spawner removes every enemy within RemoveAddRadius when the mini-boss appears.
        replaces = [s['id'] for s in spawns if math.dist(s['w'], (x, y, z)) <= radius]
        minibosses.append({'affix': kind, 'floor': f['id'],
                           'x': round((y - (cy - ey)) / (2 * ey), 4), 'y': round(((cx + ex) - x) / (2 * ex), 4),
                           'radius': round(radius), 'replaces': sorted(replaces, key=lambda i: int(i.rsplit('-', 1)[1]))})
    # Patrol paths, with the spawns that walk them.
    by_actor = {s['actor']: s for s in spawns}
    patrols = []
    for pname, pts in paths.items():
        near = lambda s: min(math.hypot(s['w'][0] - q[0], s['w'][1] - q[1]) for q in pts)
        walkers = [s for a, s in by_actor.items() if member_of.get(a) == pname and near(s) < PATROL_SNAP]
        if walkers:
            f = next(fl for fl in floors if fl['id'] == walkers[0]['floor'])
            (cx, cy, _), (ex, ey, _) = f['center'], f['extent']
            patrols.append({'floor': f['id'],
                            'points': [[round((y - (cy - ey)) / (2 * ey), 4), round(((cx + ex) - x) / (2 * ex), 4)] for x, y, _ in pts],
                            'spawns': sorted({w['id'] for w in walkers}, key=lambda i: int(i.rsplit('-', 1)[1]))})
    patrols.sort(key=lambda p: int(p['spawns'][0].rsplit('-', 1)[1]))
    for k, p in enumerate(patrols, 1): p['id'] = f'{slug}-p{k}'
    name = strings.get(LOC_KEY.get(internal, f'Level_{internal}_Name'), internal)
    data = {
        'id': slug, 'slug': slug, 'name': name, 'internalName': internal,
        'kind': 'adventure' if internal in ADVENTURE else 'capstone' if internal in CAPSTONE else 'dungeon',
        'requiredScore': REQUIRED[internal],
        'floors': [{'id': f['id'], 'label': f['label'], 'image': f'/maps/{slug}/{f["id"]}.webp', 'texture': f['texture'],
                    'worldSize': [round(2 * f['extent'][1]), round(2 * f['extent'][0])]} for f in floors],
        'enemies': sorted(enemies.values(), key=lambda e: (e['type'] != 'trash', e['name'])),
        'spawns': [{k: s[k] for k in ('id', 'enemyId', 'floor', 'x', 'y', 'pack', 'empowered', 'promoted') if k in s}
                   for s in sorted(spawns, key=lambda s: int(s['id'].rsplit('-', 1)[1]))],
        'minibosses': sorted(minibosses, key=lambda m: m['affix']),
        **({'start': start} if start else {}),
        'checkpoints': checkpoints,
        'patrols': [{k: p[k] for k in ('id', 'floor', 'points', 'spawns')} for p in patrols],
    }
    json.dump(data, open(f'{OUT}/{slug}.json', 'w', encoding='utf-8'), indent='\t', ensure_ascii=False)
    total = sum(enemies[s['enemyId']]['score'] for s in spawns)
    report.append(f"{name:26} floors={len(floors)} enemies={len(enemies):2} spawns={len(spawns):3} packs={len(order):3} "
                  f"score={total}/{REQUIRED[internal]} empowered={sum(1 for s in spawns if s.get('empowered'))} "
                  f"promoted={sum(1 for s in spawns if s.get('promoted'))} patrols={len(patrols)} minibosses={len(minibosses)} replaced={sum(len(m['replaces']) for m in minibosses)} offmap={len(off)} runtime={runtime} skipped={skipped}")
print('\n'.join(report))
