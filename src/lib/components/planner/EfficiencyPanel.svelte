<script lang="ts">
	import type { RouteEditor } from '$lib/route/editor.svelte';
	import { efficiencySettings as eff, packStats, ratingClass, fmtTime, cheapestRoute, type PackStats } from '$lib/route/efficiency.svelte';
	import { keyLevels, keyLevel, healthScale, fmtHealth, levelModifiers, PULL_SIZE_WARNINGS } from '$lib/data/levels';
	import { affixById } from '$lib/data/affixes';
	import { onMount, untrack } from 'svelte';

	interface Props {
		editor: RouteEditor;
		/** Show these spawns on the map (switches floor if needed). */
		onFocus?: (spawnIds: string[]) => void;
	}

	let { editor, onFocus }: Props = $props();
	const dungeon = untrack(() => editor.dungeon);
	const levels = keyLevels(dungeon.slug);
	const multiFloor = dungeon.floors.length > 1;
	const floorLabel = (id: string) => dungeon.floors.find((f) => f.id === id)?.label ?? id;

	onMount(() => eff.init());

	let showSettings = $state(false);
	let showSuggestion = $state(false);
	let all = $derived(packStats(editor, eff.s));
	let list = $derived.by(() => {
		const rows = eff.s.hidePulled ? all.filter((p) => p.owner === undefined && !p.spawns.some((id) => editor.owner.has(id))) : all;
		const key = eff.s.sort;
		return [...rows].sort((a, b) =>
			key === 'score' ? b.score - a.score : key === 'perHp' ? b.perHp - a.perHp : key === 'time' ? (a.time ?? a.hp) - (b.time ?? b.hp) : b.rating - a.rating
		);
	});

	// Whole route at this level: health of everything pulled and the kill time at the set DPS.
	let routeHp = $derived(editor.doc.pulls.reduce((t, p) => t + editor.healthOf(p.spawns), 0));
	let timer = $derived(dungeon.timeLimit ? dungeon.timeLimit + editor.timeBonus : 0);
	let suggestion = $derived(cheapestRoute(editor, all));
	let suggestionIds = $derived(new Set(suggestion.packs.flatMap((p) => p.spawns)));

	function showSuggested() {
		showSuggestion = !showSuggestion;
		editor.pinned = showSuggestion ? new Set(suggestionIds) : null;
		if (showSuggestion && suggestion.packs.length) onFocus?.(suggestion.packs[0].spawns);
	}

	function addSuggested() {
		editor.appendPulls(suggestion.packs.map((p) => p.spawns));
		showSuggestion = false;
		editor.pinned = null;
	}

	let warnings = $derived((keyLevel(dungeon.slug, editor.level)?.other ?? []).filter((m) => PULL_SIZE_WARNINGS[m]));
	const pctMod = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;

	function chips(p: PackStats) {
		const m = new Map<string, { icon?: string; name: string; n: number }>();
		for (const id of p.spawns) {
			const e = editor.enemyOf(id);
			if (!e) continue;
			const g = m.get(e.id) ?? { icon: e.icon, name: e.name, n: 0 };
			g.n++;
			m.set(e.id, g);
		}
		return [...m.values()].sort((a, b) => b.n - a.n);
	}

	function add(p: PackStats) {
		editor.toggleSpawns(p.spawns, 'add');
		onFocus?.(p.spawns);
	}

	function num(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		return Number.isFinite(v) && v >= 0 ? v : 0;
	}
</script>

