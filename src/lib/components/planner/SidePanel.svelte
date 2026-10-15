<script lang="ts">
	import { fmtHealth } from '$lib/data/levels';
	import type { RouteEditor } from '$lib/route/editor.svelte';
	import { relics, relicById } from '$lib/data/relics';
	import EfficiencyPanel from './EfficiencyPanel.svelte';

	interface Props {
		editor: RouteEditor;
		onTool?: (tool: 'stealth' | 'portal') => void;
		/** Show spawns on the map. */
		onFocus?: (spawnIds: string[]) => void;
	}

	let { editor, onTool, onFocus }: Props = $props();
	let tab = $state<'enemies' | 'efficiency' | 'relics'>('enemies');
	let pinned = $state<string | null>(null);
	let filter = $state<'all' | 'kick' | 'immune'>('all');

	function pin(id: string, spawns: string[]) {
		pinned = pinned === id ? null : id;
		editor.pinned = pinned ? new Set(spawns) : null;
	}

	function hover(spawns: string[] | null) {
		editor.highlight = spawns ? new Set(spawns) : null;
	}
	const chickenIcon = relicById.chicken?.icon;

	let roster = $derived.by(() => {
		const rows = editor.dungeon.enemies.map((e) => ({ enemy: e, total: 0, taken: 0, chickens: 0, spawns: [] as string[] }));
		const byId = new Map(rows.map((r) => [r.enemy.id, r]));
		for (const s of editor.dungeon.enemyPositions) {
			const r = byId.get(s.enemyId);
			if (!r || editor.isRemoved(s.id)) continue;
			r.total++;
			r.spawns.push(s.id);
			if (editor.chickens.has(s.id)) r.chickens++;
			else if (editor.owner.has(s.id)) r.taken++;
		}
		return rows
			.filter((r) => r.total)
			.sort((a, b) => (a.enemy.type === 'boss' ? 1 : 0) - (b.enemy.type === 'boss' ? 1 : 0) || b.enemy.score - a.enemy.score || a.enemy.name.localeCompare(b.enemy.name));
	});

	let available = $derived(editor.available);

	let usage = $derived({
		chicken: editor.doc.chickens.length,
		stealth: editor.doc.annotations.filter((a) => a.kind === 'stealth').length,
		portal: editor.doc.annotations.filter((a) => a.kind === 'portal').length
	});

	const howTo: Record<string, string> = {
		chicken: 'Right-click an enemy → Chickenize',
		stealth: 'Map tool: drag a stealth path (S)',
		portal: 'Map tool: drag from portal to exit (P)'
	};
</script>

