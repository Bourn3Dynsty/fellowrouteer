import type { Dungeon, Enemy, EnemyPosition, Patrol } from '$lib/types';
import { affixById, EMPOWERED_HEALTH, EMPOWERED_MULTIPLIER, SHADOW_ORBS_PER_EMISSARY, WINTER_BOSSES } from '$lib/data/affixes';
import { PULL_COLORS, uid, type Annotation, type RouteDoc, type RoutePull } from './model';
import { BASE_HEALTH, healthScale, keyLevel, levelHealthMods, promotedScale } from '$lib/data/levels';

const HISTORY_LIMIT = 200;

/** Route totals under one set of affixes. */
export interface RouteStats {
	pullScores: number[];
	/** Kill score earned by the end of each pull (before Shadow Lord banking). */
	cumulative: number[];
	total: number;
	/** What the in-game counter shows after each pull. Differs from cumulative only with Shadow Lord. */
	credited: number[];
	creditedTotal: number;
	/** Shadow Lord: orbs dropped by the end of each pull, Emissaries per run, and the pull each spawns in. */
	orbs: number[];
	orbsMax: number;
	emissaryMax: number;
	emissaryPulls: number[];
	/** Timer seconds gained from mini-bosses killed in the route. */
	timeBonus: number;
}

/** Reactive route editing state with undo/redo, shared by the planner components. */
export class RouteEditor {
	readonly dungeon: Dungeon;
	readonly enemyById: Map<string, Enemy>;
	readonly spawnById: Map<string, EnemyPosition>;
	readonly packMembers: Map<number, string[]>;
	/** spawn id -> the patrol it walks */
	readonly patrolOf: Map<string, Patrol>;
	readonly minibossSpawns: { affix: string; spawn: EnemyPosition; replaces: Set<string> }[];

	doc = $state<RouteDoc>() as RouteDoc;
	selectedPullId = $state<string | null>(null);
	/** Spawn ids to emphasise on the map (hovering a pull or enemy type). */
	highlight = $state<Set<string> | null>(null);
	/** Highlight pinned from the enemy list; shown when nothing is hovered. */
	pinned = $state<Set<string> | null>(null);
	activeHighlight = $derived(this.highlight ?? this.pinned);

	#past: string[] = [];
	#future: string[] = [];
	canUndo = $state(false);
	canRedo = $state(false);
	/** Bumped on every change so listeners (autosave) can react. */
	revision = $state(0);

	constructor(dungeon: Dungeon, doc: RouteDoc) {
		this.dungeon = dungeon;
		this.doc = doc;
		this.enemyById = new Map(dungeon.enemies.map((e) => [e.id, e]));
		this.spawnById = new Map(dungeon.enemyPositions.map((s) => [s.id, s]));
		// Affix mini-bosses become pullable map targets with their own kill score and timer refund.
		this.minibossSpawns = dungeon.minibosses
			.filter((m) => affixById[m.affix])
			.map((m) => {
				const info = affixById[m.affix];
				const enemyId = `mb-${m.affix}`;
				this.enemyById.set(enemyId, {
					id: enemyId, name: info.name, score: info.killScore ?? 0, type: 'miniboss', icon: info.portrait,
					healthMultiplier: info.healthMultiplier,
					stunnable: false, stunImmune: true, abilities: []
				});
				const spawn: EnemyPosition = { id: `${dungeon.slug}-mb-${m.affix}`, enemyId, floor: m.floor, x: m.x, y: m.y };
				this.spawnById.set(spawn.id, spawn);
				return { affix: m.affix, spawn, replaces: new Set(m.replaces ?? []) };
			});
		this.patrolOf = new Map(dungeon.patrols.flatMap((p) => p.spawns.map((s) => [s, p] as const)));
		this.packMembers = new Map();
		for (const s of dungeon.enemyPositions) {
			if (s.pack == null) continue;
			const list = this.packMembers.get(s.pack) ?? [];
			list.push(s.id);
			this.packMembers.set(s.pack, list);
		}
	}

	// --- derived state -------------------------------------------------------

