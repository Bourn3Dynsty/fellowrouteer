<script lang="ts">
	import { untrack } from 'svelte';
	import type { RouteEditor, RouteStats } from '$lib/route/editor.svelte';
	import { affixById, WINTER_BOSSES } from '$lib/data/affixes';
	import { keyLevels, levelModifiers, healthScale, levelHealthMods } from '$lib/data/levels';

	let { editor }: { editor: RouteEditor } = $props();

	const dungeon = untrack(() => editor.dungeon);
	const empowered = dungeon.enemyPositions.some((s) => s.empowered) ? affixById.empowered : undefined;
	const shadow = affixById['shadow-lord'];
	const bosses = WINTER_BOSSES.filter((id) => dungeon.minibosses.some((m) => m.affix === id)).map((id) => affixById[id]);

	/** Route stats on a normal week plus the given affixes. */
	const preview = (...ids: string[]): RouteStats => editor.evaluate(new Set(ids));

	const pctOf = (st: RouteStats) => editor.pct(st.creditedTotal);
	const fmt = (v: number) => `${v.toFixed(1)}%`;

	// Each counter is the normal route plus that one affix; the top bar combines the active ones.
	let normal = $derived(preview());
	let empStats = $derived(empowered ? preview('empowered') : null);
	let shadowStats = $derived(shadow ? preview('shadow-lord') : null);
	let bossStats = $derived([null, ...bosses].map((b) => (b ? preview(b.id) : normal)));
	let activeBoss = $derived(bosses.find((b) => editor.affixes.has(b.id))?.id ?? null);
	let hasPulls = $derived(editor.doc.pulls.length > 0);

	const levels = keyLevels(dungeon.slug);
	let current = $derived(levels.find((k) => k.level === editor.level));
	/** The affix toggles no longer match the chosen level's affixes. */
	let custom = $derived(
		!!current &&
			(current.affixes.length !== editor.affixes.size || current.affixes.some((a) => !editor.affixes.has(a)))
	);
</script>

