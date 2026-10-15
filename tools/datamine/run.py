"""Extract dungeon maps, spawns and enemy data from a local Fellowship install.

Usage (from tools/datamine):
    python run.py [--skip-dump]

Environment:
    FELLOWSHIP_PAKS  path to fellowship/Content/Paks (default: Steam's default library)
    DOTNET           dotnet executable (default: dotnet on PATH)

Writes src/lib/data/game/<slug>.json and static/maps/<slug>/<floor>.webp.
See README.md for setup.
"""
import json, os, re, shutil, struct, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(HERE, '.work')
sys.path.insert(0, HERE)

EXTRACTOR = os.path.join(HERE, 'extractor', 'bin', 'Release', 'net10.0', 'extractor')
GAME = 'GAME_UE5_4'


def extractor(*args):
    exe = EXTRACTOR + ('.exe' if os.name == 'nt' else '')
    return subprocess.run([exe, args[0], GAME, *args[1:]], check=True,
                          capture_output=True, text=True, encoding='utf-8', errors='replace').stdout


def batch(pairs, name):
    path = name
    with open(path, 'w', encoding='utf-8') as f:
        for pkg, out in pairs: f.write(f'{pkg}\t{out}\n')
    for line in extractor('batch', path).splitlines():
        if line.startswith('FAIL'): print('  ', line)


def dump():
    print('listing game files...')
    files = extractor('list').splitlines()
    open('files.txt', 'w', encoding='utf-8').write('\n'.join(files))

    level_re = re.compile(r'(Content/dungeons/[^/]+/[^/]+\.umap|Content/dungeons/[^/]+/Sublevels/[^/]*Enem[^/]*\.umap'
                          r'|Adventures/[^/]+/Content/Levels/[^/]+\.umap)$')
    def out_name(p):
        n = p.removeprefix('fellowship/').replace('Plugins/GameFeatures/Adventures/', 'adv/').replace('/Content/', '/')
        return 'dump/all/' + re.sub(r'\.u\w+$', '', n).replace('/', '__')
    print('dumping levels...')
    batch([(p, out_name(p)) for p in files if level_re.search(p)], 'batch_levels.txt')

    from levels import load_rows
    lower = {f.lower(): f for f in files}
    classes = set()
    for d in os.listdir('dump/all'):
        t = os.path.join('dump/all', d)
        if not os.path.exists(os.path.join(t, 'exports.tsv')): continue
        for r in load_rows(t):
            if r[2].startswith('BP_NPC_') and r[3].startswith('/'): classes.add(r[3])
    print(f'dumping {len(classes)} NPC classes...')
    pairs = []
    for c in sorted(classes):
        rel = c.replace('/Game/', 'fellowship/Content/', 1) + '.uasset'
        f = lower.get(rel.lower()) or next((x for x in files if x.lower().endswith('/' + c.split('/')[-1].lower() + '.uasset')), None)
        if f: pairs.append((f, 'dump/npc/' + c.split('/')[-1]))
    batch(pairs, 'batch_npcs.txt')

    print('dumping enemy ability tables...')
    batch([(p, 'dump/abil/tables/' + os.path.basename(p)[:-7]) for p in files
           if re.search(r'/Abilities/(DataTables|Data)/NPC/DT_[^/]+\.uasset$', p) and 'Audio' not in p], 'batch_abil.txt')
    dump_ability_blueprints(files)

    print('dumping data tables, localization and minimaps...')
    pairs = [('fellowship/Content/Abilities/DataTables/CT_CharacterBaseAttributes.uasset', 'dump/cba'),
             ('fellowship/Content/dungeons/DT_LevelInfo.uasset', 'dump/levelinfo')]
    pairs += [(p, 'dump/li/' + os.path.basename(p)[:-7]) for p in files if re.search(r'Adventures/[^/]+/Content/LI_[^/]+\.uasset$', p)]
    # Dungeon modifiers (affixes) and their mini-boss NPCs
    pairs.append(('fellowship/Content/Modifiers/DT_ModifierInfo.uasset', 'dump/mod/DT_ModifierInfo'))
    pairs.append(('fellowship/Content/Modifiers/CT_DungeonModifiers.uasset', 'dump/mod/CT_DungeonModifiers'))
    for npc in ('WinterGiant/NPC/BP_NPC_DM_WinterGiant', 'WinterWitch/NPC/BP_NPC_DM_WinterWitch'):
        pairs.append((f'fellowship/Content/Modifiers/DungeonModifiers/{npc}.uasset', 'dump/npc/' + npc.split('/')[-1]))
    batch(pairs, 'batch_tables.txt')
    os.makedirs(os.path.join(WORK, 'dump/raw'), exist_ok=True)
    extractor('locres', 'fellowship/Content/Localization/Game/en/Game.locres', 'dump/raw/game_en.json')

    from levels import map_boxes
    from dungeons_cfg import DUNGEONS, asset_path
    pairs = []
    for _, (slug, main, _) in DUNGEONS.items():
        if not os.path.exists(os.path.join(main, 'exports.tsv')):
            print(f'   missing level for {slug}: {main}'); continue
        pairs += [(asset_path(b['texture']), 'dump/tex/' + b['texture'].split('.')[-1]) for b in map_boxes(main)]
    batch(pairs, 'batch_tex.txt')


