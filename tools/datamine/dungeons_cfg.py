# internal name -> (slug, level-info key, main level dir, enemy level dir, extra level dirs holding map boxes)
A = 'dump/all/'
D = A + 'Content__dungeons__'
P = A + 'adv__'
DUNGEONS = {
    'FrozenKingdom': ('cithrels-fall', D + 'FrozenKingdom__FrozenKingdom', D + 'FrozenKingdom__Sublevels__FrozenKingdom_Enemies'),
    'DemonicRitual': ('the-heart-of-tuzari', D + 'DemonicRitual__DemonicRitual', D + 'DemonicRitual__Sublevels__DemonicRitual_Enemies'),
    'PirateRaid': ('wraithtide-vault', D + 'PirateRaid__PirateRaid', D + 'PirateRaid__Sublevels__Dungeon6_Enemies'),
    'VikingVillageAttack': ('ransack-of-drakheim', D + 'VikingVillageAttack__VikingVillageAttack', D + 'VikingVillageAttack__Sublevels__VikingVillageAttack_Enemies'),
    'IceCave': ('wyrmheart', D + 'IceCave__IceCave', D + 'IceCave__Sublevels__IceCave_Enemies'),
    'NightPatrol': ('stormwatch', D + 'NightPatrol__NightPatrol', D + 'NightPatrol__Sublevels__NightPatrol_Enemies'),
    'ShipGraveyard': ('sailors-abyss', D + 'ShipGraveyard__ShipGraveyard', D + 'ShipGraveyard__Sublevels__ShipGraveyard_Enemies'),
    'DesertDunes': ('empyrean-sands', D + 'DesertDunes__DesertDunes', D + 'DesertDunes__Sublevels__DesertDunes_Enemies'),
    'UrrakMarkets': ('urrak-markets', D + 'UrrakMarkets__UrrakMarkets', D + 'UrrakMarkets__Sublevels__UrrakMarkets_Enemies'),
    'MythicForest': ('everdawn-grove', D + 'MythicForest__MythicForest', D + 'MythicForest__MythicForest_Enemies'),
    'ElfMines': ('godfall-quarry', D + 'ElfMines__ElfMines', D + 'ElfMines__Sublevels__ElfMines_Enemies'),
    'SpiderForest': ('silken-hollow', D + 'SpiderForest__SpiderForest', D + 'SpiderForest__Sublevels__SpiderForest_Enemies'),
    'MoorCastle': ('ruins-of-regath', P + 'MoorCastle__Levels__MoorCastle', P + 'MoorCastle__Levels__MoorCastle_Enemies'),
    'SandTomb': ('xul-the-blood-monolith', P + 'SandTomb__Levels__SandTomb_Environment', P + 'SandTomb__Levels__SandTomb_Enemies'),
    'SnowPeak': ('scryers-peak', P + 'SnowPeak__Levels__SnowPeak', P + 'SnowPeak__Levels__SnowPeak_Enemies'),
}


def _use_live_layouts():
    """Swap in the enemy layout each main level always loads (see levels.streamed_enemy_level)."""
    import os
    from levels import streamed_enemy_level
    for key, (slug, main, enem) in list(DUNGEONS.items()):
        if not os.path.exists(f'{main}/exports.tsv'): continue
        live = streamed_enemy_level(main)
        if live and live != enem and os.path.exists(f'{live}/exports.tsv'):
            DUNGEONS[key] = (slug, main, live)


_use_live_layouts()

# Required kill score from DT_LevelInfo / LI_<adventure>
REQUIRED = {'FrozenKingdom': 188, 'DemonicRitual': 238, 'PirateRaid': 281, 'VikingVillageAttack': 260,
            'IceCave': 109, 'NightPatrol': 155, 'ShipGraveyard': 131, 'DesertDunes': 130, 'UrrakMarkets': 160,
            'MythicForest': 110, 'ElfMines': 130, 'SpiderForest': 168, 'MoorCastle': 155, 'SandTomb': 265, 'SnowPeak': 180}
LOC_KEY = {'VikingVillageAttack': 'Level_VikingVillageAttack_Name'}
CAPSTONE = {'FrozenKingdom', 'DemonicRitual', 'PirateRaid', 'VikingVillageAttack'}
ADVENTURE = {'MoorCastle', 'SandTomb', 'SnowPeak'}

def asset_path(game_path):
    """/Game/X/Y.Y or /Plugin/X/Y.Y -> package file path in the provider."""
    p = game_path.split('.')[0]
    if p.startswith('/Game/'): return 'fellowship/Content/' + p[6:] + '.uasset'
    plugin, rest = p[1:].split('/', 1)
    return f'fellowship/Plugins/GameFeatures/Adventures/{plugin}/Content/{rest}.uasset'