	chickens = $derived(new Set(this.doc.chickens));
	/** Active affixes (ids no longer in the game, e.g. from old routes, are ignored). */
	affixes = $derived(new Set((this.doc.affixes ?? []).filter((a) => affixById[a])));
	/** Mini-boss spawns for active affixes. */
	activeMinibosses = $derived.by(() => this.minibossSpawns.filter((m) => this.affixes.has(m.affix)).map((m) => m.spawn));
	/** Spawns cleared by the active mini-boss. */
	removed = $derived(this.#removedFor(this.affixes));

	/** spawn id -> index of the pull that contains it */
	owner = $derived.by(() => {
		const map = new Map<string, number>();
		this.doc.pulls.forEach((p, i) => p.spawns.forEach((s) => map.set(s, i)));
		return map;
	});

	/** Totals under the active affixes. */
	stats = $derived(this.evaluate(this.affixes));
	pullScores = $derived(this.stats.pullScores);
	/** Running total after each pull. */
	cumulative = $derived(this.stats.cumulative);
	total = $derived(this.stats.total);
	/** Percentage shown by the in-game counter. */
	get percent() {
		return this.pct(this.stats.creditedTotal);
	}
	timeBonus = $derived(this.stats.timeBonus);
	emissaries = $derived(this.stats.emissaryPulls.length);

	selectedPull = $derived(this.doc.pulls.find((p) => p.id === this.selectedPullId) ?? null);
	selectedIndex = $derived(this.doc.pulls.findIndex((p) => p.id === this.selectedPullId));

	enemyOf(spawnId: string): Enemy | undefined {
		const s = this.spawnById.get(spawnId);
		return s ? this.enemyById.get(s.enemyId) : undefined;
	}

	spawnScore(spawnId: string, affixes: Set<string> = this.affixes): number {
		if (this.chickens.has(spawnId)) return 0;
		const spawn = this.spawnById.get(spawnId);
		const enemy = spawn && this.enemyById.get(spawn.enemyId);
		if (!spawn || !enemy) return 0;
		if (enemy.type === 'miniboss') return affixes.has(enemy.id.slice(3)) ? enemy.score : 0;
		if (affixes === this.affixes ? this.removed.has(spawnId) : this.#removedFor(affixes).has(spawnId)) return 0;
		return affixes.has('empowered') && spawn.empowered ? enemy.score * EMPOWERED_MULTIPLIER : enemy.score;
	}

	isEmpowered(spawnId: string): boolean {
		return this.affixes.has('empowered') && !!this.spawnById.get(spawnId)?.empowered;
	}

	/** Cleared from the map by the active mini-boss. */
	isRemoved(spawnId: string): boolean {
		return this.removed.has(spawnId);
	}

	#removedCache = new Map<string, Set<string>>();
	#removedFor(affixes: Set<string>): Set<string> {
		const boss = WINTER_BOSSES.find((b) => affixes.has(b)) ?? '';
		let set = this.#removedCache.get(boss);
		if (!set) {
			set = new Set(this.minibossSpawns.find((m) => m.affix === boss)?.replaces ?? []);
			this.#removedCache.set(boss, set);
		}
		return set;
	}

	/**
	 * Score the route under a set of affixes.
	 *
	 * Shadow Lord's Trial (from the game's GA_DungeonModifiers_ShadowLord_OrbSpawner and
	 * CT_DungeonModifiers): kills drop Shadow Orbs in proportion to their share of the required
	 * score, so the run's orbs (Emissaries × 30) arrive evenly up to 100%. Every 30 orbs summon an
	 * Emissary, and killing it pays out the score banked so far. We assume each Emissary dies in the
	 * pull it spawns in.
	 */
	evaluate(affixes: Set<string>): RouteStats {
		const required = this.dungeon.requiredScore;
		const pullScores = this.doc.pulls.map((p) => {
			let t = 0;
			for (const id of p.spawns) t += this.spawnScore(id, affixes);
			return t;
		});
		let sum = 0;
		const cumulative = pullScores.map((s) => (sum += s));
		const shadow = affixes.has('shadow-lord');
		const info = affixById['shadow-lord'];
		const emissaryMax = shadow ? (this.dungeon.type === 'adventure' ? info?.emissaries?.adventure : info?.emissaries?.dungeon) ?? 3 : 0;
		const orbsMax = emissaryMax * SHADOW_ORBS_PER_EMISSARY;
		const orbs: number[] = [];
		const credited: number[] = [];
		const emissaryPulls: number[] = [];
		let banked = 0;
		cumulative.forEach((c, i) => {
			if (!shadow) {
				credited.push(c);
				orbs.push(0);
				return;
			}
			const dropped = Math.min(orbsMax, Math.floor((c / required) * orbsMax + 1e-9));
			orbs.push(dropped);
			const summoned = Math.floor(dropped / SHADOW_ORBS_PER_EMISSARY);
			while (emissaryPulls.length < summoned) emissaryPulls.push(i);
			if (emissaryPulls[emissaryPulls.length - 1] === i) banked = c;
			// Once every Emissary has been summoned there's nothing left to bank into.
			credited.push(emissaryPulls.length >= emissaryMax ? c : banked);
		});
		let timeBonus = 0;
		for (const m of this.minibossSpawns) {
			if (affixes.has(m.affix) && this.owner.has(m.spawn.id)) timeBonus += affixById[m.affix]?.timeBonus ?? 0;
		}
		return {
			pullScores, cumulative, total: sum, credited, creditedTotal: credited[credited.length - 1] ?? 0,
			orbs, orbsMax, emissaryMax, emissaryPulls, timeBonus
		};
	}

	/** Key level the route is planned for, if any. */
	level = $derived(this.doc.level ?? null);
	/** Enemy health multiplier for the key level (1 with no level). */
	levelScale = $derived(healthScale(this.level));
	/** Health changes from the level's modifiers (Stone Skin, Challenge, Ultimatum). */
	healthMods = $derived(levelHealthMods(this.doc.dungeon, this.level));

	/** Health of one enemy of this type at the route's key level, before Empowered / Promoted. */
	enemyHealth(enemy: Enemy): number {
		const mod = enemy.type === 'boss' ? this.healthMods.boss : enemy.type === 'trash' ? this.healthMods.nonBoss : 1;
		return (enemy.baseHealth ?? BASE_HEALTH) * (enemy.healthMultiplier ?? 1) * this.levelScale * mod;
	}

	/**
	 * Health of a spawn at the route's key level: base health (2999, or the boss's own) ×
	 * the enemy's multiplier × the level's health scaling × the level's health modifiers (Stone Skin,
	 * Challenge for non-bosses; Ultimatum for bosses), doubled for Empowered Minions and one level
	 * higher for Promoted enemies. Chickenized and cleared spawns count as 0.
	 */
	spawnHealth(spawnId: string): number {
		if (this.chickens.has(spawnId) || this.removed.has(spawnId)) return 0;
		const spawn = this.spawnById.get(spawnId);
		const enemy = spawn && this.enemyById.get(spawn.enemyId);
		if (!spawn || !enemy) return 0;
		let hp = this.enemyHealth(enemy);
		if (this.isEmpowered(spawnId)) hp *= EMPOWERED_HEALTH;
		if (spawn.promoted) hp *= promotedScale(this.level);
		return hp;
	}

	/** Shadow Lord Emissary health at the route's key level. */
	get emissaryHealth() {
		return BASE_HEALTH * (affixById['shadow-lord']?.emissaryHealthMultiplier ?? 1) * this.levelScale;
	}

	healthOf(spawnIds: Iterable<string>): number {
		let t = 0;
		for (const id of spawnIds) t += this.spawnHealth(id);
		return t;
	}

	/** Kill score available on the map under the active affixes. */
	available = $derived.by(() => {
		let t = 0;
		for (const s of this.dungeon.enemyPositions) t += this.spawnScore(s.id);
		for (const s of this.activeMinibosses) t += this.spawnScore(s.id);
		return t;
	});

	/** Interrupt / CC summary for a set of spawns. */
	ccSummary(spawnIds: string[]) {
		const kicks = new Map<string, number>();
		const stuns = new Map<string, number>();
		let immune = 0;
		for (const id of spawnIds) {
			if (this.chickens.has(id)) continue;
			const e = this.enemyOf(id);
			if (!e) continue;
			if (e.stunImmune && e.type !== 'boss' && e.type !== 'miniboss') immune++;
			for (const a of e.abilities) {
				if (a.interruptible) kicks.set(a.name, (kicks.get(a.name) ?? 0) + 1);
				else if (a.ccOnly) stuns.set(a.name, (stuns.get(a.name) ?? 0) + 1);
			}
		}
		return { kicks: [...kicks], stuns: [...stuns], immune };
	}

	scoreOf(spawnIds: Iterable<string>): number {
		let t = 0;
		for (const id of spawnIds) t += this.spawnScore(id);
		return t;
	}

	pct(score: number): number {
		return (score / this.dungeon.requiredScore) * 100;
	}

	packOf(spawnId: string): string[] {
		const pack = this.spawnById.get(spawnId)?.pack;
		const members = pack == null ? [spawnId] : (this.packMembers.get(pack) ?? [spawnId]);
		return this.removed.size ? members.filter((id) => id === spawnId || !this.removed.has(id)) : members;
	}

	// --- history ---------------------------------------------------------------

	#snapshot() {
		return JSON.stringify($state.snapshot(this.doc));
	}