def dump_ability_blueprints(files):
    import abilities
    from dungeons_cfg import asset_path
    lower = {f.lower(): f for f in files}
    paths = sorted({ga.split('.')[0] for _, ga in abilities.all_rows()})
    print(f'dumping {len(paths)} ability blueprints...')
    pairs = []
    for ga in paths:
        p = lower.get(asset_path(ga).lower())
        if p: pairs.append((p, 'dump/abil/ga/' + ga.split('/')[-1]))
    batch(pairs, 'batch_ga.txt')


def required_scores():
    """Kill score requirement per level, read from DT_LevelInfo and the adventures' LI_* assets."""
    pat = re.compile(rb'\x01\x01\x01?(....)\x00\x03', re.S)
    out = {}
    b = open('dump/levelinfo/0.bin', 'rb').read()
    rows = [(m.start(), m.group(1).decode()) for m in re.finditer(rb'Level_([A-Za-z]+)_Name\x00', b)]
    for k, (s, name) in enumerate(rows):
        e = rows[k + 1][0] if k + 1 < len(rows) else len(b)
        m = pat.search(b, s, e)
        if m: out[name] = struct.unpack('<i', m.group(1))[0]
    li = 'dump/li'
    for d in os.listdir(li) if os.path.isdir(li) else []:
        m = pat.search(open(os.path.join(li, d, '0.bin'), 'rb').read())
        if m: out[d.removeprefix('LI_')] = struct.unpack('<i', m.group(1))[0]
    return out


def build():
    from dungeons_cfg import REQUIRED
    found = required_scores()
    for internal, value in REQUIRED.items():
        got = found.get(internal) or found.get(internal.removesuffix('Attack'))
        if got is not None and got != value:
            print(f'   NOTE: {internal} required score changed {value} -> {got}; update dungeons_cfg.REQUIRED')
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'build_data.py'), 'out/data'], check=True)


def dump_art():
    import assets
    files = open('files.txt', encoding='utf-8').read().splitlines()
    lower = {f.lower(): f for f in files}
    print('dumping relics...')
    pairs = [(p, 'dump/relic/' + os.path.basename(p)[:-7]) for p in files
             if re.search(r'DynamicHeroItems/Relic_[^/]+\.uasset$', p)]
    batch(pairs, 'batch_relic.txt')
    items = assets.plan(sorted(os.path.join('out/data', f) for f in os.listdir('out/data')))
    textures = sorted({it[0] for it in items})
    print(f'dumping {len(textures)} UI textures...')
    batch([(assets.package_path(t, lower), assets.art_dir(t)) for t in textures], 'batch_art.txt')
    with open('batch_art_bulk.txt', 'w', encoding='utf-8') as f:
        for t in textures:
            pkg = assets.package_path(t, lower)
            f.write(f'{pkg[:-7]}.ubulk\t{assets.art_dir(t)}/bulk.bin\n')
    extractor('batchraw', 'batch_art_bulk.txt')
    json.dump(items, open('art_plan.json', 'w'), indent=1)


def convert(src_dir, out, size, square=False):
    args = ['node', os.path.join(HERE, 'tex2webp.mjs'), os.path.join(src_dir, '0.bin'), out, str(size)]
    if square: args.append('--square')
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode: print('   texture failed:', src_dir, r.stderr.strip().splitlines()[-1:])
    return r.returncode == 0


