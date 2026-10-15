import type { RouteEditor } from './editor.svelte';

/**
 * Pack efficiency: kill score against what a pack costs to kill.
 *
 * Cost is the pack's health at the route's key level (Empowered and Promoted included), raised by
 * a percentage for each kickable caster, stun-only cast and stun-immune enemy, since those make a
 * pull slower or riskier. Ratings are relative to the average pack in the dungeon (1.0 = average).
 * With a group DPS set, kill time is estimated as health ÷ DPS.
 */

const KEY = 'fellowroute.efficiency.v1';

export interface EfficiencySettings {
	/** Extra cost per kickable caster, in percent. */
	kickCost: number;
	/** Extra cost per cast that only a stun stops, in percent. */
	stunCost: number;
	/** Extra cost per stun-immune enemy, in percent. */
	immuneCost: number;
	/** Group damage per second; 0 = don't estimate times. */
	groupDps: number;
	hidePulled: boolean;
	sort: 'rating' | 'perHp' | 'score' | 'time';
}

const DEFAULTS: EfficiencySettings = {
	kickCost: 10,
	stunCost: 5,
	immuneCost: 10,
	groupDps: 0,
	hidePulled: true,
	sort: 'rating'
};

class Settings {
	s = $state<EfficiencySettings>({ ...DEFAULTS });
	#loaded = false;

	init() {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			this.s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
		} catch {
			// keep defaults
		}
	}

	set<K extends keyof EfficiencySettings>(key: K, value: EfficiencySettings[K]) {
		this.s[key] = value;
		try {
			localStorage.setItem(KEY, JSON.stringify(this.s));
		} catch {
			// not persisted
		}
	}

	reset() {
		this.s = { ...DEFAULTS };
		try {
			localStorage.removeItem(KEY);
		} catch {
			// ignore
		}
	}
}

export const efficiencySettings = new Settings();

export interface PackStats {
	pack: number;
	floor: string;
	spawns: string[];
	score: number;
	hp: number;
	/** Kickable casters / stun-only casts / stun-immune enemies / elites in the pack. */
	kicks: number;
	stuns: number;
	immune: number;
	elites: number;
	patrol: boolean;
	/** Cost multiplier from the interrupt load (1 = none). */
	load: number;
	/** Score per health, relative to the dungeon's average pack. */
	perHp: number;
	/** Score per effective cost (health × load), relative to the dungeon's average pack. */
	rating: number;
	/** Seconds to kill at the set group DPS, or null. */
	time: number | null;
	/** Pull index that already contains the whole pack, if any. */
	owner: number | undefined;
}

/** Interrupt load and counts for some spawns. */
function loadOf(editor: RouteEditor, spawns: string[], s: EfficiencySettings) {
	const enemies = spawns.map((id) => editor.enemyOf(id)).filter((e) => !!e);
	const kicks = enemies.filter((e) => e.abilities.some((a) => a.interruptible)).length;
	const stuns = enemies.reduce((t, e) => t + e.abilities.filter((a) => a.ccOnly).length, 0);
	const immune = enemies.filter((e) => e.stunImmune && e.type !== 'boss').length;
	const load = 1 + (kicks * s.kickCost + stuns * s.stunCost + immune * s.immuneCost) / 100;
	return { enemies, kicks, stuns, immune, load };
}

/**
 * Rating of any set of spawns (e.g. a pull) on the same scale as the pack list: score per
 * effective cost relative to the dungeon's average pack. Bosses are left out. Null if empty.
 */
export function ratingOf(editor: RouteEditor, spawnIds: string[], s: EfficiencySettings, avg: number): number | null {
	const spawns = spawnIds.filter((id) => editor.enemyOf(id)?.type !== 'boss');
	const hp = editor.healthOf(spawns);
	const score = editor.scoreOf(spawns);
	if (!hp || !score || !avg) return null;
	return score / (hp * loadOf(editor, spawns, s).load) / avg;
}

/** Score per effective cost of the average pack, the 1.0 of every rating. */
export function averageCost(packs: PackStats[]): number {
	const t = packs.reduce((a, p) => ({ score: a.score + p.score, cost: a.cost + p.hp * p.load }), { score: 0, cost: 0 });
	return t.cost ? t.score / t.cost : 0;
}

/** Stats for every pack that's on the map under the route's affixes (bosses excluded). */
export function packStats(editor: RouteEditor, s: EfficiencySettings): PackStats[] {
	const raw: Omit<PackStats, 'perHp' | 'rating'>[] = [];
	for (const [pack, members] of editor.packMembers) {
		const spawns = members.filter((id) => !editor.isRemoved(id) && !editor.chickens.has(id));
		if (!spawns.length) continue;
		const { enemies, kicks, stuns, immune, load } = loadOf(editor, spawns, s);
		if (enemies.some((e) => e.type === 'boss')) continue;
		const score = editor.scoreOf(spawns);
		const hp = editor.healthOf(spawns);
		if (!score || !hp) continue;
		const owners = new Set(spawns.map((id) => editor.owner.get(id)));
		raw.push({
			pack,
			floor: editor.spawnById.get(spawns[0])?.floor ?? editor.dungeon.floors[0]?.id ?? 'f1',
			spawns,
			score,
			hp,
			kicks,
			stuns,
			immune,
			elites: enemies.filter((e) => e.elite).length,
			patrol: spawns.some((id) => editor.patrolOf.has(id)),
			load,
			time: s.groupDps > 0 ? hp / s.groupDps : null,
			owner: owners.size === 1 ? [...owners][0] : undefined
		});
	}
	// Averages weighted by health, i.e. the dungeon's total score over total cost.
	const total = raw.reduce((a, p) => ({ score: a.score + p.score, hp: a.hp + p.hp, cost: a.cost + p.hp * p.load }), { score: 0, hp: 0, cost: 0 });
	const perHpAvg = total.score / total.hp;
	const ratingAvg = total.score / total.cost;
	return raw.map((p) => ({ ...p, perHp: p.score / p.hp / perHpAvg, rating: p.score / (p.hp * p.load) / ratingAvg }));
}

