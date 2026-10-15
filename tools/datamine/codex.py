"""Fetch key levels, timers and enemy health scaling from the Fellowship Codex (codex.frazl.tech).

The codex is another datamine of the game files. It has the per-dungeon key level ladder (which
affixes are active at each level), the timers and the difficulty health curve, which our own
pipeline doesn't extract yet. Writes src/lib/data/game/levels.json.

    python codex.py
"""
import json, os, re, sys, urllib.request

BASE = 'https://codex.frazl.tech/data'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'lib', 'data', 'game', 'levels.json')

# Codex modifier row -> our affix id (affixes that change routing)
ROUTING = {'EmpoweredMinions': 'empowered', 'ShadowLord': 'shadow-lord', 'WinterGiant': 'ghorn', 'WinterWitch': 'eira'}
# Not shown as level affixes: Promoted is a fixed capstone trait we flag per spawn.
HIDDEN = {'PromotedEnemies'}


def get(path):
    req = urllib.request.Request(f'{BASE}/{path}', headers={"User-Agent": "fellowroute-datamine"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    index = get('index.json')
    mods = {m['tag']: m for m in index['modifiers']}
    ours = {f[:-5] for f in os.listdir(os.path.dirname(OUT)) if f.endswith('.json') and f not in ('levels.json', 'relics.json', 'affixes.json', 'modifier-health.json')}
    dungeons = {}
    for d in index['dungeons']:
        if d['id'] not in ours: continue
        full = get(f"dungeons/{d['id']}.json")
        levels = []
        for k in full.get('keyLevels', []):
            routing, other = [], []
            for tag in k['modifiers']:
                row = mods.get(tag, {}).get('row') or tag.split('.')[-1]
                if row in HIDDEN: continue
                (routing if row in ROUTING else other).append(ROUTING.get(row, row))
            levels.append({'level': k['level'], 'affixes': routing, 'other': other})
        dungeons[d['id']] = {'timer': d['timerSeconds'], 'listed': d['listed'], 'mobCount': d['mobCount'], 'keyLevels': levels}
        print(f"{d['id']:24} timer={d['timerSeconds']} levels={len(levels)} mobs={d['mobCount']}")
    other_info = {}
    for m in index['modifiers']:
        if m['type'] == 'Dungeon' and m['row'] not in ROUTING and m['row'] not in HIDDEN or m['type'] == 'Ascension':
            text = re.sub(r'<[^>]*>', '', m['description']).split('\r\n')[0]
            other_info[m['row']] = {'name': m['name'], 'description': text, 'type': m['type']}
    out = {
        'source': {'url': 'https://codex.frazl.tech/', **{k: index['version'][k] for k in ('buildChangelist', 'dumpedAt')}},
        'baseHealth': index['defaults']['BaseHealth'],
        'health': [[int(l), m] for l, m in index['scaling']['health']],
        'modifiers': other_info,
        'dungeons': dungeons,
    }
    json.dump(out, open(OUT, 'w', encoding='utf-8'), indent='\t', ensure_ascii=False)
    print(f'wrote {os.path.normpath(OUT)} ({len(dungeons)} dungeons, build {out["source"]["buildChangelist"]})')


if __name__ == '__main__':
    sys.exit(main())
