import levelData from './game/levels.json';
import modifierHealthData from './game/modifier-health.json';

// Key levels, timers and the difficulty health curve, fetched from the Fellowship Codex
// (codex.frazl.tech) by tools/datamine/codex.py.

export interface KeyLevel {
	level: number;
	/** Routing affixes active at this level (ids from affixes.json). */
	affixes: string[];
	/** Other modifiers at this level (keys of `levelModifiers`). */
	other: string[];
}

interface LevelData {
	source: { url: string; buildChangelist: string; dumpedAt: string };
	baseHealth: number;
	health: [number, number][];
	modifiers: Record<string, { name: string; description: string; type: string }>;
	dungeons: Record<string, { timer: number | null; listed: boolean; keyLevels: KeyLevel[] }>;
}

const data = levelData as unknown as LevelData;

export const levelSource = data.source;
/** Health of an enemy with multiplier 1 at difficulty level 1. */
export const BASE_HEALTH = data.baseHealth;
export const levelModifiers = data.modifiers;

const curve = new Map(data.health);
const maxLevel = Math.max(...curve.keys());

/** Enemy health multiplier at a difficulty level (1 when no level is chosen). */
export function healthScale(level: number | null | undefined): number {
	if (!level) return 1;
	return curve.get(Math.min(Math.max(1, Math.round(level)), maxLevel)) ?? 1;
}

/**
 * Promoted enemies fight at +1 difficulty, so their health is the next level's: the ratio of the
 * curve at level + 1 to level (×1.31 at level 1, smaller at high levels).
 */
export function promotedScale(level: number | null | undefined): number {
	const l = level || 1;
	return healthScale(l + 1) / healthScale(l);
}

export function keyLevels(slug: string): KeyLevel[] {
	return data.dungeons[slug]?.keyLevels ?? [];
}

export function keyLevel(slug: string, level: number | null | undefined): KeyLevel | undefined {
	return level ? keyLevels(slug).find((k) => k.level === level) : undefined;
}

export function timerFor(slug: string): number | null {
	return data.dungeons[slug]?.timer ?? null;
}

/** 1234 -> "1.2K", 2_400_000 -> "2.4M". */
export function fmtHealth(hp: number): string {
	if (hp >= 1e9) return `${(hp / 1e9).toFixed(hp >= 1e10 ? 0 : 1)}B`;
	if (hp >= 1e6) return `${(hp / 1e6).toFixed(hp >= 1e7 ? 0 : 1)}M`;
	if (hp >= 1e3) return `${(hp / 1e3).toFixed(hp >= 1e4 ? 0 : 1)}K`;
	return String(Math.round(hp));
}


/** Level modifiers that change enemy health: multiplier for non-boss enemies and for bosses. */
const modifierHealth = modifierHealthData as Record<string, { nonBoss?: number; boss?: number }>;

/** Health multipliers from a key level's modifiers (Stone Skin, Challenge, Ultimatum). */
export function levelHealthMods(slug: string, level: number | null | undefined) {
	let nonBoss = 1;
	let boss = 1;
	const active: { id: string; name: string; nonBoss?: number; boss?: number }[] = [];
	for (const m of keyLevel(slug, level)?.other ?? []) {
		const h = modifierHealth[m];
		if (!h) continue;
		nonBoss *= h.nonBoss ?? 1;
		boss *= h.boss ?? 1;
		active.push({ id: m, name: data.modifiers[m]?.name ?? m, ...h });
	}
	return { nonBoss, boss, active };
}

/** Modifiers that make big pulls riskier without changing health. */
export const PULL_SIZE_WARNINGS: Record<string, string> = {
	BloodShardVolley: 'Every enemy that dies hits all heroes for 0.7% of its max health: big pulls stack up damage.',
	StoneSkin: 'Dying enemies explode, leaving damage over time: spread kills out in big pulls.',
	MalevolentSpirits: 'A Malevolent Shade appears as you kill: enemies near it take 50% less damage.',
	Carnage: 'Damage taken bleeds the whole group: long, heavy pulls drain healers.'
};