	/** Apply a change as one undoable step. */
	change(fn: (doc: RouteDoc) => void) {
		this.#past.push(this.#snapshot());
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		fn(this.doc);
		this.doc.updatedAt = Date.now();
		this.remoteChange = false;
		this.#afterChange();
	}

	undo() {
		const prev = this.#past.pop();
		if (!prev) return;
		this.#future.push(this.#snapshot());
		this.doc = JSON.parse(prev);
		this.remoteChange = false;
		this.#afterChange();
	}

	redo() {
		const next = this.#future.pop();
		if (!next) return;
		this.#past.push(this.#snapshot());
		this.doc = JSON.parse(next);
		this.remoteChange = false;
		this.#afterChange();
	}

	/** True when the latest revision came from a live-session teammate. */
	remoteChange = false;

	/** Apply a teammate's version of the route. Undo still steps back through your own edits. */
	applyRemote(doc: RouteDoc) {
		this.#past.push(this.#snapshot());
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.doc = doc;
		this.remoteChange = true;
		this.#afterChange();
	}

	/** Replace the whole document (switching routes); clears history. */
	load(doc: RouteDoc) {
		this.doc = this.#dropUnknownSpawns(doc);
		this.#past = [];
		this.#future = [];
		this.selectedPullId = null;
		this.#afterChange();
	}

