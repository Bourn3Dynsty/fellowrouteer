export interface Ability {
	name: string;
	description?: string;
	/** Cast/channel that a kick (interrupt) stops. */
	interruptible?: boolean;
	/** Cast/channel that only crowd control (stun) stops. */
	ccOnly?: boolean;
	channel?: boolean;
	school?: string;
	dispellable?: boolean;
	priority?: 'low' | 'medium' | 'high';
	damageType?: 'physical' | 'magic' | 'shadow' | 'fire' | 'nature';
}

export interface Enemy {
	id: string;
	name: string;
	score: number;
	stunnable: boolean;
	ccImmune?: boolean;
	abilities: Ability[];
	notes?: string;
	type: 'trash' | 'miniboss' | 'boss';
	elite?: boolean;
	/** Health relative to a baseline enemy (from game data). */
	healthMultiplier?: number;
	/** Base health when the enemy overrides the default (bosses). */
	baseHealth?: number;
	/** Attribute row id in the game data, e.g. FK_ElfGuard. */
	gameId?: string;
	/** Portrait image URL. */
	icon?: string;
	/** Can't be stunned (from the game's immunity tags; bosses always). */
	stunImmune?: boolean;
}

/**
 * A single enemy instance placed on the dungeon map.
 * Coordinates are normalized (0..1) relative to the map image so they
 * survive swapping the image for a different resolution.
 */
export interface EnemyPosition {
	id: string;
	enemyId: string;
	x: number;
	y: number;
	/** Spawns sharing a pack number are pulled together on click. */
	pack?: number;
	/** Floor id for multi-floor dungeons; defaults to the first floor. */
	floor?: string;
	/** Picked by the Empowered Minions affix (triple kill score). */
	empowered?: boolean;
	/** Promoted enemy: +1 difficulty until the timer runs out (capstone dungeons, always on). */
	promoted?: boolean;
	patrolPath?: { x: number; y: number }[];
}

export type PullEfficiency = 'excellent' | 'good' | 'average' | 'poor';

export interface Pull {
	id: string;
	name: string;
	/** Enemy type ids in the pull (duplicates allowed), including those from map spawns. */
	enemies: string[];
	/** Map spawn ids assigned to this pull. */
	spawns?: string[];
	totalScore: number;
	notes?: string;
	color?: string;
	efficiency?: PullEfficiency;
}

export type Affix = 'eira' | 'ghorn' | 'empowered-minions' | 'none';

export interface RouteSettings {
	affix: Affix;
	difficulty: number;
}

export type RelicType = 'chicken' | 'stealth' | 'portal' | 'wardstone';

export interface Relic {
	id: string;
	type: RelicType;
	x: number;
	y: number;
	pullId?: string;
}

export interface Route {
	id: string;
	name: string;
	dungeonId: string;
	difficulty: number;
	pulls: Pull[];
	totalScore: number;
	author?: string;
	createdAt: Date;
	updatedAt: Date;
	relics?: {
		type: 'chicken' | 'stealth' | 'portal';
		pullId: string;
	}[];
}

export interface MapPoint {
	floor: string;
	x: number;
	y: number;
}

export interface MinibossSpawn extends MapPoint {
	affix: string;
	/** World units: enemies this close are removed when the mini-boss spawns. */
	radius?: number;
	/** Spawn ids removed by that. */
	replaces?: string[];
}

/** A patrol route and the spawns that walk it. Points are normalized map coordinates. */
export interface Patrol {
	id: string;
	floor: string;
	points: [number, number][];
	spawns: string[];
}

export interface MapFloor {
	id: string;
	label: string;
	image: string;
	/** World units (cm) covered by the image: [width, height]. */
	worldSize?: [number, number];
}

export interface Dungeon {
	id: string;
	name: string;
	slug: string;
	type: 'adventure' | 'dungeon' | 'capstone';
	requiredScore: number;
	/** Seconds; 0 when unknown. */
	timeLimit: number;
	floors: MapFloor[];
	art?: { codex?: string; banner?: string };
	/** Where the run starts. */
	start?: MapPoint;
	/** Respawn checkpoints. */
	checkpoints: MapPoint[];
	/** Where each affix mini-boss waits, and the spawns it clears when it appears. */
	minibosses: MinibossSpawn[];
	patrols: Patrol[];
	enemies: Enemy[];
	enemyPositions: EnemyPosition[];
	bosses: {
		name: string;
		enemyId: string;
	}[];
	mapDimensions?: {
		width: number;
		height: number;
	};
}

export interface RelicInfo {
	id: string;
	name: string;
	description: string;
	icon?: string;
}

export interface AffixInfo {
	id: string;
	kind: 'miniboss' | 'score' | 'enemies';
	name: string;
	description: string;
	icon?: string;
	/** Mini-boss portrait. */
	portrait?: string;
	/** Seconds added to the timer when the mini-boss is defeated. */
	timeBonus?: number;
	/** Mini-boss kill score. */
	killScore?: number;
	/** Shadow Lord: orbs needed per Emissary, and Emissaries per run. */
	orbsPerEmissary?: number;
	emissaries?: { dungeon: number; adventure: number };
	/** Empowered Minions: kill score and health multipliers. */
	scoreMultiplier?: number;
	healthMultiplier?: number;
	/** Shadow Lord: Emissary health multiplier. */
	emissaryHealthMultiplier?: number;
}
