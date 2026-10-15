<script lang="ts">
	import { onMount } from 'svelte';
	import { dungeons } from '$lib/data/dungeons';
	import { allRoutes, deleteRoute, setActiveRoute } from '$lib/route/storage';
	import type { RouteDoc } from '$lib/route/model';

	let routes = $state<RouteDoc[]>([]);
	onMount(() => (routes = allRoutes()));

	function score(r: RouteDoc) {
		const d = dungeons[r.dungeon];
		if (!d) return { total: 0, pct: 0 };
		const byId = new Map(d.enemyPositions.map((s) => [s.id, s.enemyId]));
		const scoreOf = new Map(d.enemies.map((e) => [e.id, e.score]));
		const chickens = new Set(r.chickens);
		let total = 0;
		for (const p of r.pulls)
			for (const s of p.spawns) if (!chickens.has(s)) total += scoreOf.get(byId.get(s) ?? '') ?? 0;
		return { total, pct: (total / d.requiredScore) * 100 };
	}

	function open(r: RouteDoc) {
		setActiveRoute(r.dungeon, r.id);
	}

	function remove(r: RouteDoc) {
		if (!confirm(`Delete “${r.name}”?`)) return;
		deleteRoute(r.id);
		routes = allRoutes();
	}

	const ago = (t: number) => {
		const s = (Date.now() - t) / 1000;
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)} min ago`;
		if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
		return new Date(t).toLocaleDateString();
	};
</script>

<svelte:head>
	<title>My routes · Fellowroute (beta)</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href="/">← All dungeons</a>
		<h1 class="display">My routes</h1>
		<p>Routes are saved in this browser. Use <b>Share</b> in the planner to send one to your group.</p>
	</header>

	{#if routes.length}
		<div class="list">
			{#each routes as r (r.id)}
				{@const d = dungeons[r.dungeon]}
				{@const s = score(r)}
				{#if d}
					<div class="row">
						<a class="main" href="/planner/{r.dungeon}" onclick={() => open(r)}>
							<div class="thumb" style:background-image={d.art?.codex ? `url(${d.art.codex})` : undefined}></div>
							<div class="info">
								<div class="name">{r.name}</div>
								<div class="meta">{d.name} · {r.pulls.length} pulls · updated {ago(r.updatedAt)}</div>
							</div>
							<div class="pct" class:complete={s.pct >= 100}>
								<strong>{s.pct.toFixed(1)}%</strong>
								<span>{s.total}/{d.requiredScore}</span>
							</div>
						</a>
						<button class="btn ghost icon" title="Delete" aria-label="Delete {r.name}" onclick={() => remove(r)}>✕</button>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<div class="empty">
			<p>No saved routes yet.</p>
			<a class="btn primary" href="/">Pick a dungeon</a>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 860px;
		margin: 0 auto;
		padding: 36px 24px 60px;
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.85rem;
	}

	.back:hover {
		color: var(--gold-bright);
	}

	h1 {
		margin: 14px 0 4px;
		color: var(--gold-bright);
		font-size: 1.9rem;
	}

	header p {
		color: var(--text-muted);
		margin: 0 0 24px;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding-right: 8px;
		transition: border-color 0.12s;
	}

	.row:hover {
		border-color: var(--gold-dim);
	}

	.main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px;
		text-decoration: none;
		min-width: 0;
	}

	.thumb {
		width: 120px;
		height: 40px;
		flex: none;
		border-radius: 6px;
		background: var(--panel-2) center / cover;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 600;
	}

	.meta {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 2px;
	}

	.pct {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-variant-numeric: tabular-nums;
	}

	.pct strong {
		font-size: 1.05rem;
	}

	.pct span {
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.pct.complete strong {
		color: var(--success);
	}

	.empty {
		text-align: center;
		padding: 60px 0;
		color: var(--text-muted);
	}
</style>
