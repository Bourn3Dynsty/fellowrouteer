# Fellowroute

A route planner for Fellowship dungeons, built on the real in-game maps with every enemy spawn,
kill score, ability and affix extracted from the game files.

## Features

**Planning**
- All 15 dungeons, capstones and adventures, with every floor's in-game map
- Enemy portraits on the map, grouped into packs; click a pack to add it to a pull,
  Ctrl+click for a single enemy, Shift+drag to box-select
- Running kill score per pull and overall, with a marker when the requirement is met
- Drag to reorder pulls, per-pull notes and colours, unlimited undo/redo
- Dungeon start and respawn checkpoints marked on the map
- Patrol paths with their direction, highlighted when you hover a patroller or select its pull
- **Layers** menu on the map: show or hide patrol paths (`L`), kick/stun badges (`C`), pack outlines,
  pull numbers, drawings, notes, start & checkpoints, teammates' cursors, efficiency ratings and the
  per-pull kick row, or fade enemies already pulled. Remembered per browser.
- **Efficiency tab**: every pack ranked for the chosen key level by kill score against its cost
  (real HP at that level, with Empowered and Promoted, plus adjustable extra cost per kickable
  caster, stun-only cast and stun-immune enemy). Sort by overall, score per HP, most score or
  fastest kill; enter your group DPS for kill times and the whole route's kill time against the
  timer; + adds a pack to the selected pull. The same rating shows on pulls and map tooltips, and
  a map layer colours unpulled packs green (efficient) to red.
- **Cheapest way to 100%**: for the chosen level and affixes, the set of unpulled packs that reaches
  the required kill score for the least health and interrupt load, with its HP and kill time. Show
  it on the map or add it as pulls (nearest pack next, floor by floor) in one undoable step.

**Interrupts and crowd control**
- Kick badges on enemies with an interruptible cast, stun-immune badges, toggled with `C`
- Each pull lists its kicks, stun-only casts and stun-immune enemies, so the group can assign
  interrupts per pull
- Enemy list with filters for kickable and stun-immune enemies; click to pin them on the map

**Key levels and health**
- Pick the key level you're planning for: its affixes switch on and the level's other modifiers are
  listed. Enemy, pack and pull health show real HP at that level (Empowered ×2, Promoted at +1 level).
- Timers for every dungeon
- Health also includes the level's health affixes: Stone Skin (+30% non-boss), Challenge (+10%
  non-boss) and Ultimatum (+10% bosses). Affixes that punish big pulls (Blood Shards, Stone Skin
  explosions, Malevolent Shade, Carnage) are flagged in the Efficiency tab.
- **Patrol simulation** (Layers): play patrols along their paths over time, scrub to any moment,
  1×/2×/4× playback. Walking speed is adjustable since it isn't in the extracted data.

**Affixes** (the live rotation)
- A counter per affix: the route's % on a normal week, with Empowered, with Shadow Lord, and with
  Ghorn or Eira, next to toggles for this week's affixes. The main counter combines the active ones.
- Empowered Minions: the game's chosen enemies, ×3 kill score
- Shadow Lord's Trial: orbs per pull and where each Emissary spawns and banks the held score
- Ghorn the Avalanche and Eira the White Witch: at their spawn points with their kill score and timer
  refund; the enemies they replace are removed from the map and the route

**Relics and annotations**
- Chickenize enemies (Ancient Poultry Fetish: no kill score)
- Stealth paths (Orb of Shadows), linked portals (Humming Portalstone), arrows, freehand drawing
  and map notes

**Sharing**
- Routes save automatically in the browser; several named routes per dungeon
- Compact share links and route strings
- Copy a text summary of the pulls (enemies, %, kicks, Emissaries, notes) with the link for Discord
- **Live sessions:** plan together in real time, with everyone's cursors and the pull they're on

Press `?` in the planner for every shortcut.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (live sessions work in dev too)
npm run build
npm start          # production server on PORT (default 3000), including live sessions
```

The site uses `@sveltejs/adapter-node`. Live sessions need the Node server in `server/index.js`
(or `npm run preview`), because they run over a WebSocket at `/ws/session`. Sessions are held in
memory, so a restart ends them; the route stays saved in each player's browser.

## Deploying (Google Cloud Run)

```bash
PROJECT=<gcp-project-id> deploy/cloudrun.sh
```

The script builds the `Dockerfile` with Cloud Build and deploys it to Cloud Run. It scales to
zero, so a quiet beta costs close to nothing. It runs at most one instance, because live-session
rooms are held in memory and every player in a room has to reach the same instance. `.gcloudignore`
keeps the datamining work files (about 1 GB) out of the upload.

## Game data

Maps, enemies, abilities, affixes and relics are generated from a local install of the game by
`tools/datamine` (see `tools/datamine/README.md`). Re-run it after a game patch. The output lives
in `src/lib/data/game/*.json` and `static/maps`, `static/icons` and `static/art`.

## Project layout

```
src/lib/route/        route document, editor (undo/redo, scoring), storage, share encoding
src/lib/session/      live-session client
src/lib/components/   planner UI: map, pull list, side panel
src/routes/           home, planner, saved routes
server/               production server and live-session relay
tools/datamine/       game data extraction pipeline
```

Fellowroute is a fan project and isn't affiliated with Chief Rebel.
