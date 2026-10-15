# Fellowship datamining pipeline

Extracts dungeon map images, enemy spawn positions, enemy names, kill scores and
required scores from a local Fellowship install, and writes them into the site:

- `src/lib/data/game/<slug>.json` (one file per dungeon, loaded by `src/lib/data/dungeons.ts`)
- `static/maps/<slug>/<floor>.webp` (one image per map floor)

Run it again after a game patch to pick up changes.

## Setup (once)

1. Install a .NET 10 SDK.
2. Clone [CUE4Parse](https://github.com/FabianFG/CUE4Parse) (Apache-2.0) into `tools/datamine/.work/CUE4Parse`
   (submodules aren't needed), or pass `-p:CUE4ParseDir=<path>` to the build.
3. Build the extractor:

   ```sh
   CUE4PARSE_SKIP_NATIVE=1 dotnet build tools/datamine/extractor/extractor.csproj -c Release
   ```

   On first run, CUE4Parse downloads the Oodle decompression DLL next to the executable.

## Run

```sh
cd tools/datamine
FELLOWSHIP_PAKS="F:\SteamLibrary\steamapps\common\Fellowship\fellowship\Content\Paks" python run.py
```

`--skip-dump` reuses existing dumps in `.work/` and only rebuilds the JSON and images.

Then fetch key levels, timers and the health curve from the Fellowship Codex (another datamine of
the game files, codex.frazl.tech) into `src/lib/data/game/levels.json`:

```sh
python codex.py
```
The script prints one line per dungeon (spawns, packs, available vs required score) so you can
spot anything that changed.

## How it works

The game is Unreal Engine 5 with IoStore containers (not encrypted, Oodle-compressed). Its
properties are stored *unversioned*, which normally needs a `.usmap` mappings file. We don't have
one, so the pipeline reads only what it can decode without one:

| Data | Where it comes from |
| --- | --- |
| Spawn positions | The enemy sublevel the main level always loads (`LevelStreamingAlwaysLoaded`; for dungeons that's `<Dungeon>_Enemies_Alternate_01.umap`, the older `_Enemies` layout is only streamed in by code): each `BP_NPC_*` actor's root capsule `RelativeLocation` (property index 123). The unversioned header is decoded in `uprops.py`. |
| Map floors | `BP_DungeonMapAreaBox` actors in the main level: the box component's extent, centre and scale give the world area covered by each minimap texture (map X = world Y, map Y = −world X). |
| Map images | `T_Map_*` textures (DXT1, top mip stored inline), decoded and converted to WebP in `tex2webp.mjs`. |
| Enemy names | Display name `FText` on each NPC blueprint's class-default object, or the `ST_NPCs` string-table row it references. |
| Kill score, health | `CT_CharacterBaseAttributes` curve table rows `<NpcId>.CRNpcAttributeSet.KillScore` / `.Custom.DefaultBaseHealthMultiplier`. |
| Elite / boss | `ActorTypeTags.Elite` / `ActorTypeTags.Boss` gameplay tags in the blueprint. |
| Dungeon names | `Level_<Name>_Name` in `Localization/Game/en/Game.locres`. |
| Required score | `DT_LevelInfo` (dungeons) and `LI_<Adventure>` (adventures). `run.py` warns if it differs from `dungeons_cfg.REQUIRED`. |
| Abilities | Names from the `DT_*AbilityData` tables; flags from each ability blueprint's tags. A cast or channel blocked by `CharacterStatus.Silenced` is kickable; otherwise only CC stops it. |
| Stun immunity | `GameplayCue.Shared.StunImmune` / `GameplayEffect.CCImmune` on the enemy blueprint (plus all bosses). Only the explicit cases are known, so some immune enemies may be missing. |
| Affixes | `DT_ModifierInfo` (name, description, icon) and `CT_DungeonModifiers` (Shadow Lord: 3 Emissaries per dungeon, 2 per adventure, 30 orbs each; Empowered ×3 score; mini-boss timer refunds). Mini-boss spawn points are `BP_DM_MiniBossSpawner` actors (`MiniBossType`: 0 Ghorn, 1 Krumbug, 2 Eira; `RemoveAddRadius`, default 2000, is the area it clears of enemies). Empowered enemies carry the `ActorTypeTags.DungeonModifiers.EmpoweredMinions.Selected` tag. Krumbug and Promoted Enemies are in the files but not the live rotation, so they aren't exported. |
| Patrols | `BP_PatrolPath` actors in the enemy level: the spline's Position points (`patrols.py`) and the list of NPCs that walk it. Many patrol NPCs are parked at the world origin in the level and moved to their path when spawned; they're placed at the start of their path. |
| Key levels, timers, health curve | Fetched from codex.frazl.tech by `codex.py` (not from our own dumps yet). Enemy health = base health (2999, or the boss's `BaseHealth`) × `DefaultBaseHealthMultiplier` × the level's health scaling; Empowered ×2; Promoted enemies use the next level's scaling. |
| Start / checkpoints | `BP_DungeonStartBarrier_Area` and `BP_RespawnPointInteractable` actors in the main level. |
| Relics | `DynamicHeroItems/Relic_*` (names, icons). Descriptions are written in `assets.py`. |
| Art | Enemy portraits (`UnitPortraits`), relic and affix icons, dungeon codex and loading-screen art. Pixel data comes from the export or its `.ubulk`. |

Packs are not stored in the game data, so they are built by grouping spawns within 9 m of each
other on the same floor (`PACK_RADIUS` in `build_data.py`). Each patrol's walkers form their own pack.

Spawn ids (`<slug>-<n>`) are stored in saved routes and share links, so `build_data.py` reuses the
ids of the previous export for unchanged spawns and gives new spawns fresh numbers.

## Not extracted yet

- Ability descriptions, damage and cast times (only names and interrupt/CC flags so far)
- Exact Shadow Orb drops per kill (the planner spreads the run's orbs in proportion to kill score, which is what `GetSpawnPercentage` appears to do)

## Debugging

`overlay.mjs <dungeon.json> <floorId> <map.webp> <out.png>` draws the spawns on a floor image,
for checking alignment.