<div class="panel">
	<div class="tabs" role="tablist">
		<button role="tab" aria-selected={tab === 'enemies'} class:active={tab === 'enemies'} onclick={() => (tab = 'enemies')}>Enemies</button>
		<button role="tab" aria-selected={tab === 'efficiency'} class:active={tab === 'efficiency'} onclick={() => (tab = 'efficiency')}>Efficiency</button>
		<button role="tab" aria-selected={tab === 'relics'} class:active={tab === 'relics'} onclick={() => (tab = 'relics')}>Relics</button>
	</div>

	{#if tab === 'efficiency'}
		<EfficiencyPanel {editor} {onFocus} />
	{/if}

	{#if tab === 'enemies'}
		<div class="summary">
			<span>{available} score on the map</span>
			<span class="muted">need {editor.dungeon.requiredScore} ({((editor.dungeon.requiredScore / available) * 100).toFixed(0)}%)</span>
		</div>
		<div class="filters">
			<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
			<button class:active={filter === 'kick'} onclick={() => (filter = 'kick')}><span class="b kick"></span>Kickable</button>
			<button class:active={filter === 'immune'} onclick={() => (filter = 'immune')}><span class="b immune"></span>Stun immune</button>
		</div>
		<div class="list">
			{#each roster.filter((r) => filter === 'all' || (filter === 'kick' ? r.enemy.abilities.some((a) => a.interruptible) : r.enemy.stunImmune && r.enemy.type !== 'boss')) as r (r.enemy.id)}
				<div
					class="enemy"
					class:pinned={pinned === r.enemy.id}
					role="button"
					tabindex="0"
					title="Click to keep these highlighted on the map"
					onclick={() => pin(r.enemy.id, r.spawns)}
					onkeydown={(e) => e.key === 'Enter' && pin(r.enemy.id, r.spawns)}
					onmouseenter={() => hover(r.spawns)}
					onmouseleave={() => hover(null)}
				>
					{#if r.enemy.icon}<img src={r.enemy.icon} alt="" />{/if}
					<div class="info">
						<div class="name">
							{r.enemy.name}
							{#if r.enemy.type === 'boss'}<span class="tag boss">Boss</span>{:else if r.enemy.elite}<span class="tag elite">Elite</span>{/if}
						</div>
						<div class="meta">
							{#if r.enemy.type !== 'boss'}
								<span><strong>{r.enemy.score}</strong> score · {editor.pct(r.enemy.score).toFixed(2)}%</span>
								<span title="Health{editor.level ? ` at key level ${editor.level}` : ' at level 1'}">{fmtHealth(editor.enemyHealth(r.enemy))} HP</span>
							{:else}
								<span>No kill score</span>
							{/if}
						</div>
						{#if r.enemy.abilities.length}
							<div class="abilities">
								{#each r.enemy.abilities.filter((a) => a.interruptible || a.ccOnly) as a}
									<span class="ab" class:kick={a.interruptible} title={a.interruptible ? 'Interruptible' : 'Stun to stop'}>{a.name}</span>
								{/each}
								{#if r.enemy.stunImmune && r.enemy.type !== 'boss'}<span class="ab immune">Stun immune</span>{/if}
							</div>
						{:else if r.enemy.stunImmune && r.enemy.type !== 'boss'}
							<div class="abilities"><span class="ab immune">Stun immune</span></div>
						{/if}
						{#if r.enemy.type !== 'boss'}
							<div class="bar"><div style="width:{(r.taken / r.total) * 100}%"></div></div>
						{/if}
					</div>
					<div class="counts" title="Killed in route / on the map">
						<span><strong>{r.taken}</strong>/{r.total}</span>
						{#if r.chickens}<span class="chick" title="Chickenized">+{r.chickens}{#if chickenIcon}<img src={chickenIcon} alt="chickenized" />{/if}</span>{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else if tab === 'relics'}
		<div class="list">
			<p class="intro">Relics are trinkets each hero brings. These change how a route plays out.</p>
			{#each relics as relic (relic.id)}
				{@const used = usage[relic.id as keyof typeof usage]}
				<div class="relic" class:key={relic.id in howTo}>
					{#if relic.icon}<img src={relic.icon} alt="" />{/if}
					<div class="info">
						<div class="name">
							{relic.name}
							{#if used !== undefined}<span class="used" class:zero={!used}>{used} in route</span>{/if}
						</div>
						<div class="desc">{relic.description}</div>
						{#if howTo[relic.id]}
							<div class="how">
								{howTo[relic.id]}
								{#if relic.id === 'stealth' || relic.id === 'portal'}
									<button class="link" onclick={() => onTool?.(relic.id as 'stealth' | 'portal')}>Use tool</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.tabs {
		display: flex;
		gap: 2px;
		padding: 8px 10px 0;
		border-bottom: 1px solid var(--border);
	}

	.tabs button {
		padding: 8px 12px;
		border: none;
		background: none;
		color: var(--text-muted);
		font-weight: 600;
		font-size: 0.82rem;
		border-bottom: 2px solid transparent;
		cursor: pointer;
	}

	.tabs button.active {
		color: var(--gold-bright);
		border-bottom-color: var(--gold);
	}

	.summary {
		display: flex;
		justify-content: space-between;
		padding: 10px 14px;
		font-size: 0.78rem;
		border-bottom: 1px solid var(--border);
	}

	.muted {
		color: var(--text-faint);
	}

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.enemy,
	.relic {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 7px 8px;
		border-radius: var(--radius);
	}

	.enemy {
		cursor: pointer;
	}

	.enemy:hover {
		background: var(--panel-hover);
	}

	.enemy.pinned {
		background: rgba(217, 173, 91, 0.08);
		box-shadow: inset 0 0 0 1px var(--gold-dim);
	}

	.filters {
		display: flex;
		gap: 4px;
		padding: 8px 10px 0;
	}

	.filters button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: none;
		color: var(--text-muted);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.filters button.active {
		border-color: var(--gold-dim);
		color: var(--gold-bright);
	}

	.b {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.b.kick {
		background: #3b82f6;
	}

	.b.immune {
		background: #d97706;
	}

	.abilities {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-top: 4px;
	}

	.ab {
		font-size: 0.65rem;
		padding: 1px 6px;
		border-radius: 4px;
		background: rgba(113, 113, 122, 0.25);
		color: #d4d4d8;
	}

	.ab.kick {
		background: rgba(29, 78, 216, 0.25);
		color: #93c5fd;
	}

	.ab.immune {
		background: rgba(180, 83, 9, 0.22);
		color: #fdba74;
	}

	.enemy img,
	.relic img {
		width: 38px;
		height: 38px;
		border-radius: 8px;
		border: 1px solid var(--border-strong);
		flex: none;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 600;
		font-size: 0.84rem;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.meta {
		display: flex;
		gap: 10px;
		font-size: 0.74rem;
		color: var(--text-muted);
		margin-top: 1px;
	}

	.meta strong {
		color: var(--gold-bright);
	}

	.bar {
		height: 3px;
		margin-top: 5px;
		background: var(--border);
		border-radius: 2px;
		overflow: hidden;
	}

	.bar div {
		height: 100%;
		background: var(--gold);
		transition: width 0.2s;
	}

	.counts {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-align: right;
		font-variant-numeric: tabular-nums;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.counts strong {
		color: var(--text);
	}

	.chick {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.68rem;
		color: #fdba74;
	}

	.chick img {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: none;
	}

	.tag {
		font-size: 0.6rem;
		padding: 1px 5px;
		border-radius: 4px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.tag.boss {
		background: #3b2a0c;
		color: var(--gold-bright);
	}

	.tag.elite {
		background: #2b2310;
		color: var(--gold);
	}

	.intro {
		margin: 4px 6px 8px;
		color: var(--text-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}

	.relic {
		align-items: flex-start;
	}

	.relic.key {
		background: rgba(217, 173, 91, 0.05);
		border: 1px solid rgba(217, 173, 91, 0.14);
	}

	.desc {
		font-size: 0.76rem;
		color: var(--text-muted);
		line-height: 1.4;
		margin-top: 2px;
	}

	.how {
		margin-top: 5px;
		font-size: 0.72rem;
		color: var(--gold);
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--gold-bright);
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
	}

	.used {
		font-size: 0.66rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 9px;
		background: rgba(34, 197, 94, 0.15);
		color: #86efac;
	}

	.used.zero {
		background: var(--panel-hover);
		color: var(--text-faint);
	}
</style>
