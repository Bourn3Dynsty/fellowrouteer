"""Collect and dump UI art: enemy portraits, relic icons and dungeon artwork.

Run from the work dir (run.py does this). Produces dump/art/<name>/ (texture export + bulk.bin)
and returns the asset plan used by export_assets().
"""
import json, os, re, subprocess

# Relic items that matter for routing, keyed by the DynamicHeroItems asset.
RELICS = {
    'Relic_B_Expertise_GroupInvisibility': ('stealth', 'Major Invisibility for nearby allies for 15s. Out of combat only: sneak past packs.'),
    'Relic_C_Crit_Spirit_Polymorph': ('chicken', 'Chickenize! turns an enemy into a chicken. Charges are shared by the party; chickenized enemies give no kill score.'),
    'Relic_B_Crit_Portal': ('portal', 'Conjures two linked portals the party can travel between. One active portal at a time.'),
    'Relic_A_Spirit_Movespeed': ('drums', 'Increases party movement speed.'),
    'Relic_C_Expertise_Spirit_Battleres': ('battle-res', 'Resurrects a dead ally in combat.'),
    'Relic_C_Spirit_Crit_Dispell': ('dispel', 'Dispels magic effects from the party.'),
    'Relic_C_Expertise_Interupt_HealerSpecific': ('interrupt', 'Interrupts the target and locks out casting for 4s (healers).'),
    'Relic_B_Haste_DamageReductionOther': ('dr-party', 'Reduces damage taken by an ally.'),
    # Relic_B_Haste_DamageReductionTank (Obsidian Sigil) is left out: its icon isn't shipped, so it isn't live.
    'Relic_A_Haste_HealthPotion': ('health-potion', 'Recover health.'),
    'Relic_A_Expertise_ManaPotion': ('mana-potion', 'Instantly restore 30% of your maximum mana.'),
}

# Dungeon art per internal level name: (codex card art, loading screen)
DUNGEON_ART = {
    'FrozenKingdom': ('/Game/ui/icons/DungeonCodex/Codex_CapDungeon_FK', '/Game/ui/icons/Loadingscreens/LoadingScreen_FK'),
    'DemonicRitual': ('/Game/ui/icons/DungeonCodex/Codex_CapDungeon_DR', '/Game/ui/icons/Loadingscreens/T_Loadingscreen_DR_01'),
    'PirateRaid': ('/Game/ui/icons/DungeonCodex/Codex_CapDungeon_PR', '/Game/ui/icons/Loadingscreens/LoadingScreen_PR'),
    'VikingVillageAttack': ('/Game/ui/icons/DungeonCodex/Codex_CapDungeon_VV', '/Game/ui/icons/Loadingscreens/LoadingScreen_VV_01'),
    'DesertDunes': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_DD', '/Game/ui/icons/Loadingscreens/LoadingScreen_Desertdunes'),
    'ElfMines': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_EM', '/Game/ui/icons/Loadingscreens/Loadingscreen_EM'),
    'IceCave': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_IC', '/Game/ui/icons/Loadingscreens/LoadingScreen_IC_01'),
    'MythicForest': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_MF', '/Game/ui/icons/Loadingscreens/Loadingscreen_MF_01'),
    'NightPatrol': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_NP', '/Game/ui/icons/Loadingscreens/T_Loadingscreen_NP'),
    'ShipGraveyard': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_SG', '/Game/ui/icons/Loadingscreens/LoadingScreen_SG'),
    'SpiderForest': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_SH', '/Game/ui/icons/Loadingscreens/LoadingScreen_SF_01'),
    'UrrakMarkets': ('/Game/ui/icons/DungeonCodex/Codex_Dungeon_UM', '/Game/ui/icons/Loadingscreens/LoadingScreen_UM_01'),
    'MoorCastle': ('/MoorCastle/UI/MoorCastle/Codex_Dungeon_MC', '/MoorCastle/UI/MoorCastle/LoadingScreen_MC'),
    'SandTomb': ('/SandTomb/UI/Codex_PinnacleDungeon_ST', '/SandTomb/UI/LoadingScreen_ST'),
    'SnowPeak': ('/SnowPeak/UI/Codex_Dungeon_SP', '/SnowPeak/UI/LoadingScreen_SP'),
}


def enemy_portrait(classes):
    """Portrait texture path imported by any of an enemy's blueprint classes."""
    for c in classes:
        t = f'dump/npc/{c}/imports.tsv'
        if not os.path.exists(t): continue
        for line in open(t, encoding='utf-8'):
            path = line.rstrip('\n').split('\t')[1]
            if '/UnitPortraits/' in path: return path.split('.')[0]
    return None


def relic_icon(asset):
    names = f'dump/relic/{asset}/names.txt'
    if not os.path.exists(names): return None, None
    lines = [l.rstrip('\n') for l in open(names, encoding='utf-8')]
    icon = next((l for l in lines if l.startswith('/Game/ui/icons/')), None)
    return icon, None


def relic_name(asset):
    b = open(f'dump/relic/{asset}/0.bin', 'rb').read()
    m = re.search(rb'[0-9A-F]{32}\x00(.{4})', b, re.S)
    if not m: return None
    n = int.from_bytes(m.group(1), 'little', signed=True)
    if n < 0:  # FString stored as UTF-16
        return b[m.end():m.end() + (-n - 1) * 2].decode('utf-16-le', 'replace')
    return b[m.end():m.end() + n - 1].decode('utf-8', 'replace')


def plan(dungeon_jsons):
    """List of (game texture path, output kind, output key, max size)."""
    from dungeons_cfg import DUNGEONS
    items = []
    for f in dungeon_jsons:
        d = json.load(open(f, encoding='utf-8'))
        for e in d['enemies']:
            p = enemy_portrait(e['classes'])
            if p: items.append((p, 'enemy', e['id'], 128))
    for asset, (key, _) in RELICS.items():
        icon, _ = relic_icon(asset)
        if icon: items.append((icon, 'relic', key, 128))
    import affixes
    for leaf, info in affixes.modifier_info().items():
        key = affixes.AFFIXES[leaf][0]
        if info['icon']: items.append((info['icon'].split('.')[0], 'affix', key, 128))
    for key, npc in affixes.MINIBOSS_NPC.items():
        p = enemy_portrait([npc])
        if p: items.append((p, 'miniboss', key, 128))
    for internal, (codex, loading) in DUNGEON_ART.items():
        slug = DUNGEONS[internal][0]
        items.append((codex, 'codex', slug, 640))
        items.append((loading, 'banner', slug, 1600))
    # One entry per (kind, key); the same texture may serve several keys. Some referenced icons
    # aren't shipped with the game, so skip anything not in the container.
    files = set(f.lower() for f in open('files.txt', encoding='utf-8').read().splitlines())
    from dungeons_cfg import asset_path
    seen, out = set(), []
    for it in items:
        if asset_path(it[0]).lower() not in files: continue
        if (it[1], it[2]) in seen: continue
        seen.add((it[1], it[2])); out.append(it)
    return out


def art_dir(game_path):
    return 'dump/art/' + game_path.split('/')[-1]


def package_path(game_path, files_lower):
    """Game path -> exact (case-correct) .uasset path in the container."""
    from dungeons_cfg import asset_path
    p = asset_path(game_path)
    return files_lower.get(p.lower(), p)