<div class="eff">
	<div class="controls">
		{#if levels.length}
			<label class="row">
				<span>Key level</span>
				<select value={editor.level ?? ''} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; editor.setLevel(v ? Number(v) : null); }}>
					<option value="">Any (level 1 health)</option>
					{#each levels as k (k.level)}
						<option value={k.level}>{k.level}{k.affixes.length ? ` · ${k.affixes.map((a) => affixById[a]?.name.split(' ')[0]).join(', ')}` : ''}</option>
					{/each}
				</select>
			</label>
		{/if}
		<label class="row">
			<span title="Your group's combined damage per second, to estimate kill times">Group DPS</span>
			<input type="number" min="0" step="1000" placeholder="e.g. 250000" value={eff.s.groupDps || ''} oninput={(e) => eff.set('groupDps', num(e))} />
		</label>

		{#if editor.healthMods.active.length || warnings.length}
			<div class="mods">
				{#each editor.healthMods.active as m (m.id)}
					<span class="mod hp" title={levelModifiers[m.id]?.description}>{m.name}: {m.nonBoss ? `${pctMod(m.nonBoss)} enemy HP` : ''}{m.boss ? `${pctMod(m.boss)} boss HP` : ''}</span>
				{/each}
				{#each warnings as w (w)}
					<span class="mod warn" title={PULL_SIZE_WARNINGS[w]}>⚠ {levelModifiers[w]?.name ?? w}</span>
				{/each}
			</div>
		{/if}
		<div class="summary">
			{#if editor.level}<span>Level {editor.level} · health ×{healthScale(editor.level).toFixed(2)}{#if editor.healthMods.nonBoss !== 1} ×{editor.healthMods.nonBoss.toFixed(2)} affixes{/if}</span>{/if}
			{#if routeHp}
				<span>Route health <b>{fmtHealth(routeHp)}</b></span>
				{#if eff.s.groupDps}
					{@const t = routeHp / eff.s.groupDps}
					<span class:over={timer && t > timer}>Kill time <b>{fmtTime(t)}</b>{#if timer} of {fmtTime(timer)} ({Math.round((t / timer) * 100)}%){/if}</span>
				{/if}
			{/if}
		</div>

		{#if editor.pct(suggestion.base) < 100}
			<div class="suggest">
				<div class="s-head">
					<span class="s-title">Cheapest way to 100%</span>
					{#if suggestion.reachable}
						<span class="s-pct">{editor.pct(suggestion.base + suggestion.score).toFixed(1)}%</span>
					{/if}
				</div>
				{#if suggestion.reachable}
					<div class="s-body">
						{suggestion.packs.length} more pack{suggestion.packs.length === 1 ? '' : 's'} · {fmtHealth(suggestion.hp)} HP{#if eff.s.groupDps} · ~{fmtTime(suggestion.hp / eff.s.groupDps)} kill time{/if}
						{#if editor.pct(suggestion.base) > 0}<span class="muted"> (on top of {editor.pct(suggestion.base).toFixed(1)}% from bosses and your pulls)</span>{/if}
					</div>
					<div class="s-actions">
						<button class="btn small" class:on={showSuggestion} onclick={showSuggested}>{showSuggestion ? 'Hide' : 'Show on map'}</button>
						<button class="btn small primary" onclick={addSuggested} title="Add these packs as pulls, nearest first (undo with Ctrl+Z)">Add as pulls</button>
					</div>
				{:else}
					<div class="s-body muted">Not enough kill score left on the map with these affixes.</div>
				{/if}
			</div>
		{/if}

		<div class="row tools">
			<select value={eff.s.sort} onchange={(e) => eff.set('sort', (e.currentTarget as HTMLSelectElement).value as typeof eff.s.sort)} aria-label="Sort packs">
				<option value="rating">Best overall</option>
				<option value="perHp">Score per HP</option>
				<option value="score">Most score</option>
				<option value="time">Fastest kill</option>
			</select>
			<label class="check"><input type="checkbox" checked={eff.s.hidePulled} onchange={() => eff.set('hidePulled', !eff.s.hidePulled)} /> Hide pulled</label>
			<button class="link" onclick={() => (showSettings = !showSettings)} aria-expanded={showSettings}>Weights</button>
		</div>

		{#if showSettings}
			<div class="weights">
				<p>Extra cost each adds to a pack, as % of its health. Raise these if your group struggles with casters.</p>
				<label><span class="dot k"></span>Kickable caster <input type="number" min="0" max="100" value={eff.s.kickCost} oninput={(e) => eff.set('kickCost', num(e))} />%</label>
				<label><span class="dot s"></span>Stun-only cast <input type="number" min="0" max="100" value={eff.s.stunCost} oninput={(e) => eff.set('stunCost', num(e))} />%</label>
				<label><span class="dot i"></span>Stun immune <input type="number" min="0" max="100" value={eff.s.immuneCost} oninput={(e) => eff.set('immuneCost', num(e))} />%</label>
				<button class="link" onclick={() => eff.reset()}>Reset</button>
			</div>
		{/if}
	</div>

	<div class="list" role="list">
		{#each list as p, i (p.pack)}
			<div
				class="pack"
				class:pulled={p.owner !== undefined}
				class:suggested={showSuggestion && suggestionIds.has(p.spawns[0])}
				role="listitem"
				onmouseenter={() => (editor.highlight = new Set(p.spawns))}
				onmouseleave={() => (editor.highlight = null)}
			>
				<span class="rank">{i + 1}</span>
				<button class="main" onclick={() => onFocus?.(p.spawns)} title="Show on the map">
					<span class="mobs">
						{#each chips(p) as c (c.name)}
							<span class="chip" title="{c.n}× {c.name}">
								{#if c.icon}<img src={c.icon} alt={c.name} />{/if}
								{#if c.n > 1}<span class="n">{c.n}</span>{/if}
							</span>
						{/each}
					</span>
					<span class="meta">
						<span><b>{p.score}</b> score · {editor.pct(p.score).toFixed(1)}%</span>
						<span>{fmtHealth(p.hp)} HP{#if p.time !== null} · {fmtTime(p.time)}{/if}</span>
					</span>
					<span class="tags">
						{#if p.kicks}<span class="t k" title="Enemies with a kickable cast">{p.kicks} kick</span>{/if}
						{#if p.stuns}<span class="t s" title="Casts only a stun stops">{p.stuns} stun</span>{/if}
						{#if p.immune}<span class="t i" title="Stun immune enemies">{p.immune} immune</span>{/if}
						{#if p.patrol}<span class="t p">patrol</span>{/if}
						{#if multiFloor}<span class="t f">{floorLabel(p.floor)}</span>{/if}
					</span>
				</button>
				<span class="rating {ratingClass(p.rating)}" title="Overall: {p.rating.toFixed(2)}× the average pack (score per HP {p.perHp.toFixed(2)}×, interrupt load +{Math.round((p.load - 1) * 100)}%)">{p.rating.toFixed(2)}×</span>
				<button class="add" onclick={() => add(p)} title={editor.selectedPull ? 'Add to the selected pull' : 'Start a pull with this pack'}>+</button>
			</div>
		{:else}
			<p class="empty">Every pack is already in a pull.</p>
		{/each}
	</div>
</div>

<style>
	.eff {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.row > span {
		font-weight: 600;
	}

	select,
	input[type='number'] {
		padding: 3px 6px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--panel);
		color: var(--text);
		font: inherit;
		font-size: 0.76rem;
	}

	.row select,
	.row input[type='number'] {
		width: 170px;
	}

	.tools select {
		width: auto;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}

	.check input {
		accent-color: var(--gold);
		margin: 0;
	}

	.link {
		border: none;
		background: none;
		color: var(--gold);
		font-size: 0.74rem;
		cursor: pointer;
		padding: 0;
	}

	.mods {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.mod {
		padding: 1px 6px;
		border-radius: 999px;
		font-size: 0.68rem;
		cursor: help;
	}

	.mod.hp {
		background: rgba(239, 68, 68, 0.13);
		color: #fca5a5;
	}

	.mod.warn {
		background: rgba(245, 158, 11, 0.13);
		color: #fcd34d;
	}

	.suggest {
		padding: 8px 10px;
		border: 1px solid rgba(217, 173, 91, 0.3);
		border-radius: 8px;
		background: rgba(217, 173, 91, 0.06);
	}

	.s-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.s-title {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--gold-bright);
	}

	.s-pct {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--success);
	}

	.s-body {
		margin: 3px 0 6px;
		font-size: 0.72rem;
		color: var(--text);
	}

	.muted {
		color: var(--text-faint);
	}

	.s-actions {
		display: flex;
		gap: 6px;
	}

	.s-actions .btn {
		height: 26px;
		padding: 0 10px;
		font-size: 0.72rem;
	}

	.s-actions .btn.on {
		border-color: var(--gold-dim);
		color: var(--gold-bright);
	}

	.pack.suggested {
		background: rgba(217, 173, 91, 0.08);
		box-shadow: inset 2px 0 0 var(--gold);
	}

	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.summary:empty {
		display: none;
	}

	.summary b {
		color: var(--text);
	}

	.summary .over b {
		color: #fca5a5;
	}

	.weights {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		border-radius: 8px;
		background: var(--panel);
		font-size: 0.74rem;
	}

	.weights p {
		margin: 0 0 4px;
		color: var(--text-faint);
		line-height: 1.35;
	}

	.weights label {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.weights input {
		width: 56px;
		margin-left: auto;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot.k {
		background: #3b82f6;
	}

	.dot.s {
		background: #f59e0b;
	}

	.dot.i {
		background: #b45309;
	}

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 6px 8px 12px;
	}

	.pack {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 4px;
		border-radius: 8px;
	}

	.pack:hover {
		background: var(--panel-hover);
	}

	.pack.pulled {
		opacity: 0.55;
	}

	.rank {
		width: 18px;
		flex: none;
		text-align: right;
		font-size: 0.68rem;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border: none;
		background: none;
		text-align: left;
		color: inherit;
		cursor: pointer;
		padding: 0;
	}

	.mobs {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.chip {
		position: relative;
		width: 24px;
		height: 24px;
	}

	.chip img {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid var(--border-strong);
	}

	.chip .n {
		position: absolute;
		right: -4px;
		bottom: -3px;
		min-width: 13px;
		padding: 0 2px;
		border-radius: 7px;
		background: #0b0e14;
		font-size: 0.6rem;
		font-weight: 700;
		text-align: center;
		line-height: 13px;
	}

	.meta {
		display: flex;
		gap: 8px;
		font-size: 0.7rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.meta b {
		color: var(--text);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.t {
		padding: 0 5px;
		border-radius: 4px;
		font-size: 0.62rem;
		line-height: 1.5;
	}

	.t.k {
		background: rgba(59, 130, 246, 0.16);
		color: #93c5fd;
	}

	.t.s {
		background: rgba(245, 158, 11, 0.14);
		color: #fcd34d;
	}

	.t.i {
		background: rgba(180, 83, 9, 0.2);
		color: #fdba74;
	}

	.t.p,
	.t.f {
		background: rgba(148, 163, 184, 0.12);
		color: var(--text-muted);
	}

	.rating {
		flex: none;
		padding: 2px 6px;
		border-radius: 6px;
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.rating.good {
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
	}

	.rating.avg {
		background: rgba(148, 163, 184, 0.14);
		color: #cbd5e1;
	}

	.rating.poor {
		background: rgba(239, 68, 68, 0.14);
		color: #fca5a5;
	}

	.add {
		flex: none;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--panel);
		color: var(--text);
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}

	.add:hover {
		border-color: var(--gold-dim);
		color: var(--gold-bright);
	}

	.empty {
		padding: 16px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--text-faint);
	}
</style>
