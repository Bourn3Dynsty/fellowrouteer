import type { Ability, Dungeon, Enemy, EnemyPosition, MapFloor, MapPoint, MinibossSpawn, Patrol } from '../types';
import { timerFor } from './levels';

// Generated from the game files by tools/datamine (see tools/datamine/README.md).
interface GameDungeon {
	id: string;
	slug: string;
	name: string;
	kind: 'dungeon' | 'capstone' | 'adventure';
	requiredScore: number;
	floors: MapFloor[];
	art?: { codex?: string; banner?: string };
	enemies: {
		id: string;
		name: string;
		score: number;
		type: Enemy['type'];
		elite?: boolean;
		healthMultiplier?: number;
		baseHealth?: number;
		gameId?: string;
		icon?: string;
		stunImmune?: boolean;
		abilities?: Ability[];
	}[];
	spawns: EnemyPosition[];
	start?: MapPoint;
	checkpoints?: MapPoint[];
	minibosses?: MinibossSpawn[];
	patrols?: Patrol[];
}

const files = import.meta.glob<GameDungeon>('./game/*.json', { eager: true, import: 'default' });

// Timers come from the codex (levels.json); these guide values are only a fallback.
const TIME_LIMITS: Record<string, number> = {
	stormwatch: 900,
	'empyrean-sands': 720,
	'sailors-abyss': 717,
	wyrmheart: 806,
	'godfall-quarry': 738,
	'everdawn-grove': 720,
	'silken-hollow': 720,
	'urrak-markets': 780
};

function toDungeon(g: GameDungeon): Dungeon {
	return {
		id: g.id,
		name: g.name,
		slug: g.slug,
		type: g.kind,
		requiredScore: g.requiredScore,
		timeLimit: Math.round(timerFor(g.slug) ?? TIME_LIMITS[g.slug] ?? 0),
		floors: g.floors.map(({ id, label, image, worldSize }) => ({ id, label, image, worldSize })),
		art: g.art,
		enemies: g.enemies.map((e) => ({
			id: e.id,
			name: e.name,
			score: e.score,
			type: e.type,
			elite: e.elite,
			healthMultiplier: e.healthMultiplier,
			baseHealth: e.baseHealth,
			gameId: e.gameId,
			icon: e.icon,
			stunImmune: e.stunImmune,
			stunnable: !e.stunImmune,
			abilities: e.abilities ?? []
		})),
		enemyPositions: g.spawns,
		start: g.start,
		checkpoints: g.checkpoints ?? [],
		minibosses: g.minibosses ?? [],
		patrols: g.patrols ?? [],
		bosses: g.enemies
			.filter((e) => e.type === 'boss')
			.map((e) => ({ name: e.name, enemyId: e.id }))
	};
}

const KIND_ORDER = { dungeon: 0, capstone: 1, adventure: 2 };

export const dungeonList: Dungeon[] = Object.values(files)
	.filter((g) => Array.isArray(g.floors)) // game/ also holds relics.json and affixes.json
	.map(toDungeon)
	.sort((a, b) => KIND_ORDER[a.type] - KIND_ORDER[b.type] || a.name.localeCompare(b.name));

export const dungeons: Record<string, Dungeon> = Object.fromEntries(
	dungeonList.map((d) => [d.slug, d])
);

export function getDungeon(slug: string): Dungeon | undefined {
	return dungeons[slug];
}