	/**
	 * Routes saved against an older version of the game data can reference spawns that no longer
	 * exist (e.g. after the enemy layout changed). Drop them, and any pulls left empty by that.
	 */
	#dropUnknownSpawns(doc: RouteDoc): RouteDoc {
		const known = (id: string) => this.spawnById.has(id);
		if (doc.pulls.every((p) => p.spawns.every(known)) && doc.chickens.every(known)) return doc;
		return {
			...doc,
			pulls: doc.pulls
				.map((p) => ({ ...p, spawns: p.spawns.filter(known) }))
				.filter((p) => p.spawns.length || p.note),
			chickens: doc.chickens.filter(known)
		};
	}

	#afterChange() {
		this.canUndo = this.#past.length > 0;
		this.canRedo = this.#future.length > 0;
		if (this.selectedPullId && !this.doc.pulls.some((p) => p.id === this.selectedPullId)) {
			this.selectedPullId = null;
		}
		this.revision++;
	}

	// --- pulls -----------------------------------------------------------------

	#nextColor(): string {
		const used = this.doc.pulls.map((p) => p.color);
		const last = used[used.length - 1];
		const start = last ? (PULL_COLORS.indexOf(last) + 1) % PULL_COLORS.length : 0;
		return PULL_COLORS[start];
	}

	/** Insert a new empty pull after the selected one (or at the end) and select it. */
	addPull(): RoutePull {
		// The selected pull is still empty: keep using it rather than stacking empty pulls.
		if (this.selectedPull && !this.selectedPull.spawns.length) return this.selectedPull;
		const pull: RoutePull = { id: uid(), color: this.#nextColor(), spawns: [] };
		this.change((doc) => {
			const at = this.selectedIndex >= 0 ? this.selectedIndex + 1 : doc.pulls.length;
			doc.pulls.splice(at, 0, pull);
		});
		this.selectedPullId = pull.id;
		return pull;
	}

	deletePull(id: string) {
		const i = this.doc.pulls.findIndex((p) => p.id === id);
		if (i < 0) return;
		this.change((doc) => doc.pulls.splice(i, 1));
		const next = this.doc.pulls[Math.min(i, this.doc.pulls.length - 1)];
		this.selectedPullId = next?.id ?? null;
	}

	movePull(from: number, to: number) {
		if (from === to || from < 0 || to < 0) return;
		this.change((doc) => {
			const [p] = doc.pulls.splice(from, 1);
			doc.pulls.splice(to, 0, p);
		});
	}

	setPullNote(id: string, note: string) {
		this.change((doc) => {
			const p = doc.pulls.find((x) => x.id === id);
			if (p) p.note = note.trim() || undefined;
		});
	}

	setPullColor(id: string, color: string) {
		this.change((doc) => {
			const p = doc.pulls.find((x) => x.id === id);
			if (p) p.color = color;
		});
	}

	selectRelative(delta: number) {
		const n = this.doc.pulls.length;
		if (!n) return;
		const i = this.selectedIndex < 0 ? (delta > 0 ? -1 : n) : this.selectedIndex;
		this.selectedPullId = this.doc.pulls[Math.max(0, Math.min(n - 1, i + delta))].id;
	}

	/**
	 * Toggle spawns in the selected pull: if all are already in it they're removed,
	 * otherwise they move into it (out of any other pull). Starts a pull if none is selected.
	 */
	toggleSpawns(ids: string[], mode: 'toggle' | 'add' = 'toggle') {
		if (!ids.length) return;
		let target = this.selectedPull;
		const creating = !target;
		const newPull: RoutePull | null = creating ? { id: uid(), color: this.#nextColor(), spawns: [] } : null;
		this.change((doc) => {
			if (newPull) doc.pulls.push(newPull);
			const pull = newPull ? doc.pulls[doc.pulls.length - 1] : doc.pulls.find((p) => p.id === target!.id)!;
			const allIn = ids.every((id) => pull.spawns.includes(id));
			const remove = mode === 'toggle' && allIn;
			for (const p of doc.pulls) p.spawns = p.spawns.filter((s) => !ids.includes(s));
			if (!remove) pull.spawns.push(...ids);
		});
		if (newPull) this.selectedPullId = newPull.id;
	}

	/** Append several pulls in one undoable step (e.g. a suggested route). Drops an empty last pull. */
	appendPulls(groups: string[][]) {
		const groupsLeft = groups.filter((g) => g.length);
		if (!groupsLeft.length) return;
		const added: RoutePull[] = [];
		this.change((doc) => {
			const lastPull = doc.pulls.at(-1);
			if (lastPull && !lastPull.spawns.length && !lastPull.note) doc.pulls.pop();
			const taken = new Set(doc.pulls.flatMap((p) => p.spawns));
			for (const g of groupsLeft) {
				const pull: RoutePull = { id: uid(), color: '', spawns: g.filter((id) => !taken.has(id)) };
				if (!pull.spawns.length) continue;
				const used = doc.pulls.map((p) => p.color);
				const prev = used[used.length - 1];
				pull.color = PULL_COLORS[prev ? (PULL_COLORS.indexOf(prev) + 1) % PULL_COLORS.length : 0];
				doc.pulls.push(pull);
				added.push(pull);
			}
		});
		this.selectedPullId = added.at(-1)?.id ?? this.selectedPullId;
	}

	/** Start a new pull containing these spawns. */
	newPullWith(ids: string[]) {
		this.selectedPullId = null;
		this.toggleSpawns(ids, 'add');
	}

	removeSpawns(ids: string[]) {
		this.change((doc) => {
			for (const p of doc.pulls) p.spawns = p.spawns.filter((s) => !ids.includes(s));
		});
	}

	toggleChicken(spawnId: string) {
		this.change((doc) => {
			const i = doc.chickens.indexOf(spawnId);
			if (i >= 0) doc.chickens.splice(i, 1);
			else doc.chickens.push(spawnId);
		});
	}

	// --- annotations -------------------------------------------------------------

	addAnnotation(a: Annotation) {
		this.change((doc) => doc.annotations.push(a));
	}

	updateNote(id: string, text: string) {
		this.change((doc) => {
			const a = doc.annotations.find((x) => x.id === id);
			if (a?.kind === 'note') a.text = text;
		});
	}

	removeAnnotation(id: string) {
		this.change((doc) => {
			doc.annotations = doc.annotations.filter((a) => a.id !== id);
		});
	}

	clear() {
		this.change((doc) => {
			doc.pulls = [];
			doc.chickens = [];
			doc.annotations = [];
		});
		this.selectedPullId = null;
	}

	toggleAffix(id: string) {
		this.change((doc) => {
			const list = doc.affixes ?? (doc.affixes = []);
			const i = list.indexOf(id);
			if (i >= 0) list.splice(i, 1);
			else {
				// Only one mini-boss appears per run.
				if (WINTER_BOSSES.includes(id)) doc.affixes = list.filter((a) => !WINTER_BOSSES.includes(a));
				doc.affixes!.push(id);
			}
		});
	}

	/** Plan for a key level: switches on exactly that level's routing affixes. */
	setLevel(level: number | null) {
		const kl = keyLevel(this.dungeon.slug, level);
		this.change((doc) => {
			if (level) doc.level = level;
			else delete doc.level;
			if (kl) doc.affixes = [...kl.affixes];
		});
	}

	/** Pick the run's mini-boss (or none). */
	setWinterBoss(id: string | null) {
		this.change((doc) => {
			doc.affixes = (doc.affixes ?? []).filter((a) => !WINTER_BOSSES.includes(a));
			if (id) doc.affixes.push(id);
		});
	}

	rename(name: string) {
		this.change((doc) => (doc.name = name.trim() || doc.name));
	}
}