def export_art():
    """Convert UI textures and add icon/art paths to the dungeon JSON; write relics.json."""
    import assets
    items = json.load(open('art_plan.json'))
    done = {}
    for tex, kind, key, size in items:
        sub = {'enemy': 'icons/enemies', 'relic': 'icons/relics', 'codex': 'art/codex', 'banner': 'art/banner',
               'affix': 'icons/affixes', 'miniboss': 'icons/minibosses'}[kind]
        rel = f'/{sub}/{key}.webp'
        os.makedirs(os.path.join(ROOT, 'static', sub), exist_ok=True)
        if convert(assets.art_dir(tex), os.path.join(ROOT, 'static', sub, key + '.webp'), size, kind in ('enemy', 'relic', 'affix', 'miniboss')):
            done[(kind, key)] = rel
    for f in os.listdir('out/data'):
        p = os.path.join('out/data', f)
        d = json.load(open(p, encoding='utf-8'))
        for e in d['enemies']:
            if ('enemy', e['id']) in done: e['icon'] = done[('enemy', e['id'])]
        d['art'] = {k: done[(k, d['slug'])] for k in ('codex', 'banner') if (k, d['slug']) in done}
        json.dump(d, open(p, 'w', encoding='utf-8'), indent='\t', ensure_ascii=False)
    relics = []
    for asset, (key, desc) in assets.RELICS.items():
        if not os.path.exists(f'dump/relic/{asset}/0.bin'): continue
        icon = done.get(('relic', key))
        relics.append({'id': key, 'name': assets.relic_name(asset) or key, 'description': desc, 'icon': icon})
    json.dump(relics, open(os.path.join(ROOT, 'src/lib/data/game/relics.json'), 'w', encoding='utf-8'),
              indent='\t', ensure_ascii=False)
    import affixes
    from curvetable import parse as parse_curves
    tuning = affixes.constants()
    cba = parse_curves('dump/cba')
    kill_score = {k.split('.')[0]: v[0][1] for k, v in cba.items() if k.endswith('.CRNpcAttributeSet.KillScore') and v}
    health_mult = {k.split('.')[0]: v[0][1] for k, v in cba.items() if k.endswith('.Custom.DefaultBaseHealthMultiplier') and v}
    out = []
    for leaf, info in affixes.modifier_info().items():
        key, kind = affixes.AFFIXES[leaf]
        extra = {}
        if kind == 'miniboss':
            row = affixes.MINIBOSS_ROW[key]
            extra = {'killScore': kill_score[row], 'healthMultiplier': round(health_mult.get(row, 1.0), 3),
                     'timeBonus': round(tuning[f'{row}.Boon.DungeonQualifierExtension'])}
        elif key == 'shadow-lord':
            extra = {'emissaryHealthMultiplier': round(health_mult.get('DungeonModifier_ShadowLord', 1.0), 3),'orbsPerEmissary': round(tuning['Shadowlord.NumOrbsForLordSpawn']),
                     'emissaries': {'dungeon': round(tuning['Shadowlord.NumLords.Dungeon']),
                                    'adventure': round(tuning['Shadowlord.NumLords.Adventure'])}}
        elif key == 'empowered':
            extra = {'scoreMultiplier': tuning['EmpoweredMinions.EnemyBuff.KillscoreScale'],
                     'healthMultiplier': 1 + tuning['EmpoweredMinions.EnemyBuff.MaxHealthMultiplier']}
        out.append({'id': key, 'kind': kind, 'name': info['name'], 'description': info['description'],
                    'icon': done.get(('affix', key)), 'portrait': done.get(('miniboss', key)), **extra})
    # Level modifiers that change enemy health (from CT_DungeonModifiers), keyed like levels.json.
    modifier_health = {
        'StoneSkin': {'nonBoss': 1 + tuning['StoneSkin.EnemyBuff.MaxHealthMultiplier']},
        'Challenge': {'nonBoss': tuning['Challenge.EnemyBoost.HealthScaler']},
        'Ultimatum': {'boss': tuning['Ultimatum.BossBoost.HealthScaler']},
    }
    json.dump({k: {t: round(v, 4) for t, v in m.items()} for k, m in modifier_health.items()},
              open(os.path.join(ROOT, 'src/lib/data/game/modifier-health.json'), 'w', encoding='utf-8'), indent='	')
    order = ['shadow-lord', 'empowered', 'ghorn', 'eira']
    out.sort(key=lambda a: order.index(a['id']) if a['id'] in order else 99)
    json.dump(out, open(os.path.join(ROOT, 'src/lib/data/game/affixes.json'), 'w', encoding='utf-8'),
              indent='\t', ensure_ascii=False)
    print(f'exported {len(done)} UI images, {len(relics)} relics and {len(out)} affixes')


def export():
    data_dir = os.path.join(ROOT, 'src/lib/data/game')
    os.makedirs(data_dir, exist_ok=True)
    for f in sorted(os.listdir('out/data')):
        d = json.load(open(os.path.join('out/data', f), encoding='utf-8'))
        maps = os.path.join(ROOT, 'static/maps', d['slug'])
        os.makedirs(maps, exist_ok=True)
        for fl in d['floors']:
            subprocess.run(['node', os.path.join(HERE, 'tex2webp.mjs'), f'dump/tex/{fl["texture"]}/0.bin',
                            os.path.join(maps, fl['id'] + '.webp'), '3072'], check=True, capture_output=True)
        shutil.copyfile(os.path.join('out/data', f), os.path.join(data_dir, f))
    print(f'exported {len(os.listdir("out/data"))} dungeons to {data_dir}')


if __name__ == '__main__':
    os.makedirs(WORK, exist_ok=True)
    os.chdir(WORK)
    skip = '--skip-dump' in sys.argv
    if not skip: dump()
    build()
    if not skip: dump_art()
    export_art()
    export()