<div class="affixes">
	{#if levels.length}
		<div class="level-row">
			<label class="level">
				<span>Key level</span>
				<select
					value={editor.level ?? ''}
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						editor.setLevel(v ? Number(v) : null);
					}}
				>
					<option value="">Any</option>
					{#each levels as k (k.level)}
						<option value={k.level}>{k.level}{k.affixes.length ? ` · ${k.affixes.map((a) => affixById[a]?.name.split(' ')[0]).join(', ')}` : ''}</option>
					{/each}
				</select>
			</label>
			{#if editor.level}
				<span class="scale" title="Enemy health at this level relative to level 1">HP ×{healthScale(editor.level).toFixed(2)}</span>
			{/if}
		</div>
		{#if current}
			<div class="others">
				{#each current.other as m (m)}
					{@const info = levelModifiers[m]}
					{@const hp = levelHealthMods(dungeon.slug, editor.level).active.find((a) => a.id === m)}
					{#if info}<span class="other" class:asc={info.type === 'Ascension'} class:hp={!!hp} title={info.description}>{info.name}{#if hp} ♥{/if}</span>{/if}
				{/each}
				{#if custom}<span class="custom" title="You've changed the affix toggles from this level's set">custom affixes</span>{/if}
			</div>
		{/if}
	{/if}
	<div class="head">
		<span class="label">Affixes</span>
		{#if hasPulls}
			<span class="hint" title="Kill score % on a week with no affixes">Normal <b class:complete={pctOf(normal) >= 100}>{fmt(pctOf(normal))}</b></span>
		{:else}
			<span class="hint">Switch on this week's affixes</span>
		{/if}
	</div>

	{#if empowered && empStats}
		{@const on = editor.affixes.has('empowered')}
		<button class="row" class:on onclick={() => editor.toggleAffix('empowered')} title={empowered.description}>
			{#if empowered.icon}<img src={empowered.icon} alt="" />{/if}
			<span class="name">Empowered</span>
			{#if hasPulls}<span class="val" class:complete={pctOf(empStats) >= 100}>{fmt(pctOf(empStats))}</span>{/if}
			<span class="switch" class:on></span>
		</button>
	{/if}

	{#if shadow && shadowStats}
		{@const on = editor.affixes.has('shadow-lord')}
		<button class="row" class:on onclick={() => editor.toggleAffix('shadow-lord')} title={shadow.description}>
			{#if shadow.icon}<img src={shadow.icon} alt="" />{/if}
			<span class="name">Shadow Lord</span>
			{#if hasPulls}
				<span class="val shadow" class:complete={pctOf(shadowStats) >= 100}>
					{fmt(pctOf(shadowStats))}
					<small>{shadowStats.emissaryPulls.length}/{shadowStats.emissaryMax} emissaries</small>
				</span>
			{/if}
			<span class="switch" class:on></span>
		</button>
	{/if}

	{#if bosses.length}
		<div class="bosses" role="radiogroup" aria-label="Mini-boss">
			{#each [null, ...bosses] as b, i (b?.id ?? 'none')}
				{@const st = bossStats[i]}
				{@const on = (b?.id ?? null) === activeBoss}
				<button
					class="boss"
					class:on
					role="radio"
					aria-checked={on}
					onclick={() => editor.setWinterBoss(b?.id ?? null)}
					title={b ? `${b.description}\n\nKill score ${b.killScore} · clears nearby enemies when it spawns` : 'No mini-boss this week (same as the normal route)'}
				>
					{#if b?.icon}<img src={b.icon} alt="" />{/if}
					<span class="bname">{b ? b.name.split(' ')[0] : 'No boss'}</span>
					{#if hasPulls}<span class="bval" class:complete={pctOf(st) >= 100}>{fmt(pctOf(st))}</span>{/if}
					{#if b?.timeBonus}<span class="btime">+{b.timeBonus}s</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.affixes {
		padding: 8px 10px 10px;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.level-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px;
	}

	.level {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.level select {
		max-width: 190px;
		padding: 3px 6px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--panel);
		color: var(--text);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	.scale {
		font-size: 0.7rem;
		font-weight: 700;
		color: #fca5a5;
		font-variant-numeric: tabular-nums;
	}

	.others {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 2px 2px 4px;
	}

	.other,
	.custom {
		padding: 1px 6px;
		border-radius: 999px;
		font-size: 0.66rem;
		background: rgba(148, 163, 184, 0.12);
		color: var(--text-muted);
		cursor: help;
	}

	.other.hp {
		background: rgba(239, 68, 68, 0.12);
		color: #fca5a5;
	}

	.other.asc {
		background: rgba(217, 173, 91, 0.1);
		color: var(--gold);
	}

	.custom {
		background: rgba(239, 68, 68, 0.12);
		color: #fca5a5;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0 2px 2px;
	}

	.label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.hint {
		font-size: 0.7rem;
		color: var(--text-faint);
	}

	.hint b {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.hint b.complete {
		color: var(--success);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 5px 8px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: var(--panel);
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--panel-hover);
	}

	.row.on {
		border-color: rgba(217, 173, 91, 0.35);
		background: rgba(217, 173, 91, 0.07);
	}

	.row img {
		width: 22px;
		height: 22px;
		border-radius: 5px;
		flex: none;
	}

	.name {
		flex: 1;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.val {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text);
		line-height: 1.15;
	}

	.val small {
		font-size: 0.64rem;
		font-weight: 500;
		color: #d8b4fe;
	}

	.complete {
		color: var(--success);
	}

	.switch {
		position: relative;
		width: 26px;
		height: 15px;
		flex: none;
		border-radius: 999px;
		background: var(--border-strong);
		transition: background 0.15s;
	}

	.switch::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #cbd5e1;
		transition: transform 0.15s;
	}

	.switch.on {
		background: var(--gold);
	}

	.switch.on::after {
		transform: translateX(11px);
		background: #fff;
	}

	.bosses {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		gap: 4px;
		margin-top: 2px;
	}

	.boss {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: 6px;
		align-items: center;
		padding: 5px 7px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--panel);
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}

	.boss:hover {
		background: var(--panel-hover);
	}

	.boss.on {
		border-color: #7dd3fc;
		background: rgba(125, 211, 252, 0.08);
	}

	.boss img {
		grid-row: 1 / span 3;
		width: 22px;
		height: 22px;
		border-radius: 5px;
	}

	.bname {
		font-size: 0.74rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bval {
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.btime {
		grid-column: 2;
		font-size: 0.62rem;
		color: #7dd3fc;
	}

	.boss:not(:has(img)) .bname,
	.boss:not(:has(img)) .bval {
		grid-column: span 2;
	}
</style>