/** Pack list and average for an editor, recomputed when the route or settings change. */
export function createRatings(editor: RouteEditor) {
	const packs = $derived(packStats(editor, efficiencySettings.s));
	const avg = $derived(averageCost(packs));
	return {
		get packs() {
			return packs;
		},
		get avg() {
			return avg;
		},
		of: (spawnIds: string[]) => ratingOf(editor, spawnIds, efficiencySettings.s, avg)
	};
}

export function ratingClass(r: number) {
	return r >= 1.15 ? 'good' : r <= 0.85 ? 'poor' : 'avg';
}

/** Green (efficient) to red for a relative rating. */
export function ratingColor(r: number) {
	const t = Math.max(0, Math.min(1, (r - 0.6) / 0.8)); // 0.6 -> red, 1.4 -> green
	const hue = Math.round(t * 125);
	return `hsl(${hue} 75% 50%)`;
}

export function fmtTime(sec: number) {
	const t = Math.round(sec);
	if (t < 60) return `${t}s`;
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export interface Suggestion {
	/** Packs to add, in a suggested pull order. */
	packs: PackStats[];
	score: number;
	hp: number;
	/** Kill score already counted before these packs: bosses plus what's pulled. */
	base: number;
	required: number;
	/** Reachable with the packs on the map? */
	reachable: boolean;
}

/**
 * Cheapest set of unpulled packs that reaches the required kill score: take packs by rating (score
 * per effective cost) until the requirement is met, then drop the costliest packs that aren't
 * needed. Bosses are assumed killed and count toward the score. Pull order is a nearest-neighbour
 * walk from the last pull (or the dungeon start), finishing each floor before moving on.
 */
export function cheapestRoute(editor: RouteEditor, packs: PackStats[]): Suggestion {
	const required = editor.dungeon.requiredScore;
	const pulled = new Set(editor.owner.keys());
	let base = editor.total;
	for (const s of editor.dungeon.enemyPositions) {
		if (pulled.has(s.id)) continue;
		if (editor.enemyOf(s.id)?.type === 'boss') base += editor.spawnScore(s.id);
	}
	const open = packs.filter((p) => !p.spawns.some((id) => pulled.has(id)));
	const need = required - base;
	const byRating = [...open].sort((a, b) => b.rating - a.rating);
	const chosen: PackStats[] = [];
	let score = 0;
	for (const p of byRating) {
		if (score >= need) break;
		chosen.push(p);
		score += p.score;
	}
	// Drop packs we don't need, costliest first.
	for (const p of [...chosen].sort((a, b) => b.hp * b.load - a.hp * a.load)) {
		if (score - p.score >= need) {
			chosen.splice(chosen.indexOf(p), 1);
			score -= p.score;
		}
	}
	return {
		packs: order(editor, chosen),
		score,
		hp: chosen.reduce((t, p) => t + p.hp, 0),
		base,
		required,
		reachable: score >= need
	};
}

function center(editor: RouteEditor, p: PackStats) {
	const pts = p.spawns.map((id) => editor.spawnById.get(id)!).filter(Boolean);
	return { x: pts.reduce((t, s) => t + s.x, 0) / pts.length, y: pts.reduce((t, s) => t + s.y, 0) / pts.length };
}

function order(editor: RouteEditor, chosen: PackStats[]): PackStats[] {
	const floors = editor.dungeon.floors.map((f) => f.id);
	const last = editor.doc.pulls.at(-1)?.spawns.map((id) => editor.spawnById.get(id)).find(Boolean);
	let at = last ? { x: last.x, y: last.y, floor: last.floor ?? floors[0] } : editor.dungeon.start ?? { x: 0.5, y: 0.5, floor: floors[0] };
	const left = [...chosen];
	const out: PackStats[] = [];
	while (left.length) {
		const here = left.filter((p) => p.floor === at.floor);
		const pool = here.length ? here : left.filter((p) => p.floor === floors.find((f) => left.some((q) => q.floor === f)));
		let best = pool[0];
		let bestD = Infinity;
		for (const p of pool) {
			const c = center(editor, p);
			const d = Math.hypot(c.x - at.x, c.y - at.y);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		out.push(best);
		left.splice(left.indexOf(best), 1);
		at = { ...center(editor, best), floor: best.floor };
	}
	return out;
}
