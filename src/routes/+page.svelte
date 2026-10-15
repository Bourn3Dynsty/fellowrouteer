<script lang="ts">
	import { onMount } from 'svelte';
	import { dungeonList } from '$lib/data/dungeons';
	import { allRoutes } from '$lib/route/storage';

	const groups = [
		{ type: 'dungeon', title: 'Dungeons' },
		{ type: 'capstone', title: 'Capstone Dungeons' },
		{ type: 'adventure', title: 'Adventures' }
	] as const;

	let query = $state('');
	let saved = $state<Record<string, number>>({});

	onMount(() => {
		const counts: Record<string, number> = {};
		for (const r of allRoutes()) counts[r.dungeon] = (counts[r.dungeon] ?? 0) + 1;
		saved = counts;
	});

	let filtered = $derived(
		dungeonList.filter((d) => {
			const q = query.trim().toLowerCase();
			return !q || d.name.toLowerCase().includes(q) || d.enemies.some((e) => e.name.toLowerCase().includes(q));
		})
	);

	const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<svelte:head>
	<title>Fellowroute (beta) · Fellowship route planner</title>
	<meta name="description" content="Plan Fellowship dungeon routes on the real in-game maps, with every enemy, kill score and relic." />
</svelte:head>

<div class="page">
	<header class="hero">
		<div class="hero-inner">
			<h1 class="display">Fellowroute <span class="beta-tag hero-beta">Beta</span></h1>
			<p>Plan Fellowship dungeon routes on the real in-game maps, with every pack, kill score and relic.</p>
			<div class="hero-actions">
				<input type="search" placeholder="Search dungeons or enemies…" bind:value={query} aria-label="Search" />
				<a class="btn" href="/routes">My routes</a>
			</div>
			<p class="beta-note">
				Public beta. The data comes straight from the game files and some of it is still incomplete
				(stun immunity in particular). Routes are saved in your browser, so keep a share link for anything important.
			</p>
		</div>
	</header>

	<main>
		{#each groups as group}
			{@const list = filtered.filter((d) => d.type === group.type)}
			{#if list.length}
				<section>
					<h2 class="display">{group.title}</h2>
					<div class="grid">
						{#each list as d (d.slug)}
							<a class="card" href="/planner/{d.slug}">
								<div class="art" style:background-image={d.art?.codex ? `url(${d.art.codex})` : undefined}>
									{#if saved[d.slug]}<span class="saved">{saved[d.slug]} saved</span>{/if}
								</div>
								<div class="card-body">
									<h3 class="display">{d.name}</h3>
									<div class="stats">
										<span><strong>{d.requiredScore}</strong> score</span>
										{#if d.timeLimit}<span>{fmtTime(d.timeLimit)}</span>{/if}
										<span>{d.enemyPositions.length} enemies</span>
										{#if d.floors.length > 1}<span>{d.floors.length} maps</span>{/if}
									</div>
									<div class="bosses">
										{#each d.enemies.filter((e) => e.type === 'boss') as b (b.id)}
											{#if b.icon}<img src={b.icon} alt={b.name} title={b.name} />{/if}
										{/each}
									</div>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
		{#if !filtered.length}
			<p class="empty">No dungeons match “{query}”.</p>
		{/if}
	</main>

	<footer>
		Maps, enemies and kill scores are extracted from the game client. Fellowroute is a fan project and isn't affiliated with Chief Rebel.
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.hero {
		position: relative;
		padding: 72px 24px 56px;
		text-align: center;
		background:
			linear-gradient(180deg, rgba(11, 14, 20, 0.55) 0%, rgba(11, 14, 20, 0.85) 70%, var(--bg) 100%),
			url('/art/banner/cithrels-fall.webp') center 40% / cover no-repeat;
		border-bottom: 1px solid var(--border);
	}

	.hero-inner {
		max-width: 720px;
		margin: 0 auto;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.4rem, 6vw, 3.6rem);
		color: var(--gold-bright);
		text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
	}

	.hero-beta {
		font-size: 0.8rem;
		margin-left: 6px;
		position: relative;
		top: -0.4em;
	}

	.hero .beta-note {
		margin: 18px auto 0;
		max-width: 560px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.hero p {
		margin: 10px 0 26px;
		font-size: 1.05rem;
		color: #cfd5e1;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
	}

	.hero-actions {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.hero-actions input {
		width: min(380px, 70vw);
		height: 38px;
		padding: 0 14px;
		border-radius: 9px;
		border: 1px solid var(--border-strong);
		background: rgba(16, 20, 29, 0.9);
		color: var(--text);
		outline: none;
	}

	.hero-actions input:focus {
		border-color: var(--gold-dim);
	}

	.hero-actions .btn {
		height: 38px;
		background: rgba(26, 33, 48, 0.92);
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 1240px;
		margin: 0 auto;
		padding: 16px 24px 48px;
	}

	section {
		margin-top: 28px;
	}

	h2 {
		margin: 0 0 14px;
		font-size: 1.05rem;
		color: var(--gold);
		letter-spacing: 0.06em;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 16px;
	}

	.card {
		display: flex;
		flex-direction: column;
		border-radius: 12px;
		overflow: hidden;
		background: var(--panel);
		border: 1px solid var(--border);
		text-decoration: none;
		transition: transform 0.15s ease, border-color 0.15s, box-shadow 0.15s;
	}

	.card:hover {
		transform: translateY(-3px);
		border-color: var(--gold-dim);
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
	}

	.art {
		position: relative;
		aspect-ratio: 3 / 1;
		background: var(--panel-2) center / cover no-repeat;
	}

	.art::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, transparent 50%, rgba(20, 26, 37, 0.9));
	}

	.saved {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 1;
		padding: 2px 8px;
		border-radius: 10px;
		background: rgba(11, 14, 20, 0.85);
		border: 1px solid var(--gold-dim);
		color: var(--gold-bright);
		font-size: 0.7rem;
		font-weight: 600;
	}

	.card-body {
		padding: 10px 14px 14px;
	}

	h3 {
		margin: 0 0 6px;
		font-size: 1.02rem;
		color: var(--text);
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.stats strong {
		color: var(--gold-bright);
	}

	.bosses {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}

	.bosses img {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 2px solid var(--gold-dim);
	}

	.empty {
		margin-top: 40px;
		text-align: center;
		color: var(--text-muted);
	}

	footer {
		padding: 22px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-faint);
		border-top: 1px solid var(--border);
	}
</style>
